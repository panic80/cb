from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    """Application settings."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # OpenAI Configuration
    OPENAI_API_KEY: str = Field(..., description="OpenAI API key")
    
    # Server Configuration
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")
    RELOAD: bool = Field(default=False, description="Enable auto-reload")
    
    # Database Configuration
    DATABASE_URL: Optional[str] = Field(default=None, description="PostgreSQL database URL")
    
    # Vector Store Configuration
    VECTOR_STORE_TYPE: str = Field(default="memory", description="Vector store type: memory, chroma, pgvector")
    CHROMA_PERSIST_PATH: str = Field(default="./chroma_db", description="Chroma persistence path")
    
    # Document Processing
    CHUNK_SIZE: int = Field(default=500, description="Document chunk size in tokens")
    CHUNK_OVERLAP: int = Field(default=150, description="Document chunk overlap in tokens")
    MAX_FILE_SIZE_MB: int = Field(default=100, description="Maximum file size in MB")
    
    # Chunking Strategy Configuration
    CHUNKING_STRATEGY: str = Field(default="table_aware", description="Chunking strategy: fixed, semantic, table_aware, propositions")
    SEMANTIC_BREAKPOINT_METHOD: str = Field(default="percentile", description="Semantic chunking method: percentile, interquartile, gradient")
    SEMANTIC_BREAKPOINT_THRESHOLD: float = Field(default=95.0, description="Threshold for semantic chunking (0-100)")
    MIN_CHUNK_SIZE: int = Field(default=100, description="Minimum chunk size in tokens")
    MAX_CHUNK_SIZE: int = Field(default=1000, description="Maximum chunk size in tokens")
    PRESERVE_DOCUMENT_STRUCTURE: bool = Field(default=True, description="Preserve document structure (headings, sections)")
    ENABLE_CHUNK_QUALITY_METRICS: bool = Field(default=True, description="Enable chunk quality metrics logging")
    
    # Model Configuration
    EMBEDDING_MODEL: str = Field(default="text-embedding-3-large", description="OpenAI embedding model")
    LLM_MODEL: str = Field(default="gpt-4o-mini", description="OpenAI LLM model")
    MAX_TOKENS: int = Field(default=4096, description="Maximum tokens for LLM response")
    
    # Security
    JWT_SECRET_KEY: Optional[str] = Field(default=None, description="JWT secret key")
    RATE_LIMIT_PER_MINUTE: int = Field(default=60, description="Rate limit per minute")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    LOG_FILE: str = Field(default="rag_service.log", description="Log file path")
    
    # RAG Pipeline Configuration
    TOP_K_RETRIEVAL: int = Field(default=5, description="Number of documents to retrieve")
    TEMPERATURE: float = Field(default=0.7, description="LLM temperature")
    
    # Retrieval Configuration
    DEFAULT_RETRIEVAL_MODE: str = Field(default="hybrid", description="Default retrieval mode: embedding, bm25, hybrid")
    BM25_WEIGHT: float = Field(default=0.5, description="Weight for BM25 in hybrid retrieval (0-1)")
    EMBEDDING_WEIGHT: float = Field(default=0.5, description="Weight for embedding in hybrid retrieval (0-1)")
    RERANKER_MODEL: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2", description="Model for reranking")
    ENABLE_METADATA_RANKING: bool = Field(default=True, description="Enable metadata-based ranking")
    METADATA_RANKING_WEIGHT: float = Field(default=0.3, description="Weight for metadata ranking (0-1)")
    
    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        """Get max file size in bytes."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024


# Create settings instance
settings = Settings()