import logging
from typing import Dict, Optional
from pathlib import Path

from haystack import Pipeline
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.document_stores.types import DuplicatePolicy
from haystack.utils import Secret
from haystack.components.converters import (
    TextFileToDocument,
    PyPDFToDocument,
    HTMLToDocument,
    MarkdownToDocument,
    CSVToDocument,
    DOCXToDocument,
    XLSXToDocument
)
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.embedders import OpenAIDocumentEmbedder
from haystack.components.writers import DocumentWriter

from app.pipelines.indexing import create_url_indexing_pipeline
from app.pipelines.query import create_query_pipeline
from app.pipelines.hybrid_query import create_hybrid_query_pipeline, create_filtered_query_pipeline
from app.pipelines.enhanced_query import create_enhanced_query_pipeline
from app.pipelines.table_aware_query import create_table_aware_query_pipeline
from app.components.semantic_splitter import SemanticDocumentSplitter
from app.components.propositions_splitter import PropositionsDocumentSplitter
from app.components.table_aware_splitter import TableAwareDocumentSplitter
from app.core.config import settings

logger = logging.getLogger(__name__)

class PipelineProvider:
    """Provides creation and caching for Haystack pipelines."""

    def __init__(self, document_store):
        self.document_store = document_store
        self.query_pipelines_cache: Dict[str, Pipeline] = {}
        self.hybrid_pipelines_cache: Dict[str, Pipeline] = {}
        self.filtered_pipelines_cache: Dict[str, Pipeline] = {}
        self.enhanced_pipelines_cache: Dict[str, Pipeline] = {}
        self.table_aware_pipelines_cache: Dict[str, Pipeline] = {}
        self.file_indexing_pipelines_cache: Dict[str, Pipeline] = {}
        self._initialize_file_indexing_pipelines()

    def get_query_pipeline(
        self,
        model: str,
        provider: str,
        retrieval_mode: str,
        filters: Optional[Dict] = None,
        query_config: Optional[Dict] = None
    ) -> Pipeline:
        """Get the appropriate query pipeline based on configuration."""
        config = query_config or {}
        use_enhanced = config.get("use_enhanced_pipeline", settings.USE_ENHANCED_PIPELINE)
        use_table_aware = config.get("use_table_aware_pipeline", False) # is_table_query check will be done in manager

        if use_table_aware:
            return self._get_or_create_pipeline("table_aware", model, provider)
        
        if use_enhanced:
            enable_query_expansion = config.get("enable_query_expansion", settings.ENABLE_QUERY_EXPANSION)
            enable_source_filtering = config.get("enable_source_filtering", settings.ENABLE_SOURCE_FILTERING)
            enable_diversity_ranking = config.get("enable_diversity_ranking", settings.ENABLE_DIVERSITY_RANKING)
            return self._get_or_create_enhanced_pipeline(
                model, provider,
                enable_query_expansion=enable_query_expansion,
                enable_source_filtering=enable_source_filtering,
                enable_diversity_ranking=enable_diversity_ranking
            )

        if filters:
            return self._get_or_create_pipeline("filtered", model, provider)
        
        if retrieval_mode == "hybrid" and isinstance(self.document_store, InMemoryDocumentStore):
            return self._get_or_create_pipeline("hybrid", model, provider)

        return self._get_or_create_pipeline("query", model, provider)

    def get_file_indexing_pipeline(self, file_extension: str) -> Pipeline:
        """Get a cached or new file indexing pipeline."""
        if file_extension not in self.file_indexing_pipelines_cache:
            logger.info(f"Creating new pipeline for uncached extension: {file_extension}")
            self.file_indexing_pipelines_cache[file_extension] = self._create_file_indexing_pipeline(file_extension)
        else:
            logger.debug(f"Using cached pipeline for {file_extension}")
        return self.file_indexing_pipelines_cache[file_extension]

    def get_url_indexing_pipeline(self, **kwargs) -> Pipeline:
        """Create a URL indexing pipeline with dynamic settings."""
        return create_url_indexing_pipeline(document_store=self.document_store, **kwargs)

    def _get_or_create_pipeline(self, pipeline_type: str, model: str, provider: str) -> Pipeline:
        cache_map = {
            "query": self.query_pipelines_cache,
            "hybrid": self.hybrid_pipelines_cache,
            "filtered": self.filtered_pipelines_cache,
            "table_aware": self.table_aware_pipelines_cache
        }
        creation_map = {
            "query": create_query_pipeline,
            "hybrid": create_hybrid_query_pipeline,
            "filtered": create_filtered_query_pipeline,
            "table_aware": create_table_aware_query_pipeline
        }

        cache = cache_map.get(pipeline_type)
        if cache is None:
            raise ValueError(f"Unknown pipeline type: {pipeline_type}")

        cache_key = f"{model}_{provider}"
        if cache_key not in cache:
            logger.info(f"Creating new {pipeline_type} pipeline for model: {model}")
            creator_func = creation_map[pipeline_type]
            # Table-aware pipeline doesn't use provider parameter
            if pipeline_type == "table_aware":
                cache[cache_key] = creator_func(self.document_store, model=model)
            else:
                cache[cache_key] = creator_func(self.document_store, model=model, provider=provider)
        else:
            logger.info(f"Using cached {pipeline_type} pipeline for model: {model}")
        return cache[cache_key]

    def _get_or_create_enhanced_pipeline(self, model: str, provider: str, **kwargs) -> Pipeline:
        cache_key = f"{model}_{provider}_{kwargs.get('enable_query_expansion')}_{kwargs.get('enable_source_filtering')}_{kwargs.get('enable_diversity_ranking')}"
        if cache_key not in self.enhanced_pipelines_cache:
            logger.info(f"Creating new enhanced pipeline for model: {model}")
            self.enhanced_pipelines_cache[cache_key] = create_enhanced_query_pipeline(
                self.document_store, model=model, provider=provider, **kwargs
            )
        else:
            logger.info(f"Using cached enhanced pipeline for model: {model}")
        return self.enhanced_pipelines_cache[cache_key]

    def _initialize_file_indexing_pipelines(self):
        common_extensions = [
            ".txt", ".text", ".pdf", ".html", ".htm", ".md", ".markdown",
            ".csv", ".docx", ".doc", ".xlsx", ".xls", ".json", ".jsonl"
        ]
        logger.info("Initializing file indexing pipelines...")
        for ext in common_extensions:
            try:
                self.file_indexing_pipelines_cache[ext] = self._create_file_indexing_pipeline(ext)
                logger.debug(f"Cached pipeline for {ext}")
            except Exception as e:
                logger.warning(f"Failed to create pipeline for {ext}: {e}")
        logger.info(f"Cached {len(self.file_indexing_pipelines_cache)} file indexing pipelines")

    def _create_file_indexing_pipeline(self, file_extension: str) -> Pipeline:
        """Create a pipeline for a specific file type using Haystack's built-in converters."""
        pipeline = Pipeline()
        
        # Select converter based on file extension
        converters = {
            ".txt": TextFileToDocument(), ".text": TextFileToDocument(),
            ".pdf": PyPDFToDocument(),
            ".html": HTMLToDocument(), ".htm": HTMLToDocument(),
            ".md": MarkdownToDocument(), ".markdown": MarkdownToDocument(),
            ".csv": CSVToDocument(),
            ".docx": DOCXToDocument(), ".doc": DOCXToDocument(),
            ".xlsx": XLSXToDocument(), ".xls": XLSXToDocument(),
            ".json": TextFileToDocument(), ".jsonl": TextFileToDocument()
        }
        converter = converters.get(file_extension, TextFileToDocument())
        
        pipeline.add_component("converter", converter)
        pipeline.add_component("cleaner", DocumentCleaner(
            remove_empty_lines=True,
            remove_extra_whitespaces=True,
            remove_repeated_substrings=True
        ))
        
        # Select splitter based on configuration
        if settings.CHUNKING_STRATEGY == "semantic":
            pipeline.add_component("splitter", SemanticDocumentSplitter(
                min_chunk_size=settings.MIN_CHUNK_SIZE,
                max_chunk_size=settings.MAX_CHUNK_SIZE
            ))
        elif settings.CHUNKING_STRATEGY == "propositions":
            pipeline.add_component("splitter", PropositionsDocumentSplitter(
                min_chunk_size=settings.MIN_CHUNK_SIZE,
                max_chunk_size=settings.MAX_CHUNK_SIZE
            ))
        elif settings.CHUNKING_STRATEGY == "table_aware":
            has_tables = file_extension in [".csv", ".xlsx", ".xls", ".html", ".htm", ".md", ".markdown"]
            pipeline.add_component("splitter", TableAwareDocumentSplitter(
                split_length=settings.CHUNK_SIZE,
                split_overlap=settings.CHUNK_OVERLAP,
                split_by="word",
                preserve_tables=has_tables,
                use_semantic_splitting=False
            ))
        else:  # fixed/default
            pipeline.add_component("splitter", DocumentSplitter(
                split_by="word",
                split_length=settings.CHUNK_SIZE,
                split_overlap=settings.CHUNK_OVERLAP,
                split_threshold=0.1
            ))
            
        pipeline.add_component("embedder", OpenAIDocumentEmbedder(
            api_key=Secret.from_token(settings.OPENAI_API_KEY),
            model=settings.EMBEDDING_MODEL
        ))
        pipeline.add_component("writer", DocumentWriter(
            document_store=self.document_store,
            policy=DuplicatePolicy.OVERWRITE
        ))
        
        # Connect components
        pipeline.connect("converter.documents", "cleaner.documents")
        pipeline.connect("cleaner.documents", "splitter.documents")
        pipeline.connect("splitter.documents", "embedder.documents")
        pipeline.connect("embedder.documents", "writer.documents")
        
        return pipeline