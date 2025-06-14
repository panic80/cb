import logging
import re
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from haystack import component, Document
from haystack.components.embedders import OpenAITextEmbedder
from haystack.utils import Secret
from sklearn.metrics.pairwise import cosine_similarity
import tiktoken

from app.core.config import settings

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
        
        # Regex patterns for detecting Markdown tables
        self.table_start_pattern = re.compile(r'^\s*\|.*\|.*$', re.MULTILINE)
        self.table_separator_pattern = re.compile(r'^\s*\|[\s\-\|:]*\|.*$', re.MULTILINE)
        
        # Regex patterns for detecting code blocks
        self.code_block_pattern = re.compile(r'```[\s\S]*?```', re.MULTILINE)
        self.inline_code_pattern = re.compile(r'`[^`]+`')
        
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
                        chunk_doc = Document(
                            content=chunk_content,
                            meta={
                                **doc.meta,
                                "chunk_id": f"{doc.id}_chunk_{i}",
                                "chunk_index": i,
                                "total_chunks": len(chunks),
                                "splitter": "TableAwareDocumentSplitter",
                                "semantic_splitting": self.use_semantic_splitting
                            }
                        )
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
        
        if not self.preserve_tables or not self._contains_structured_content(content):
            # Use standard or semantic splitting if no structured content detected
            if self.use_semantic_splitting:
                return self._semantic_split(content)
            else:
                return self._standard_split(content)
        
        # Table-aware splitting with optional semantic splitting for non-table sections
        return self._table_aware_split(content)
    
    def _contains_structured_content(self, content: str) -> bool:
        """Check if content contains tables, code blocks, or other structured content."""
        # Check for tables
        lines = content.split('\n')
        table_lines = 0
        
        for line in lines:
            if self.table_start_pattern.match(line):
                table_lines += 1
                if table_lines >= 2:  # At least header + one row
                    return True
        
        # Check for code blocks
        if self.code_block_pattern.search(content):
            return True
        
        return False
    
    def _table_aware_split(self, content: str) -> List[str]:
        """Split content while keeping tables and code blocks intact."""
        # Identify structured content boundaries
        structured_boundaries = self._identify_structured_boundaries(content)
        
        if not structured_boundaries:
            if self.use_semantic_splitting:
                return self._semantic_split(content)
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
            structured_info = self._find_structured_at_line(i, structured_boundaries)
            
            if structured_info:
                # We're at structured content - handle it specially
                struct_start, struct_end, struct_type = structured_info
                structured_content = '\n'.join(lines[struct_start:struct_end + 1])
                struct_length = self._count_words(structured_content) if self.split_by == "word" else len(structured_content)
                
                # If adding this structured content would exceed chunk size, start new chunk
                if current_length > 0 and current_length + struct_length > self.split_length:
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
                
                # Skip to after the structured content
                i = struct_end + 1
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
    
    def _identify_structured_boundaries(self, content: str) -> List[tuple]:
        """Identify start and end line numbers of all structured content (tables, code blocks)."""
        lines = content.split('\n')
        boundaries = []
        
        # Find tables
        in_table = False
        table_start = None
        
        for i, line in enumerate(lines):
            is_table_line = self.table_start_pattern.match(line)
            is_separator = self.table_separator_pattern.match(line)
            
            if is_table_line and not in_table:
                # Start of a new table
                table_start = i
                in_table = True
            elif in_table and not is_table_line and not is_separator:
                # End of current table
                if table_start is not None:
                    boundaries.append((table_start, i - 1, 'table'))
                in_table = False
                table_start = None
        
        # Handle table that goes to end of content
        if in_table and table_start is not None:
            boundaries.append((table_start, len(lines) - 1, 'table'))
        
        # Find code blocks
        full_content = '\n'.join(lines)
        for match in self.code_block_pattern.finditer(full_content):
            start_pos = match.start()
            end_pos = match.end()
            
            # Convert positions to line numbers
            start_line = full_content[:start_pos].count('\n')
            end_line = full_content[:end_pos].count('\n')
            
            boundaries.append((start_line, end_line, 'code'))
        
        # Sort boundaries by start line
        boundaries.sort(key=lambda x: x[0])
        
        return boundaries
    
    def _find_structured_at_line(self, line_num: int, structured_boundaries: List[tuple]) -> Optional[tuple]:
        """Find if given line number is the start of structured content."""
        for start, end, content_type in structured_boundaries:
            if line_num == start:
                return (start, end, content_type)
        return None
    
    def _standard_split(self, content: str) -> List[str]:
        """Standard document splitting without table awareness."""
        if self.split_by == "word":
            return self._split_by_words(content)
        else:
            return self._split_by_passages(content)
    
    def _split_by_words(self, content: str) -> List[str]:
        """Split content by word count."""
        words = content.split()
        chunks = []
        
        i = 0
        while i < len(words):
            # Take split_length words
            chunk_words = words[i:i + self.split_length]
            chunk = ' '.join(chunk_words)
            chunks.append(chunk)
            
            # Move forward by (split_length - split_overlap) to create overlap
            i += max(1, self.split_length - self.split_overlap)
        
        return chunks
    
    def _split_by_passages(self, content: str) -> List[str]:
        """Split content by passages (double line breaks)."""
        passages = re.split(r'\n\s*\n', content)
        chunks = []
        current_chunk = ""
        current_length = 0
        
        for passage in passages:
            passage_length = len(passage)
            
            if current_length + passage_length > self.split_length and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = passage
                current_length = passage_length
            else:
                if current_chunk:
                    current_chunk += "\n\n" + passage
                else:
                    current_chunk = passage
                current_length += passage_length
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks if chunks else [content]
    
    def _count_words(self, text: str) -> int:
        """Count words in text."""
        return len(text.split())
    
    def _semantic_split(self, content: str) -> List[str]:
        """Split content based on semantic similarity."""
        if not self.embedder:
            return self._standard_split(content)
        
        # Split into sentences
        sentences = self._split_into_sentences(content)
        if len(sentences) <= 1:
            return [content]
        
        # Get embeddings for sentences
        embeddings = []
        for sentence in sentences:
            try:
                result = self.embedder.run(text=sentence)
                embedding = result["embedding"]
                embeddings.append(np.array(embedding))
            except Exception as e:
                logger.error(f"Error getting embedding: {e}")
                return self._standard_split(content)
        
        # Calculate distances between consecutive embeddings
        distances = []
        for i in range(len(embeddings) - 1):
            similarity = cosine_similarity([embeddings[i]], [embeddings[i + 1]])[0][0]
            distance = 1 - similarity
            distances.append(distance)
        
        # Find breakpoints based on threshold
        threshold = np.percentile(distances, self.semantic_threshold)
        breakpoints = [0]
        
        for i, distance in enumerate(distances):
            if distance > threshold:
                breakpoints.append(i + 1)
        
        breakpoints.append(len(sentences))
        
        # Create chunks from breakpoints
        chunks = []
        for i in range(len(breakpoints) - 1):
            start_idx = breakpoints[i]
            end_idx = breakpoints[i + 1]
            chunk_sentences = sentences[start_idx:end_idx]
            if chunk_sentences:
                chunk = ' '.join(chunk_sentences)
                chunks.append(chunk)
        
        # Ensure chunks meet size constraints
        chunks = self._enforce_chunk_sizes(chunks)
        
        return chunks
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Simple sentence splitting
        sentences = re.split(r'(?<=[.!?])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        return sentences
    
    def _enforce_chunk_sizes(self, chunks: List[str]) -> List[str]:
        """Ensure chunks meet size constraints."""
        final_chunks = []
        current_chunk = ""
        current_length = 0
        
        for chunk in chunks:
            chunk_length = self._count_words(chunk) if self.split_by == "word" else len(chunk)
            
            if current_length > 0 and current_length + chunk_length > self.split_length:
                if current_chunk.strip():
                    final_chunks.append(current_chunk.strip())
                current_chunk = chunk
                current_length = chunk_length
            else:
                if current_chunk:
                    current_chunk += "\n\n" + chunk
                else:
                    current_chunk = chunk
                current_length += chunk_length
        
        if current_chunk.strip():
            final_chunks.append(current_chunk.strip())
        
        return final_chunks if final_chunks else chunks