import logging
from typing import List, Dict, Any
from pathlib import Path

from haystack import Pipeline, Document, component
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.embedders import OpenAIDocumentEmbedder
from haystack.components.writers import DocumentWriter
from haystack.components.converters import (
    TextFileToDocument,
    PyPDFToDocument,
    HTMLToDocument,
    MarkdownToDocument,
    CSVToDocument,
    DOCXToDocument,
    XLSXToDocument
)
from app.components.table_aware_converter import TableAwareHTMLConverter
from app.components.table_aware_splitter import TableAwareDocumentSplitter
from app.components.semantic_splitter import SemanticDocumentSplitter
from app.components.propositions_splitter import PropositionsDocumentSplitter
from haystack.components.fetchers import LinkContentFetcher
from haystack.components.joiners import DocumentJoiner
from haystack.document_stores.types import DuplicatePolicy
from haystack.utils import Secret

from app.core.config import settings

logger = logging.getLogger(__name__)


def create_indexing_pipeline(document_store) -> Pipeline:
    """Create the document indexing pipeline for a specific file type."""
    logger.info(f"Creating indexing pipeline with strategy: {settings.CHUNKING_STRATEGY}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # This will be used for specific file types by the manager
    # The manager will select the appropriate converter based on file type
    pipeline.add_component("converter", TextFileToDocument())
    
    # Add document processors
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
        pipeline.add_component("splitter", TableAwareDocumentSplitter(
            split_length=settings.CHUNK_SIZE,
            split_overlap=settings.CHUNK_OVERLAP,
            split_by="word",
            preserve_tables=True,
            use_semantic_splitting=False
        ))
    else:  # fixed/default
        pipeline.add_component("splitter", DocumentSplitter(
            split_by="word",
            split_length=settings.CHUNK_SIZE,
            split_overlap=settings.CHUNK_OVERLAP,
            split_threshold=0.1
        ))
    
    # Add embedder
    pipeline.add_component("embedder", OpenAIDocumentEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add writer
    pipeline.add_component("writer", DocumentWriter(
        document_store=document_store,
        policy=DuplicatePolicy.OVERWRITE
    ))
    
    # Connect components
    pipeline.connect("converter.documents", "cleaner.documents")
    pipeline.connect("cleaner.documents", "splitter.documents")
    pipeline.connect("splitter.documents", "embedder.documents")
    pipeline.connect("embedder.documents", "writer.documents")
    
    logger.info("Indexing pipeline created successfully")
    return pipeline


def create_url_indexing_pipeline(document_store) -> Pipeline:
    """Create a pipeline for indexing URLs using Haystack's built-in components."""
    logger.info("Creating URL indexing pipeline...")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add Haystack's built-in URL fetcher
    pipeline.add_component("fetcher", LinkContentFetcher())
    
    # Add custom table-aware HTML converter 
    pipeline.add_component("converter", TableAwareHTMLConverter())
    
    # Add document processors with enhanced cleaning
    pipeline.add_component("cleaner", DocumentCleaner(
        remove_empty_lines=True,
        remove_extra_whitespaces=True,
        remove_repeated_substrings=True  # Enable to remove repeated content
    ))
    
    # Add table-aware document splitter with semantic support for URLs
    pipeline.add_component("splitter", TableAwareDocumentSplitter(
        split_length=settings.CHUNK_SIZE,
        split_overlap=settings.CHUNK_OVERLAP,
        split_by="word",
        preserve_tables=True,
        use_semantic_splitting=settings.CHUNKING_STRATEGY == "semantic"
    ))
    
    # Add embedder
    pipeline.add_component("embedder", OpenAIDocumentEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add writer
    pipeline.add_component("writer", DocumentWriter(
        document_store=document_store,
        policy=DuplicatePolicy.OVERWRITE
    ))
    
    # Connect components for table-aware processing
    pipeline.connect("fetcher.streams", "converter.streams")
    pipeline.connect("converter.documents", "cleaner.documents")
    pipeline.connect("cleaner.documents", "splitter.documents")
    pipeline.connect("splitter.documents", "embedder.documents")
    pipeline.connect("embedder.documents", "writer.documents")
    
    logger.info("URL indexing pipeline created successfully")
    return pipeline


def create_full_indexing_pipeline(document_store) -> Pipeline:
    """Create a comprehensive pipeline for indexing multiple file types using Haystack's built-in converters."""
    logger.info(f"Creating full indexing pipeline with strategy: {settings.CHUNKING_STRATEGY}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add file type router
    pipeline.add_component("router", FileTypeRouter())
    
    # Add converters for different file types - using Haystack's built-in converters
    pipeline.add_component("text_converter", TextFileToDocument())
    pipeline.add_component("pdf_converter", PyPDFToDocument())
    pipeline.add_component("html_converter", HTMLToDocument())
    pipeline.add_component("markdown_converter", MarkdownToDocument())
    pipeline.add_component("csv_converter", CSVToDocument())
    pipeline.add_component("docx_converter", DOCXToDocument())
    pipeline.add_component("xlsx_converter", XLSXToDocument())
    
    # Add document joiner to merge documents from different converters
    pipeline.add_component("joiner", DocumentJoiner())
    
    # Add document processors
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
        pipeline.add_component("splitter", TableAwareDocumentSplitter(
            split_length=settings.CHUNK_SIZE,
            split_overlap=settings.CHUNK_OVERLAP,
            split_by="word",
            preserve_tables=True,
            use_semantic_splitting=False
        ))
    else:  # fixed/default
        pipeline.add_component("splitter", DocumentSplitter(
            split_by="word",
            split_length=settings.CHUNK_SIZE,
            split_overlap=settings.CHUNK_OVERLAP,
            split_threshold=0.1
        ))
    
    # Add embedder
    pipeline.add_component("embedder", OpenAIDocumentEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add writer
    pipeline.add_component("writer", DocumentWriter(
        document_store=document_store,
        policy=DuplicatePolicy.OVERWRITE
    ))
    
    # Connect router to converters
    pipeline.connect("router.text_files", "text_converter.sources")
    pipeline.connect("router.pdf_files", "pdf_converter.sources")
    pipeline.connect("router.html_files", "html_converter.sources")
    pipeline.connect("router.markdown_files", "markdown_converter.sources")
    pipeline.connect("router.csv_files", "csv_converter.sources")
    pipeline.connect("router.docx_files", "docx_converter.sources")
    pipeline.connect("router.xlsx_files", "xlsx_converter.sources")
    
    # Connect converters to joiner
    pipeline.connect("text_converter.documents", "joiner.documents")
    pipeline.connect("pdf_converter.documents", "joiner.documents")
    pipeline.connect("html_converter.documents", "joiner.documents")
    pipeline.connect("markdown_converter.documents", "joiner.documents")
    pipeline.connect("csv_converter.documents", "joiner.documents")
    pipeline.connect("docx_converter.documents", "joiner.documents")
    pipeline.connect("xlsx_converter.documents", "joiner.documents")
    
    # Connect joiner to cleaner
    pipeline.connect("joiner.documents", "cleaner.documents")
    
    # Connect rest of pipeline
    pipeline.connect("cleaner.documents", "splitter.documents")
    pipeline.connect("splitter.documents", "embedder.documents")
    pipeline.connect("embedder.documents", "writer.documents")
    
    logger.info("Full indexing pipeline created successfully")
    return pipeline


@component
class FileTypeRouter:
    """Route files to appropriate converters based on file type."""
    
    @component.output_types(
        text_files=List[str],
        pdf_files=List[str],
        html_files=List[str],
        markdown_files=List[str],
        csv_files=List[str],
        docx_files=List[str],
        xlsx_files=List[str]
    )
    def run(self, sources: List[str]) -> Dict[str, List[str]]:
        """Route files to appropriate converters.
        
        Args:
            sources: List of file paths to route
            
        Returns:
            Dictionary with lists of files for each converter type
        """
        # Prepare output
        output = {
            "text_files": [],
            "pdf_files": [],
            "html_files": [],
            "markdown_files": [],
            "csv_files": [],
            "docx_files": [],
            "xlsx_files": []
        }
        
        for source in sources:
            path = Path(source)
            extension = path.suffix.lower()
            
            # Route based on extension - supporting all Haystack built-in converters
            if extension in [".txt", ".text"]:
                output["text_files"].append(source)
            elif extension == ".pdf":
                output["pdf_files"].append(source)
            elif extension in [".html", ".htm"]:
                output["html_files"].append(source)
            elif extension in [".md", ".markdown"]:
                output["markdown_files"].append(source)
            elif extension in [".json", ".jsonl"]:
                # JSON files will be handled as text files for now
                output["text_files"].append(source)
            elif extension == ".csv":
                output["csv_files"].append(source)
            elif extension in [".docx", ".doc"]:
                output["docx_files"].append(source)
            elif extension in [".xlsx", ".xls"]:
                output["xlsx_files"].append(source)
            else:
                # Default to text for unknown types
                logger.warning(f"Unknown file extension {extension}, defaulting to text converter")
                output["text_files"].append(source)
        
        return output