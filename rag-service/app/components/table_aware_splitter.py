import logging
from typing import List, Dict, Any, Optional
from haystack import component, Document
from haystack.components.embedders import OpenAITextEmbedder
from haystack.utils import Secret
import tiktoken

from app.core.config import settings
from app.processing.table_detection import StructuredContentDetector
from app.processing.semantic_split import semantic_split_with_embedder, split_by_words, split_by_passages
from app.models.documents import create_chunk_metadata, SourceMetadata

logger = logging.getLogger(__name__)


@component 
class TableAwareDocumentSplitter:
    """
    Document splitter that respects table boundaries to prevent corruption
    when chunking documents containing Markdown tables.
    """
    
    def __init__(
        self,
        split_length: int = 300,
        split_overlap: int = 50,
        split_by: str = "word",
        preserve_tables: bool = True,
        use_semantic_splitting: bool = False,
        embedding_model: str = None,
        semantic_threshold: float = None,
        api_key: str = None
    ):
        """
        Initialize table-aware document splitter.
        
        Args:
            split_length: Maximum length of each chunk
            split_overlap: Overlap between chunks
            split_by: Split method ("word" or "passage")
            preserve_tables: Whether to preserve table boundaries
            use_semantic_splitting: Whether to use semantic splitting for non-table content
            embedding_model: Model to use for semantic embeddings
            semantic_threshold: Threshold for semantic similarity
            api_key: OpenAI API key for embeddings
        """
        self.split_length = split_length
        self.split_overlap = split_overlap
        self.split_by = split_by
        self.preserve_tables = preserve_tables
        self.use_semantic_splitting = use_semantic_splitting
        self.semantic_threshold = semantic_threshold or settings.SEMANTIC_BREAKPOINT_THRESHOLD
        
        # Initialize content detector
        self.content_detector = StructuredContentDetector()
        
        # Initialize embedder if semantic splitting is enabled
        if self.use_semantic_splitting:
            self.embedding_model = embedding_model or settings.EMBEDDING_MODEL
            self.embedder = OpenAITextEmbedder(
                api_key=Secret.from_token(api_key or settings.OPENAI_API_KEY),
                model=self.embedding_model
            )
            self.tokenizer = tiktoken.encoding_for_model(self.embedding_model)
        else:
            self.embedder = None
            self.tokenizer = None
    
    @component.output_types(documents=List[Document])
    def run(self, documents: List[Document]) -> Dict[str, Any]:
        """
        Split documents while preserving table boundaries.
        
        Args:
            documents: List of documents to split
            
        Returns:
            Dictionary with 'documents' key containing split documents
        """
        split_documents = []
        
        for doc in documents:
            try:
                if not doc.content or not doc.content.strip():
                    logger.warning(f"Skipping empty document: {doc.id}")
                    continue
                
                # Split document into chunks
                chunks = self._split_document(doc)
                
                for i, chunk_content in enumerate(chunks):
                    if chunk_content.strip():
                        # Add table-specific metadata using detector
                        has_table = self.content_detector.contains_table_content(chunk_content)
                        table_type = self.content_detector.identify_table_type(chunk_content) if has_table else None
                        table_row_count = self.content_detector.count_table_rows(chunk_content) if has_table else 0
                        
                        # Create standardized chunk metadata if we have source metadata
                        if isinstance(doc.meta, dict) and "source_id" in doc.meta:
                            try:
                                source_meta = SourceMetadata(**doc.meta)
                                chunk_meta = create_chunk_metadata(
                                    source_metadata=source_meta,
                                    chunk_id=f"{doc.id}_chunk_{i}",
                                    chunk_index=i,
                                    total_chunks=len(chunks),
                                    contains_table=has_table,
                                    table_type=table_type,
                                    table_row_count=table_row_count,
                                    word_count=len(chunk_content.split()),
                                    character_count=len(chunk_content)
                                )
                                chunk_dict = chunk_meta.to_dict()
                                chunk_dict.update({
                                    "splitter": "TableAwareDocumentSplitter",
                                    "semantic_splitting": self.use_semantic_splitting,
                                })
                            except Exception as e:
                                logger.warning(f"Failed to create structured metadata: {e}")
                                # Fallback to legacy metadata
                                chunk_dict = {
                                    **doc.meta,
                                    "chunk_id": f"{doc.id}_chunk_{i}",
                                    "chunk_index": i,
                                    "total_chunks": len(chunks),
                                    "splitter": "TableAwareDocumentSplitter",
                                    "semantic_splitting": self.use_semantic_splitting,
                                    "contains_table": has_table,
                                    "table_type": table_type,
                                    "table_row_count": table_row_count
                                }
                        else:
                            # Legacy metadata fallback
                            chunk_dict = {
                                **doc.meta,
                                "chunk_id": f"{doc.id}_chunk_{i}",
                                "chunk_index": i,
                                "total_chunks": len(chunks),
                                "splitter": "TableAwareDocumentSplitter",
                                "semantic_splitting": self.use_semantic_splitting,
                                "contains_table": has_table,
                                "table_type": table_type,
                                "table_row_count": table_row_count
                            }
                        
                        chunk_doc = Document(content=chunk_content, meta=chunk_dict)
                        split_documents.append(chunk_doc)
                
                logger.info(f"Split document {doc.id} into {len(chunks)} chunks")
                
            except Exception as e:
                logger.error(f"Error splitting document {doc.id}: {e}", exc_info=True)
                # Include original document if splitting fails
                split_documents.append(doc)
        
        return {"documents": split_documents}
    
    def _split_document(self, doc: Document) -> List[str]:
        """Split document content while preserving table boundaries."""
        content = doc.content
        
        if not self.preserve_tables or not self.content_detector.contains_structured_content(content):
            # Use standard or semantic splitting if no structured content detected
            if self.use_semantic_splitting:
                return semantic_split_with_embedder(
                    content, self.embedder, self.split_length, self.split_by, self.semantic_threshold
                )
            else:
                return self._standard_split(content)
        
        # Table-aware splitting with optional semantic splitting for non-table sections
        return self._table_aware_split(content)
    
    
    def _table_aware_split(self, content: str) -> List[str]:
        """Split content while keeping tables and code blocks intact with enhanced context preservation."""
        # Identify structured content boundaries using detector
        structured_boundaries = self.content_detector.identify_structured_boundaries(content)
        
        if not structured_boundaries:
            if self.use_semantic_splitting:
                return semantic_split_with_embedder(
                    content, self.embedder, self.split_length, self.split_by, self.semantic_threshold
                )
            else:
                return self._standard_split(content)
        
        chunks = []
        current_chunk = ""
        current_length = 0
        lines = content.split('\n')
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Check if we're at the start of structured content
            structured_info = self.content_detector.find_structured_at_line(i, structured_boundaries)
            
            if structured_info:
                # We're at structured content - handle it specially
                struct_start, struct_end, struct_type = structured_info
                
                # For tables, include surrounding context (title, description)
                context_start, context_end = self.content_detector.get_table_context_boundaries(
                    struct_start, struct_end, lines, struct_type
                )
                
                structured_content = '\n'.join(lines[context_start:context_end + 1])
                struct_length = self._count_words(structured_content) if self.split_by == "word" else len(structured_content)
                
                # For large tables, allow exceeding normal chunk size to keep intact
                max_allowed_size = self.split_length * 2 if struct_type == 'table' else self.split_length
                
                # If adding this structured content would exceed chunk size, start new chunk
                if current_length > 0 and current_length + struct_length > max_allowed_size:
                    if current_chunk.strip():
                        chunks.append(current_chunk.strip())
                    current_chunk = structured_content
                    current_length = struct_length
                else:
                    # Add structured content to current chunk
                    if current_chunk:
                        current_chunk += "\n\n" + structured_content
                    else:
                        current_chunk = structured_content
                    current_length += struct_length
                
                # Skip to after the structured content (including context)
                i = context_end + 1
            else:
                # Regular line - add to current chunk
                line_length = self._count_words(line) if self.split_by == "word" else len(line)
                
                # Check if adding this line would exceed chunk size
                if current_length > 0 and current_length + line_length > self.split_length:
                    if current_chunk.strip():
                        chunks.append(current_chunk.strip())
                    current_chunk = line
                    current_length = line_length
                else:
                    if current_chunk:
                        current_chunk += "\n" + line
                    else:
                        current_chunk = line
                    current_length += line_length
                
                i += 1
        
        # Add final chunk
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks if chunks else [content]
    
    
    
    def _standard_split(self, content: str) -> List[str]:
        """Standard document splitting without table awareness."""
        if self.split_by == "word":
            return split_by_words(content, self.split_length, self.split_overlap)
        else:
            return split_by_passages(content, self.split_length)
    
    def _count_words(self, text: str) -> int:
        """Count words in text."""
        return len(text.split())
    
    
