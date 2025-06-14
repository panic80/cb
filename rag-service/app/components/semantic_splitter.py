import logging
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
class SemanticDocumentSplitter:
    """
    Document splitter that uses embedding similarity to determine chunk boundaries.
    Splits text semantically to ensure chunks contain related information.
    """
    
    def __init__(
        self,
        embedding_model: str = None,
        breakpoint_method: str = None,
        breakpoint_threshold: float = None,
        min_chunk_size: int = None,
        max_chunk_size: int = None,
        buffer_size: int = 1,
        api_key: str = None
    ):
        """
        Initialize semantic document splitter.
        
        Args:
            embedding_model: Model to use for embeddings
            breakpoint_method: Method for determining breakpoints (percentile, interquartile, gradient)
            breakpoint_threshold: Threshold value for breakpoint detection
            min_chunk_size: Minimum chunk size in tokens
            max_chunk_size: Maximum chunk size in tokens
            buffer_size: Number of sentences to group before computing embeddings
            api_key: OpenAI API key
        """
        self.embedding_model = embedding_model or settings.EMBEDDING_MODEL
        self.breakpoint_method = breakpoint_method or settings.SEMANTIC_BREAKPOINT_METHOD
        self.breakpoint_threshold = breakpoint_threshold or settings.SEMANTIC_BREAKPOINT_THRESHOLD
        self.min_chunk_size = min_chunk_size or settings.MIN_CHUNK_SIZE
        self.max_chunk_size = max_chunk_size or settings.MAX_CHUNK_SIZE
        self.buffer_size = buffer_size
        
        # Initialize embedder
        self.embedder = OpenAITextEmbedder(
            api_key=Secret.from_token(api_key or settings.OPENAI_API_KEY),
            model=self.embedding_model
        )
        
        # Initialize tokenizer for counting tokens
        self.tokenizer = tiktoken.encoding_for_model(self.embedding_model)
        
        logger.info(f"Initialized SemanticDocumentSplitter with method: {self.breakpoint_method}")
    
    @component.output_types(documents=List[Document])
    def run(self, documents: List[Document]) -> Dict[str, Any]:
        """
        Split documents based on semantic similarity.
        
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
                
                # Split document into semantic chunks
                chunks = self._semantic_split(doc)
                
                for i, chunk_content in enumerate(chunks):
                    if chunk_content.strip():
                        chunk_doc = Document(
                            content=chunk_content,
                            meta={
                                **doc.meta,
                                "chunk_id": f"{doc.id}_chunk_{i}",
                                "chunk_index": i,
                                "total_chunks": len(chunks),
                                "splitter": "SemanticDocumentSplitter",
                                "chunking_method": self.breakpoint_method
                            }
                        )
                        split_documents.append(chunk_doc)
                
                logger.info(f"Split document {doc.id} into {len(chunks)} semantic chunks")
                
            except Exception as e:
                logger.error(f"Error splitting document {doc.id}: {e}", exc_info=True)
                # Fall back to including original document
                split_documents.append(doc)
        
        return {"documents": split_documents}
    
    def _semantic_split(self, doc: Document) -> List[str]:
        """Split document content based on semantic similarity."""
        content = doc.content
        
        # Split into sentences
        sentences = self._split_into_sentences(content)
        if len(sentences) <= 1:
            return [content]
        
        # Group sentences for embedding
        grouped_sentences = self._group_sentences(sentences)
        
        # Get embeddings for grouped sentences
        embeddings = self._get_embeddings(grouped_sentences)
        if not embeddings:
            return [content]
        
        # Calculate distances between consecutive embeddings
        distances = self._calculate_distances(embeddings)
        
        # Find breakpoints based on method
        breakpoints = self._find_breakpoints(distances)
        
        # Create chunks based on breakpoints
        chunks = self._create_chunks(sentences, breakpoints)
        
        # Ensure chunks meet size constraints
        chunks = self._enforce_size_constraints(chunks)
        
        return chunks
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Simple sentence splitting - can be enhanced with nltk or spacy
        import re
        
        # Split on sentence endings but preserve the punctuation
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        # Filter out empty sentences
        sentences = [s.strip() for s in sentences if s.strip()]
        
        return sentences
    
    def _group_sentences(self, sentences: List[str]) -> List[str]:
        """Group sentences based on buffer size."""
        if self.buffer_size <= 1:
            return sentences
        
        grouped = []
        for i in range(0, len(sentences), self.buffer_size):
            group = ' '.join(sentences[i:i + self.buffer_size])
            grouped.append(group)
        
        return grouped
    
    def _get_embeddings(self, texts: List[str]) -> List[np.ndarray]:
        """Get embeddings for texts."""
        embeddings = []
        
        for text in texts:
            try:
                result = self.embedder.run(text=text)
                embedding = result["embedding"]
                embeddings.append(np.array(embedding))
            except Exception as e:
                logger.error(f"Error getting embedding: {e}")
                return []
        
        return embeddings
    
    def _calculate_distances(self, embeddings: List[np.ndarray]) -> List[float]:
        """Calculate cosine distances between consecutive embeddings."""
        distances = []
        
        for i in range(len(embeddings) - 1):
            # Calculate cosine similarity and convert to distance
            similarity = cosine_similarity([embeddings[i]], [embeddings[i + 1]])[0][0]
            distance = 1 - similarity
            distances.append(distance)
        
        return distances
    
    def _find_breakpoints(self, distances: List[float]) -> List[int]:
        """Find breakpoints based on the specified method."""
        if not distances:
            return []
        
        if self.breakpoint_method == "percentile":
            return self._find_percentile_breakpoints(distances)
        elif self.breakpoint_method == "interquartile":
            return self._find_interquartile_breakpoints(distances)
        elif self.breakpoint_method == "gradient":
            return self._find_gradient_breakpoints(distances)
        else:
            logger.warning(f"Unknown breakpoint method: {self.breakpoint_method}, using percentile")
            return self._find_percentile_breakpoints(distances)
    
    def _find_percentile_breakpoints(self, distances: List[float]) -> List[int]:
        """Find breakpoints using percentile method."""
        threshold = np.percentile(distances, self.breakpoint_threshold)
        breakpoints = []
        
        for i, distance in enumerate(distances):
            if distance > threshold:
                breakpoints.append(i + 1)  # +1 because we want the index after the distance
        
        return breakpoints
    
    def _find_interquartile_breakpoints(self, distances: List[float]) -> List[int]:
        """Find breakpoints using interquartile range method."""
        q1 = np.percentile(distances, 25)
        q3 = np.percentile(distances, 75)
        iqr = q3 - q1
        
        # Use breakpoint_threshold as a scaling factor for IQR
        threshold = q3 + (iqr * (self.breakpoint_threshold / 100))
        
        breakpoints = []
        for i, distance in enumerate(distances):
            if distance > threshold:
                breakpoints.append(i + 1)
        
        return breakpoints
    
    def _find_gradient_breakpoints(self, distances: List[float]) -> List[int]:
        """Find breakpoints using gradient method."""
        if len(distances) < 2:
            return []
        
        # Calculate gradient
        gradients = []
        for i in range(1, len(distances)):
            gradient = distances[i] - distances[i - 1]
            gradients.append(gradient)
        
        # Find anomalies in gradient
        gradient_threshold = np.percentile(np.abs(gradients), self.breakpoint_threshold)
        
        breakpoints = []
        for i, gradient in enumerate(gradients):
            if abs(gradient) > gradient_threshold:
                breakpoints.append(i + 1)
        
        return breakpoints
    
    def _create_chunks(self, sentences: List[str], breakpoints: List[int]) -> List[str]:
        """Create chunks from sentences based on breakpoints."""
        if not breakpoints:
            return [' '.join(sentences)]
        
        chunks = []
        start = 0
        
        # Add 0 and len(sentences) to breakpoints for easier processing
        breakpoints = [0] + breakpoints + [len(sentences)]
        
        for i in range(len(breakpoints) - 1):
            start_idx = breakpoints[i]
            end_idx = breakpoints[i + 1]
            
            # Account for buffer size when creating chunks
            if self.buffer_size > 1:
                start_idx = start_idx * self.buffer_size
                end_idx = min(end_idx * self.buffer_size, len(sentences))
            
            chunk_sentences = sentences[start_idx:end_idx]
            if chunk_sentences:
                chunk = ' '.join(chunk_sentences)
                chunks.append(chunk)
        
        return chunks
    
    def _enforce_size_constraints(self, chunks: List[str]) -> List[str]:
        """Ensure chunks meet size constraints."""
        final_chunks = []
        
        for chunk in chunks:
            token_count = len(self.tokenizer.encode(chunk))
            
            if token_count <= self.max_chunk_size:
                if token_count >= self.min_chunk_size:
                    final_chunks.append(chunk)
                else:
                    # Chunk is too small, merge with previous or next
                    if final_chunks:
                        # Merge with previous chunk
                        merged = final_chunks[-1] + ' ' + chunk
                        merged_tokens = len(self.tokenizer.encode(merged))
                        
                        if merged_tokens <= self.max_chunk_size:
                            final_chunks[-1] = merged
                        else:
                            final_chunks.append(chunk)  # Keep as separate chunk
                    else:
                        final_chunks.append(chunk)  # First chunk, keep as is
            else:
                # Chunk is too large, split it
                sub_chunks = self._split_large_chunk(chunk)
                final_chunks.extend(sub_chunks)
        
        return final_chunks
    
    def _split_large_chunk(self, chunk: str) -> List[str]:
        """Split a chunk that exceeds max size."""
        sentences = self._split_into_sentences(chunk)
        sub_chunks = []
        current_chunk = ""
        current_tokens = 0
        
        for sentence in sentences:
            sentence_tokens = len(self.tokenizer.encode(sentence))
            
            if current_tokens + sentence_tokens <= self.max_chunk_size:
                if current_chunk:
                    current_chunk += ' ' + sentence
                else:
                    current_chunk = sentence
                current_tokens += sentence_tokens
            else:
                if current_chunk:
                    sub_chunks.append(current_chunk)
                current_chunk = sentence
                current_tokens = sentence_tokens
        
        if current_chunk:
            sub_chunks.append(current_chunk)
        
        return sub_chunks