"""Document models for RAG service."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class DocumentType(str, Enum):
    """Document type enumeration."""
    WEB = "web"
    PDF = "pdf"
    TEXT = "text"
    MARKDOWN = "markdown"
    DOCX = "docx"
    XLSX = "xlsx"
    CSV = "csv"


class DocumentMetadata(BaseModel):
    """Document metadata model."""
    source: str = Field(..., description="Source URL or file path")
    title: Optional[str] = Field(None, description="Document title")
    type: DocumentType = Field(..., description="Document type")
    section: Optional[str] = Field(None, description="Section or chapter")
    page_number: Optional[int] = Field(None, description="Page number for PDFs")
    last_modified: Optional[datetime] = Field(None, description="Last modification date")
    policy_reference: Optional[str] = Field(None, description="Policy reference number")
    tags: List[str] = Field(default_factory=list, description="Document tags")
    
    model_config = ConfigDict(use_enum_values=True)


class Document(BaseModel):
    """Document model."""
    id: str = Field(..., description="Unique document ID")
    content: str = Field(..., description="Document content")
    metadata: DocumentMetadata = Field(..., description="Document metadata")
    embedding: Optional[List[float]] = Field(None, description="Document embedding vector")
    chunk_index: Optional[int] = Field(None, description="Chunk index within parent document")
    parent_id: Optional[str] = Field(None, description="Parent document ID")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(json_encoders={datetime: lambda v: v.isoformat()})


class DocumentChunk(BaseModel):
    """Document chunk for processing."""
    text: str = Field(..., description="Chunk text content")
    metadata: Dict[str, Any] = Field(..., description="Chunk metadata")
    
    
class DocumentIngestionRequest(BaseModel):
    """Request model for document ingestion."""
    url: Optional[str] = Field(None, description="URL to scrape")
    file_path: Optional[str] = Field(None, description="Local file path")
    content: Optional[str] = Field(None, description="Direct content input")
    type: DocumentType = Field(..., description="Document type")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    force_refresh: bool = Field(False, description="Force re-ingestion if exists")
    
    model_config = ConfigDict(use_enum_values=True)


class DocumentIngestionResponse(BaseModel):
    """Response model for document ingestion."""
    document_id: str = Field(..., description="Ingested document ID")
    chunks_created: int = Field(..., description="Number of chunks created")
    status: str = Field(..., description="Ingestion status")
    message: Optional[str] = Field(None, description="Status message")
    processing_time: float = Field(..., description="Processing time in seconds")
    error_details: Optional[Dict[str, Any]] = Field(None, description="Detailed error information")


class DocumentSearchRequest(BaseModel):
    """Request model for document search."""
    query: str = Field(..., description="Search query")
    filters: Optional[Dict[str, Any]] = Field(None, description="Metadata filters")
    limit: int = Field(5, ge=1, le=20, description="Maximum results")
    include_scores: bool = Field(False, description="Include relevance scores")


class DocumentSearchResult(BaseModel):
    """Search result model."""
    document: Document = Field(..., description="Matched document")
    score: Optional[float] = Field(None, description="Relevance score")
    highlights: Optional[List[str]] = Field(None, description="Highlighted snippets")


class DocumentListResponse(BaseModel):
    """Response model for document listing."""
    documents: List[Document] = Field(..., description="List of documents")
    total: int = Field(..., description="Total document count")
    page: int = Field(1, description="Current page")
    page_size: int = Field(20, description="Page size")