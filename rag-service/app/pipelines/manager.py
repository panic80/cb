import logging
import asyncio
import uuid
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

from haystack import Pipeline
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.document_stores.types import DuplicatePolicy
from haystack.utils import Secret
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
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

from app.pipelines.indexing import (
    create_indexing_pipeline,
    create_url_indexing_pipeline,
    create_full_indexing_pipeline
)
from app.pipelines.query import create_query_pipeline
from app.pipelines.hybrid_query import create_hybrid_query_pipeline, create_filtered_query_pipeline
from app.pipelines.enhanced_query import create_enhanced_query_pipeline
from app.services.document_store import DocumentStoreService, InMemorySourceMetadataStore, DatabaseSourceMetadataStore
from app.services.conversation_store import ConversationStore, InMemoryConversationStore, DatabaseConversationStore
from app.components.semantic_splitter import SemanticDocumentSplitter
from app.components.propositions_splitter import PropositionsDocumentSplitter
from app.components.table_aware_splitter import TableAwareDocumentSplitter
from app.core.config import settings

logger = logging.getLogger(__name__)


class PipelineManager:
    """Manages Haystack pipelines and document store."""
    
    def __init__(self):
        self.document_store: Optional[InMemoryDocumentStore] = None
        self.document_store_service: Optional[DocumentStoreService] = None
        self.indexing_pipeline: Optional[Pipeline] = None
        self.url_indexing_pipeline: Optional[Pipeline] = None
        self.full_indexing_pipeline: Optional[Pipeline] = None
        self.query_pipelines_cache: Dict[str, Pipeline] = {}
        self.hybrid_pipelines_cache: Dict[str, Pipeline] = {}
        self.filtered_pipelines_cache: Dict[str, Pipeline] = {}
        self.enhanced_pipelines_cache: Dict[str, Pipeline] = {}
        # Cache for file indexing pipelines by file extension
        self.file_indexing_pipelines_cache: Dict[str, Pipeline] = {}
        self._initialized = False
        self.conversation_store: Optional[ConversationStore] = None
    
    async def initialize(self):
        """Initialize pipelines and document store."""
        try:
            logger.info("Initializing pipeline manager...")
            
            # Initialize document store
            if settings.VECTOR_STORE_TYPE == "memory":
                self.document_store = InMemoryDocumentStore(
                    embedding_similarity_function="cosine"
                )
            elif settings.VECTOR_STORE_TYPE == "pgvector":
                if not settings.DATABASE_URL:
                    raise ValueError("DATABASE_URL is required for pgvector document store")
                
                def _init_pg_store():
                    """Synchronous function to initialize the document store."""
                    logger.info("Initializing PgvectorDocumentStore...")
                    store = PgvectorDocumentStore(
                        connection_string=Secret.from_token(settings.DATABASE_URL),
                        table_name="documents",
                        embedding_dimension=3072,  # OpenAI text-embedding-3-large dimension
                        vector_function="cosine_similarity",
                        recreate_table=False,  # Preserve data across restarts
                        search_strategy="exact_search"
                    )
                    logger.info("PgvectorDocumentStore initialized successfully.")
                    return store
                
                # Run the blocking initialization in a separate thread to avoid freezing the event loop
                loop = asyncio.get_running_loop()
                self.document_store = await loop.run_in_executor(None, _init_pg_store)
            else:
                # TODO: Add support for Chroma
                raise NotImplementedError(f"Vector store type {settings.VECTOR_STORE_TYPE} not implemented yet")
            
            # Initialize metadata store based on configuration
            if settings.DATABASE_URL and settings.VECTOR_STORE_TYPE == "pgvector":
                # Use database for metadata storage when using pgvector
                metadata_store = DatabaseSourceMetadataStore(settings.DATABASE_URL)
                logger.info("Using database metadata store")
            else:
                # Use in-memory store for development/testing
                metadata_store = InMemorySourceMetadataStore()
                logger.info("Using in-memory metadata store")
            
            # Initialize document store service
            self.document_store_service = DocumentStoreService(self.document_store, metadata_store)
            
            # Initialize conversation store based on configuration
            if settings.DATABASE_URL and settings.VECTOR_STORE_TYPE == "pgvector":
                # Use database for conversation storage when using pgvector
                self.conversation_store = DatabaseConversationStore(settings.DATABASE_URL)
                logger.info("Using database conversation store")
            else:
                # Use in-memory store for development/testing
                self.conversation_store = InMemoryConversationStore()
                logger.info("Using in-memory conversation store")
            
            # Create pipelines
            # We'll create specific pipelines on demand for each file type
            # Note: URL indexing pipelines are created dynamically with custom settings
            self.url_indexing_pipeline = None  # Created on-demand
            
            # Query pipelines will be created dynamically based on model selection
            self.query_pipelines_cache = {}  # Cache for query pipelines by model
            self.hybrid_pipelines_cache = {}  # Cache for hybrid pipelines by model
            self.filtered_pipelines_cache = {}  # Cache for filtered pipelines by model
            self.enhanced_pipelines_cache = {}  # Cache for enhanced pipelines by model
            
            # Pre-create file indexing pipelines for common file types
            self._initialize_file_indexing_pipelines()
            
            self._initialized = True
            logger.info("Pipeline manager initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize pipeline manager: {e}", exc_info=True)
            raise
    
    async def cleanup(self):
        """Cleanup resources."""
        logger.info("Cleaning up pipeline manager...")
        if self.document_store_service:
            await self.document_store_service.cleanup()
        if self.conversation_store:
            await self.conversation_store.cleanup()
        self._initialized = False
    
    def is_initialized(self) -> bool:
        """Check if pipelines are initialized."""
        return self._initialized
    
    async def index_file(
        self,
        file_path: str,
        filename: str,
        content_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Index a file into the document store."""
        try:
            logger.info(f"Indexing file: {filename}")
            
            # Generate document ID
            doc_id = str(uuid.uuid4())
            
            # Prepare metadata
            doc_metadata = {
                "source_id": doc_id,
                "filename": filename,
                "content_type": content_type,
                "source": filename,
                "indexed_at": datetime.utcnow().isoformat(),
                **(metadata or {})
            }
            
            # Run indexing pipeline synchronously (Haystack 2.0 doesn't have async support yet)
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_indexing_pipeline,
                file_path,
                doc_metadata
            )
            
            # Store source metadata
            await self.document_store_service.store_source_metadata(
                source_id=doc_id,
                title=filename,
                source=filename,
                content_type=content_type,
                chunk_count=result["document_count"],
                metadata=metadata
            )
            
            return {
                "document_id": doc_id,
                "chunk_count": result["document_count"],
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Failed to index file: {e}", exc_info=True)
            raise
    
    async def index_url(
        self,
        url: str,
        metadata: Optional[Dict[str, Any]] = None,
        enable_crawling: bool = True,
        max_depth: Optional[int] = None,
        max_pages: Optional[int] = None,
        follow_external_links: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Index content from a URL."""
        try:
            logger.info(f"Indexing URL: {url}")
            
            # Generate document ID
            doc_id = str(uuid.uuid4())
            
            # Prepare metadata
            doc_metadata = {
                "source_id": doc_id,
                "url": url,
                "source": url,
                "content_type": "text/html",
                "indexed_at": datetime.utcnow().isoformat(),
                **(metadata or {})
            }
            
            # Run indexing pipeline for URL
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_url_indexing_pipeline,
                url,
                doc_metadata,
                enable_crawling,
                max_depth,
                max_pages,
                follow_external_links
            )
            
            # Store source metadata
            await self.document_store_service.store_source_metadata(
                source_id=doc_id,
                title=url,
                source=url,
                content_type="text/html",
                chunk_count=result["document_count"],
                metadata=metadata
            )
            
            return {
                "document_id": doc_id,
                "chunk_count": result["document_count"],
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Failed to index URL: {e}", exc_info=True)
            raise
    
    async def query(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None,
        query_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a query against the document store."""
        try:
            logger.info(f"Executing query: {query[:50]}... with model: {model}, provider: {provider}")
            
            # Generate conversation ID if not provided
            if not conversation_id:
                conversation_id = str(uuid.uuid4())
            
            # Get conversation history
            conversation_history = await self.conversation_store.get_conversation(conversation_id)
            
            # Run query pipeline synchronously
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_query_pipeline,
                query,
                conversation_history,
                model,
                retrieval_mode,
                filters,
                query_config
            )
            
            # Update conversation history
            await self.conversation_store.add_to_conversation(conversation_id, [
                {"role": "user", "content": query},
                {"role": "assistant", "content": result["answer"]}
            ])
            
            return {
                "answer": result["answer"],
                "sources": result.get("sources", []),
                "conversation_id": conversation_id
            }
            
        except Exception as e:
            logger.error(f"Failed to execute query: {e}", exc_info=True)
            raise
    
    async def stream_query(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute a streaming query against the document store."""
        try:
            logger.info(f"Executing streaming query: {query[:50]}...")
            
            # Generate conversation ID if not provided
            if not conversation_id:
                conversation_id = str(uuid.uuid4())
            
            # Get conversation history
            conversation_history = await self.conversation_store.get_conversation(conversation_id)
            
            # Run streaming query pipeline
            full_response = ""
            async for chunk in self._stream_query_pipeline(query, conversation_history, model, retrieval_mode, filters):
                if chunk["type"] == "content":
                    full_response += chunk["content"]
                yield chunk
            
            # Update conversation history after streaming completes
            await self.conversation_store.add_to_conversation(conversation_id, [
                {"role": "user", "content": query},
                {"role": "assistant", "content": full_response}
            ])
            
        except Exception as e:
            logger.error(f"Failed to execute streaming query: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}
    
    async def list_sources(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """List all sources in the document store."""
        try:
            return await self.document_store_service.list_sources(limit=limit, offset=offset)
        except Exception as e:
            logger.error(f"Failed to list sources: {e}", exc_info=True)
            raise
    
    async def get_source(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific source."""
        try:
            return await self.document_store_service.get_source(source_id)
        except Exception as e:
            logger.error(f"Failed to get source: {e}", exc_info=True)
            raise
    
    async def delete_source(self, source_id: str) -> Dict[str, Any]:
        """Delete a source and all its documents."""
        try:
            # Find documents with matching source metadata
            all_docs = self.document_store.filter_documents()
            docs_to_delete = []
            
            for doc in all_docs:
                # Check if document belongs to this source
                # Try multiple ways to match the source
                doc_source = doc.meta.get("source")
                doc_source_id = doc.meta.get("source_id") 
                doc_filename = doc.meta.get("filename")
                doc_url = doc.meta.get("url")
                
                if (doc_source == source_id or 
                    doc_source_id == source_id or
                    doc_filename == source_id or
                    (source_id == "unknown" and doc_source is None) or
                    (source_id == "unknown" and doc_url and "haystack" in doc_url)):
                    docs_to_delete.append(doc.id)
                    logger.info(f"Found document to delete: {doc.id} for source {source_id}")
            
            # Delete documents by IDs
            deleted_count = 0
            if docs_to_delete:
                try:
                    self.document_store.delete_documents(document_ids=docs_to_delete)
                    deleted_count = len(docs_to_delete)
                except Exception as e:
                    logger.warning(f"Error deleting documents: {e}")
                    # Try alternative method
                    for doc_id in docs_to_delete:
                        try:
                            self.document_store.delete_documents(document_ids=[doc_id])
                            deleted_count += 1
                        except:
                            continue
            
            # Delete source metadata
            success = await self.document_store_service.delete_source(source_id)
            
            return {
                "success": True,
                "documents_deleted": deleted_count
            }
            
        except Exception as e:
            logger.error(f"Failed to delete source: {e}", exc_info=True)
            raise
    
    async def get_document_count(self) -> int:
        """Get total document count."""
        try:
            return self.document_store.count_documents()
        except Exception as e:
            logger.error(f"Failed to get document count: {e}", exc_info=True)
            return 0
    
    def _get_or_create_pipeline(self, pipeline_type: str, model: str, provider: str) -> Pipeline:
        """Get or create a pipeline based on type and model."""
        cache_key = f"{model}_{provider}"
        logger.info(f"Getting/creating {pipeline_type} pipeline for model: {model}, provider: {provider}, cache_key: {cache_key}")
        
        if pipeline_type == "query":
            if cache_key not in self.query_pipelines_cache:
                logger.info(f"Creating new query pipeline for model: {model}")
                self.query_pipelines_cache[cache_key] = create_query_pipeline(
                    self.document_store, model=model, provider=provider
                )
            else:
                logger.info(f"Using cached query pipeline for model: {model}")
            return self.query_pipelines_cache[cache_key]
        elif pipeline_type == "hybrid":
            if cache_key not in self.hybrid_pipelines_cache:
                self.hybrid_pipelines_cache[cache_key] = create_hybrid_query_pipeline(
                    self.document_store, model=model, provider=provider
                )
            return self.hybrid_pipelines_cache[cache_key]
        elif pipeline_type == "filtered":
            if cache_key not in self.filtered_pipelines_cache:
                self.filtered_pipelines_cache[cache_key] = create_filtered_query_pipeline(
                    self.document_store, model=model, provider=provider
                )
            return self.filtered_pipelines_cache[cache_key]
        else:
            raise ValueError(f"Unknown pipeline type: {pipeline_type}")
    
    def _get_or_create_enhanced_pipeline(
        self,
        model: str,
        provider: str,
        enable_query_expansion: bool = True,
        enable_source_filtering: bool = True,
        enable_diversity_ranking: bool = True
    ) -> Pipeline:
        """Get or create an enhanced pipeline with specific configuration."""
        cache_key = f"{model}_{provider}_{enable_query_expansion}_{enable_source_filtering}_{enable_diversity_ranking}"
        
        if cache_key not in self.enhanced_pipelines_cache:
            logger.info(f"Creating new enhanced pipeline for model: {model}")
            self.enhanced_pipelines_cache[cache_key] = create_enhanced_query_pipeline(
                self.document_store,
                model=model,
                provider=provider,
                enable_query_expansion=enable_query_expansion,
                enable_source_filtering=enable_source_filtering,
                enable_diversity_ranking=enable_diversity_ranking
            )
        else:
            logger.info(f"Using cached enhanced pipeline for model: {model}")
        
        return self.enhanced_pipelines_cache[cache_key]
    
    def _initialize_file_indexing_pipelines(self):
        """Pre-create and cache file indexing pipelines for common file types."""
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
    
    def _get_or_create_file_indexing_pipeline(self, file_extension: str) -> Pipeline:
        """Get cached pipeline or create new one if not found."""
        if file_extension not in self.file_indexing_pipelines_cache:
            logger.info(f"Creating new pipeline for uncached extension: {file_extension}")
            self.file_indexing_pipelines_cache[file_extension] = self._create_file_indexing_pipeline(file_extension)
        else:
            logger.debug(f"Using cached pipeline for {file_extension}")
        
        return self.file_indexing_pipelines_cache[file_extension]
    
    def _create_file_indexing_pipeline(self, file_extension: str) -> Pipeline:
        """Create a pipeline for a specific file type using Haystack's built-in converters."""
        pipeline = Pipeline()
        
        # Select converter based on file extension
        if file_extension in [".txt", ".text"]:
            converter = TextFileToDocument()
        elif file_extension == ".pdf":
            converter = PyPDFToDocument()
        elif file_extension in [".html", ".htm"]:
            converter = HTMLToDocument()
        elif file_extension in [".md", ".markdown"]:
            converter = MarkdownToDocument()
        elif file_extension == ".csv":
            converter = CSVToDocument()
        elif file_extension in [".docx", ".doc"]:
            converter = DOCXToDocument()
        elif file_extension in [".xlsx", ".xls"]:
            converter = XLSXToDocument()
        elif file_extension in [".json", ".jsonl"]:
            # JSON files handled as text for now
            converter = TextFileToDocument()
        else:
            # Default to text converter
            logger.warning(f"Unknown file extension {file_extension}, using text converter")
            converter = TextFileToDocument()
        
        # Add components to pipeline
        pipeline.add_component("converter", converter)
        pipeline.add_component("cleaner", DocumentCleaner(
            remove_empty_lines=True,
            remove_extra_whitespaces=True,
            remove_repeated_substrings=True  # Enable to fix text duplication issues
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
            # Check if file contains tables (for CSV, XLSX)
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
    
    def _run_indexing_pipeline(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Run the indexing pipeline synchronously."""
        # Get file extension
        from pathlib import Path
        file_extension = Path(file_path).suffix.lower()
        
        # Get cached pipeline for this file type
        pipeline = self._get_or_create_file_indexing_pipeline(file_extension)
        
        # Run the pipeline
        result = pipeline.run({
            "converter": {
                "sources": [file_path],
                "meta": metadata
            }
        })
        
        # Log the pipeline result for debugging
        logger.info(f"Pipeline result keys: {list(result.keys())}")
        
        # Get document count from writer output
        # In Haystack 2.0, DocumentWriter returns documents_written as an integer
        writer_result = result.get("writer", {})
        logger.info(f"Writer result: {writer_result}")
        
        # The DocumentWriter returns an integer count in documents_written
        doc_count = writer_result.get("documents_written", 0)
        
        logger.info(f"Document count after splitting: {doc_count}")
        
        return {
            "document_count": doc_count
        }
    
    def _run_url_indexing_pipeline(
        self, 
        url: str, 
        metadata: Dict[str, Any],
        enable_crawling: bool = True,
        max_depth: Optional[int] = None,
        max_pages: Optional[int] = None,
        follow_external_links: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Run the URL indexing pipeline synchronously with custom crawling settings."""
        
        logger.info(f"Running {'crawling' if enable_crawling else 'single-page'} pipeline for URL: {url}")
        logger.info(f"Crawling settings - depth: {max_depth}, pages: {max_pages}, external: {follow_external_links}")
        
        # Create a pipeline with the specified crawling settings
        logger.info(f"Creating pipeline with enable_crawling={enable_crawling}")
        pipeline = create_url_indexing_pipeline(
            document_store=self.document_store,
            enable_crawling=enable_crawling,
            max_depth=max_depth,
            max_pages=max_pages,
            follow_external_links=follow_external_links
        )
        
        # Log the component type for debugging
        fetcher_component = pipeline.get_component("fetcher")
        logger.info(f"Pipeline fetcher component type: {type(fetcher_component).__name__}")
        
        # Run the URL indexing pipeline
        result = pipeline.run({
            "fetcher": {
                "urls": [url]
            }
        })
        
        # Log the pipeline result for debugging
        logger.info(f"URL pipeline result keys: {list(result.keys())}")
        
        # Get document count from writer output
        writer_result = result.get("writer", {})
        logger.info(f"Writer result: {writer_result}")
        
        # The DocumentWriter returns an integer count in documents_written
        doc_count = writer_result.get("documents_written", 0)
        
        logger.info(f"Document count after splitting: {doc_count}")
        
        # Update documents with metadata
        if doc_count > 0:
            # TODO: Update documents in the store with the provided metadata
            # For now, we'll just return the count
            pass
        
        return {
            "document_count": doc_count
        }
    
    def _run_query_pipeline(
        self,
        query: str,
        conversation_history: List[Dict],
        model: str,
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None,
        query_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run the query pipeline synchronously."""
        # Default provider to openai if not specified
        provider = "openai"  # Currently only OpenAI is supported by Haystack
        
        # Parse query configuration - use settings defaults if not specified
        config = query_config or {}
        use_enhanced = config.get("use_enhanced_pipeline", settings.USE_ENHANCED_PIPELINE)
        enable_query_expansion = config.get("enable_query_expansion", settings.ENABLE_QUERY_EXPANSION)
        enable_source_filtering = config.get("enable_source_filtering", settings.ENABLE_SOURCE_FILTERING)
        enable_diversity_ranking = config.get("enable_diversity_ranking", settings.ENABLE_DIVERSITY_RANKING)
        source_filters = config.get("source_filters", None)
        preferred_sources = config.get("preferred_sources", None)
        
        # Use enhanced pipeline if requested
        if use_enhanced:
            pipeline = self._get_or_create_enhanced_pipeline(
                model, provider, enable_query_expansion, 
                enable_source_filtering, enable_diversity_ranking
            )
            
            # Build inputs for enhanced pipeline
            inputs = {
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
            
            # Add query expansion inputs if enabled
            if enable_query_expansion:
                inputs["query_expander"] = {"query": query}
            else:
                # If no query expansion, connect embedder directly
                inputs["embedder"] = {"text": query}
            
            # Add source filtering inputs if enabled
            if enable_source_filtering and source_filters:
                inputs["source_filter"] = {
                    "source_filters": source_filters,
                    "preferred_sources": preferred_sources
                }
            
            # Add retriever-specific inputs
            if isinstance(self.document_store, InMemoryDocumentStore):
                inputs["bm25_retriever"] = {"query": query}
            else:
                # For hybrid retriever
                inputs["hybrid_retriever"] = {"query": query}
                if filters:
                    inputs["hybrid_retriever"]["filters"] = filters
            
            # Similarity ranker always needs query
            inputs["similarity_ranker"] = {"query": query}
            
            if filters and isinstance(self.document_store, InMemoryDocumentStore):
                inputs["embedding_retriever"] = {"filters": filters}
            
            # Run the enhanced pipeline
            result = pipeline.run(inputs)
            
            # Extract enhanced results
            answer_builder_output = result.get("answer_builder", {})
            return {
                "answer": answer_builder_output.get("answer", ""),
                "sources": answer_builder_output.get("sources", []),
                "confidence_score": float(answer_builder_output.get("confidence_score", 0.0)),
                "metadata": answer_builder_output.get("metadata", {})
            }
        
        # Select pipeline based on retrieval mode and filters
        if filters:
            pipeline = self._get_or_create_pipeline("filtered", model, provider)
            inputs = {
                "embedder": {"text": query},
                "retriever": {"filters": filters},
                "similarity_ranker": {"query": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        elif retrieval_mode == "hybrid" and isinstance(self.document_store, InMemoryDocumentStore):
            pipeline = self._get_or_create_pipeline("hybrid", model, provider)
            inputs = {
                "embedder": {"text": query},
                "bm25_retriever": {"query": query},
                "ranker": {"query": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        else:
            # Default to standard embedding pipeline
            pipeline = self._get_or_create_pipeline("query", model, provider)
            inputs = {
                "embedder": {"text": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        
        # Run the selected pipeline
        result = pipeline.run(inputs)
        
        # Extract the answer from the answer_builder output
        answer_builder_output = result.get("answer_builder", {})
        return {
            "answer": answer_builder_output.get("answer", ""),
            "sources": answer_builder_output.get("sources", [])
        }
    
    async def _stream_query_pipeline(
        self,
        query: str,
        conversation_history: List[Dict],
        model: str,
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Run the query pipeline with streaming."""
        # TODO: Implement proper streaming with Haystack 2.0
        # For now, we'll simulate streaming by chunking the response
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            self._run_query_pipeline,
            query,
            conversation_history,
            model,
            retrieval_mode,
            filters
        )
        
        # Simulate streaming by chunking the response
        answer = result["answer"]
        chunk_size = 50  # Characters per chunk
        
        for i in range(0, len(answer), chunk_size):
            chunk = answer[i:i+chunk_size]
            yield {"type": "content", "content": chunk}
            await asyncio.sleep(0.01)  # Small delay to simulate streaming