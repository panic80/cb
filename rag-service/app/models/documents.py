"""Document metadata models for standardized metadata handling."""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class SourceMetadata(BaseModel):
    """Standardized metadata structure for document sources."""
    
    # Core identification fields
    source_id: str = Field(..., description="Unique identifier for the source")
    source: str = Field(..., description="Source identifier (filename, URL, etc.)")
    title: Optional[str] = Field(None, description="Human-readable title")
    
    # Content type and classification
    content_type: str = Field(..., description="MIME type or content classification")
    
    # Table-specific metadata (from splitter)
    contains_table: bool = Field(False, description="Whether content contains tables")
    table_type: Optional[str] = Field(None, description="Type of table content")
    table_row_count: int = Field(0, description="Number of table rows")
    
    # Chunk-specific metadata
    chunk_id: Optional[str] = Field(None, description="Unique chunk identifier")
    chunk_index: Optional[int] = Field(None, description="Index of chunk within source")
    total_chunks: Optional[int] = Field(None, description="Total chunks in source")
    
    # Processing metadata
    splitter: Optional[str] = Field(None, description="Splitter used for processing")
    semantic_splitting: bool = Field(False, description="Whether semantic splitting was used")
    indexed_at: Optional[str] = Field(None, description="ISO timestamp of indexing")
    
    # Legacy support fields (for backward compatibility)
    filename: Optional[str] = Field(None, description="Original filename (legacy)")
    url: Optional[str] = Field(None, description="Original URL (legacy)")


class DocumentChunkMetadata(BaseModel):
    """Metadata specifically for document chunks created by splitters."""
    
    # Inherit from source metadata
    source_metadata: SourceMetadata
    
    # Chunk-specific fields
    chunk_id: str = Field(..., description="Unique identifier for this chunk")
    chunk_index: int = Field(..., description="Zero-based index of chunk")
    total_chunks: int = Field(..., description="Total number of chunks in source")
    
    # Content analysis
    word_count: Optional[int] = Field(None, description="Number of words in chunk")
    character_count: Optional[int] = Field(None, description="Number of characters in chunk")
    
    # Table-specific chunk metadata
    contains_table: bool = Field(False, description="Whether this chunk contains table content")
    table_type: Optional[str] = Field(None, description="Type of table if present")
    table_row_count: int = Field(0, description="Number of table rows in chunk")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for Haystack Document.meta field."""
        # Flatten the nested structure for Haystack compatibility
        result = self.source_metadata.dict()
        result.update({
            "chunk_id": self.chunk_id,
            "chunk_index": self.chunk_index,
            "total_chunks": self.total_chunks,
            "word_count": self.word_count,
            "character_count": self.character_count,
            "contains_table": self.contains_table,
            "table_type": self.table_type,
            "table_row_count": self.table_row_count,
        })
        # Remove None values to keep metadata clean
        return {k: v for k, v in result.items() if v is not None}


def create_source_metadata(
    source_id: str,
    source: str,
    content_type: str,
    title: Optional[str] = None,
    **kwargs
) -> SourceMetadata:
    """Helper function to create standardized source metadata."""
    return SourceMetadata(
        source_id=source_id,
        source=source,
        content_type=content_type,
        title=title or source,
        indexed_at=datetime.utcnow().isoformat(),
        **kwargs
    )


def create_chunk_metadata(
    source_metadata: SourceMetadata,
    chunk_id: str,
    chunk_index: int,
    total_chunks: int,
    **kwargs
) -> DocumentChunkMetadata:
    """Helper function to create standardized chunk metadata."""
    return DocumentChunkMetadata(
        source_metadata=source_metadata,
        chunk_id=chunk_id,
        chunk_index=chunk_index,
        total_chunks=total_chunks,
        **kwargs
    )


def migrate_legacy_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate legacy metadata dictionaries to standardized format."""
    # Extract source identification
    source_id = meta.get("source_id")
    source = meta.get("source") or meta.get("filename") or meta.get("url", "unknown")
    
    if not source_id:
        # Generate source_id from available fields
        source_id = meta.get("filename") or meta.get("url") or "unknown"
    
    # Create standardized metadata
    standardized = SourceMetadata(
        source_id=source_id,
        source=source,
        content_type=meta.get("content_type", "unknown"),
        title=meta.get("title"),
        contains_table=meta.get("contains_table", False),
        table_type=meta.get("table_type"),
        table_row_count=meta.get("table_row_count", 0),
        chunk_id=meta.get("chunk_id"),
        chunk_index=meta.get("chunk_index"),
        total_chunks=meta.get("total_chunks"),
        splitter=meta.get("splitter"),
        semantic_splitting=meta.get("semantic_splitting", False),
        indexed_at=meta.get("indexed_at"),
        filename=meta.get("filename"),  # Keep for legacy compatibility
        url=meta.get("url")  # Keep for legacy compatibility
    )
    
    return standardized.dict(exclude_none=True)