from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum


class Provider(str, Enum):
    """LLM Provider options."""
    OPENAI = "openai"
    GOOGLE = "google"
    ANTHROPIC = "anthropic"


class RetrievalMode(str, Enum):
    """Retrieval mode options."""
    EMBEDDING = "embedding"
    BM25 = "bm25"
    HYBRID = "hybrid"


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str = Field(..., description="User message")
    model: Optional[str] = Field(default="gpt-4o-mini", description="Model to use")
    provider: Optional[Provider] = Field(default=Provider.OPENAI, description="LLM provider")
    conversation_id: Optional[str] = Field(default=None, description="Conversation ID for context")
    stream: bool = Field(default=True, description="Enable streaming response")
    retrieval_mode: Optional[RetrievalMode] = Field(default=RetrievalMode.EMBEDDING, description="Retrieval mode")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Document filters")
    query_config: Optional[Dict[str, Any]] = Field(default=None, description="Per-query configuration overrides")


class ChatResponse(BaseModel):
    """Chat response model."""
    response: str = Field(..., description="Generated response")
    sources: Optional[List[Dict[str, Any]]] = Field(default=None, description="Source documents used")
    conversation_id: str = Field(..., description="Conversation ID")
    model: str = Field(..., description="Model used")
    confidence_score: Optional[float] = Field(default=None, description="Confidence score of the response")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Response metadata")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class URLIngestRequest(BaseModel):
    """URL ingestion request model."""
    url: str = Field(..., description="URL to ingest")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")
    enable_crawling: bool = Field(default=True, description="Enable web crawling")
    max_depth: Optional[int] = Field(default=None, description="Maximum crawling depth (overrides config)")
    max_pages: Optional[int] = Field(default=None, description="Maximum pages to crawl (overrides config)")
    follow_external_links: Optional[bool] = Field(default=None, description="Follow external links (overrides config)")


class FileIngestRequest(BaseModel):
    """File ingestion request model."""
    filename: str = Field(..., description="Original filename")
    content: str = Field(..., description="Base64 encoded file content")
    content_type: str = Field(..., description="MIME type of the file")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class IngestResponse(BaseModel):
    """Ingestion response model."""
    id: str = Field(..., description="Document ID")
    status: str = Field(..., description="Ingestion status")
    message: str = Field(..., description="Status message")
    document_count: Optional[int] = Field(default=None, description="Number of documents created")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class Source(BaseModel):
    """Source document model."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str = Field(..., description="Document ID")
    title: str = Field(..., description="Document title")
    source: str = Field(..., description="Source URL or filename")
    content_type: str = Field(..., description="Content type")
    chunk_count: int = Field(..., description="Number of chunks")
    created_at: str = Field(..., description="Creation timestamp")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class SourcesResponse(BaseModel):
    """Sources list response model."""
    sources: List[Source] = Field(..., description="List of sources")
    total: int = Field(..., description="Total number of sources")


class DeleteResponse(BaseModel):
    """Delete response model."""
    id: str = Field(..., description="Deleted document ID")
    status: str = Field(..., description="Deletion status")
    message: str = Field(..., description="Status message")


class StatusResponse(BaseModel):
    """Service status response model."""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    document_count: int = Field(..., description="Total documents in store")
    vector_store_type: str = Field(..., description="Vector store type")
    models: Dict[str, str] = Field(..., description="Configured models")
    uptime: float = Field(..., description="Service uptime in seconds")


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    detail: Optional[Any] = Field(default=None, description="Additional error details")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())