"""Semantic splitting utilities for document chunking."""

import re
import logging
import numpy as np
from typing import List, Optional
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using simple regex."""
    # Simple sentence splitting
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    return sentences


def calculate_semantic_breakpoints(
    sentences: List[str],
    embeddings: List[np.ndarray],
    threshold_percentile: float = 75.0
) -> List[int]:
    """
    Calculate semantic breakpoints based on embedding similarity.
    
    Args:
        sentences: List of sentence strings
        embeddings: List of embedding vectors for each sentence
        threshold_percentile: Percentile threshold for distance cutoff
        
    Returns:
        List of sentence indices where breaks should occur
    """
    if len(embeddings) <= 1:
        return [0, len(sentences)]
    
    # Calculate distances between consecutive embeddings
    distances = []
    for i in range(len(embeddings) - 1):
        similarity = cosine_similarity([embeddings[i]], [embeddings[i + 1]])[0][0]
        distance = 1 - similarity
        distances.append(distance)
    
    # Find breakpoints based on threshold
    threshold = np.percentile(distances, threshold_percentile)
    breakpoints = [0]
    
    for i, distance in enumerate(distances):
        if distance > threshold:
            breakpoints.append(i + 1)
    
    breakpoints.append(len(sentences))
    return breakpoints


def enforce_chunk_size_constraints(
    chunks: List[str],
    max_chunk_length: int,
    split_by: str = "word",
    overlap: int = 0
) -> List[str]:
    """
    Ensure chunks meet size constraints by splitting large chunks.
    
    Args:
        chunks: List of text chunks
        max_chunk_length: Maximum length per chunk
        split_by: "word" or "character" based sizing
        overlap: Overlap between chunks when splitting
        
    Returns:
        List of size-constrained chunks
    """
    final_chunks = []
    
    for chunk in chunks:
        chunk_length = len(chunk.split()) if split_by == "word" else len(chunk)
        
        if chunk_length <= max_chunk_length:
            final_chunks.append(chunk)
        else:
            # Split large chunk using simple word-based splitting
            if split_by == "word":
                words = chunk.split()
                for i in range(0, len(words), max_chunk_length - overlap):
                    chunk_words = words[i:i + max_chunk_length]
                    final_chunks.append(' '.join(chunk_words))
            else:
                # Character-based splitting
                for i in range(0, len(chunk), max_chunk_length - overlap):
                    final_chunks.append(chunk[i:i + max_chunk_length])
    
    return final_chunks


def combine_chunks_with_overlap(
    sentences: List[str],
    breakpoints: List[int],
    max_chunk_length: int,
    split_by: str = "word"
) -> List[str]:
    """
    Combine sentences into chunks based on breakpoints with size constraints.
    
    Args:
        sentences: List of sentence strings
        breakpoints: Indices where chunks should break
        max_chunk_length: Maximum length per chunk
        split_by: "word" or "character" based sizing
        
    Returns:
        List of text chunks
    """
    chunks = []
    current_chunk = ""
    current_length = 0
    
    for i in range(len(breakpoints) - 1):
        start_idx = breakpoints[i]
        end_idx = breakpoints[i + 1]
        chunk_sentences = sentences[start_idx:end_idx]
        
        if not chunk_sentences:
            continue
            
        potential_chunk = ' '.join(chunk_sentences)
        potential_length = len(potential_chunk.split()) if split_by == "word" else len(potential_chunk)
        
        # Check if we need to start a new chunk due to size constraints
        if current_length > 0 and current_length + potential_length > max_chunk_length:
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            current_chunk = potential_chunk
            current_length = potential_length
        else:
            # Add to current chunk
            if current_chunk:
                current_chunk += "\n\n" + potential_chunk
            else:
                current_chunk = potential_chunk
            current_length += potential_length
    
    # Add final chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    
    return chunks


def semantic_split_with_embedder(
    content: str,
    embedder,
    max_chunk_length: int = 300,
    split_by: str = "word",
    threshold_percentile: float = 75.0
) -> List[str]:
    """
    Split content semantically using an embedder.
    
    Args:
        content: Text content to split
        embedder: Haystack embedder component with run() method
        max_chunk_length: Maximum chunk size
        split_by: "word" or "character" based sizing
        threshold_percentile: Semantic similarity threshold percentile
        
    Returns:
        List of semantically split chunks
    """
    try:
        # Split into sentences
        sentences = split_into_sentences(content)
        if len(sentences) <= 1:
            return [content]
        
        logger.debug(f"Splitting {len(sentences)} sentences semantically")
        
        # Get embeddings for sentences
        embeddings = []
        for sentence in sentences:
            try:
                result = embedder.run(text=sentence)
                embedding = result["embedding"]
                embeddings.append(np.array(embedding))
            except Exception as e:
                logger.error(f"Error getting embedding for sentence: {e}")
                # Fallback to word-based splitting
                return split_by_words(content, max_chunk_length, 0)
        
        # Calculate semantic breakpoints
        breakpoints = calculate_semantic_breakpoints(
            sentences, embeddings, threshold_percentile
        )
        
        # Combine sentences into chunks
        chunks = combine_chunks_with_overlap(
            sentences, breakpoints, max_chunk_length, split_by
        )
        
        # Ensure size constraints
        final_chunks = enforce_chunk_size_constraints(
            chunks, max_chunk_length, split_by
        )
        
        logger.debug(f"Semantic splitting produced {len(final_chunks)} chunks")
        return final_chunks
        
    except Exception as e:
        logger.error(f"Semantic splitting failed: {e}")
        # Fallback to simple word splitting
        return split_by_words(content, max_chunk_length, 0)


def split_by_words(content: str, split_length: int, split_overlap: int = 0) -> List[str]:
    """
    Simple word-based splitting as fallback.
    
    Args:
        content: Text content to split
        split_length: Number of words per chunk
        split_overlap: Number of overlapping words
        
    Returns:
        List of word-based chunks
    """
    words = content.split()
    chunks = []
    
    i = 0
    while i < len(words):
        # Take split_length words
        chunk_words = words[i:i + split_length]
        chunk = ' '.join(chunk_words)
        chunks.append(chunk)
        
        # Move forward by (split_length - split_overlap) to create overlap
        i += max(1, split_length - split_overlap)
    
    return chunks


def split_by_passages(content: str, max_length: int = 1000) -> List[str]:
    """
    Split content by passages (double line breaks).
    
    Args:
        content: Text content to split
        max_length: Maximum character length per chunk
        
    Returns:
        List of passage-based chunks
    """
    passages = re.split(r'\n\s*\n', content)
    chunks = []
    current_chunk = ""
    current_length = 0
    
    for passage in passages:
        passage_length = len(passage)
        
        if current_length + passage_length > max_length and current_chunk:
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