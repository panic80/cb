"""Query and chat models for RAG service."""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class Provider(str, Enum):
    """LLM provider enumeration."""
    OPENAI = "openai"
    GOOGLE = "google"
    ANTHROPIC = "anthropic"


class ChatMessage(BaseModel):
    """Chat message model."""
    role: str = Field(..., description="Message role (user/assistant/system)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    model_config = ConfigDict(json_encoders={datetime: lambda v: v.isoformat()})


class Source(BaseModel):
    """Source reference model."""
    id: str = Field(..., description="Source document ID")
    text: str = Field(..., description="Source text snippet")
    title: Optional[str] = Field(None, description="Source title")
    url: Optional[str] = Field(None, description="Source URL")
    section: Optional[str] = Field(None, description="Source section")
    page: Optional[int] = Field(None, description="Page number")
    score: Optional[float] = Field(None, description="Relevance score")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class ChatRequest(BaseModel):
    """Chat request model."""
    message: str = Field(..., description="User message")
    chat_history: Optional[List[ChatMessage]] = Field(default_factory=list)
    conversation_id: Optional[str] = Field(None, description="Conversation ID for context")
    provider: Provider = Field(Provider.OPENAI, description="LLM provider")
    model: Optional[str] = Field(None, description="Specific model to use")
    use_rag: bool = Field(True, description="Use RAG for response")
    include_sources: bool = Field(True, description="Include source citations")
    temperature: float = Field(0.7, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(None, description="Maximum response tokens")
    
    model_config = ConfigDict(use_enum_values=True)


class ChatResponse(BaseModel):
    """Chat response model."""
    response: str = Field(..., description="AI response")
    sources: List[Source] = Field(default_factory=list, description="Source citations")
    conversation_id: str = Field(..., description="Conversation ID")
    model: str = Field(..., description="Model used")
    provider: str = Field(..., description="Provider used")
    processing_time: float = Field(..., description="Response time in seconds")
    tokens_used: Optional[int] = Field(None, description="Tokens consumed")
    confidence_score: Optional[float] = Field(None, description="Response confidence")


class FollowUpQuestion(BaseModel):
    """Follow-up question model."""
    id: str = Field(..., description="Question ID")
    question: str = Field(..., description="Follow-up question text")
    category: str = Field("general", description="Question category")
    confidence: float = Field(0.5, ge=0.0, le=1.0)


class FollowUpRequest(BaseModel):
    """Follow-up questions request model."""
    user_question: str = Field(..., description="Original user question")
    ai_response: str = Field(..., description="AI response")
    sources: Optional[List[Source]] = Field(default_factory=list)
    max_questions: int = Field(3, ge=1, le=5)


class FollowUpResponse(BaseModel):
    """Follow-up questions response model."""
    questions: List[FollowUpQuestion] = Field(..., description="Follow-up questions")
    
    
class QueryExpansionRequest(BaseModel):
    """Query expansion request model."""
    query: str = Field(..., description="Original query")
    context: Optional[List[ChatMessage]] = Field(default_factory=list)
    max_expansions: int = Field(3, ge=1, le=5)


class QueryExpansionResponse(BaseModel):
    """Query expansion response model."""
    original_query: str = Field(..., description="Original query")
    expanded_queries: List[str] = Field(..., description="Expanded queries")
    keywords: List[str] = Field(default_factory=list, description="Extracted keywords")