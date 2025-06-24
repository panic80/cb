"""Configuration settings for RAG service."""

from pydantic_settings import BaseSettings
from typing import Optional, List
import os


class Settings(BaseSettings):
    """Application settings."""
    
    # API Configuration
    app_name: str = "CF Travel Instructions RAG Service"
    app_version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    debug: bool = False
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    
    # CORS
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:3001"]
    
    # OpenAI Configuration
    openai_api_key: Optional[str] = None
    openai_embedding_model: str = "text-embedding-3-large"
    openai_embedding_dimensions: int = 3072  # Maximum dimensions for text-embedding-3-large
    openai_chat_model: str = "gpt-4.1-mini"
    
    # Google Configuration
    google_api_key: Optional[str] = None
    google_embedding_model: str = "models/embedding-001"
    google_chat_model: str = "gemini-pro"
    
    # Anthropic Configuration
    anthropic_api_key: Optional[str] = None
    anthropic_chat_model: str = "claude-3-opus-20240229"
    
    # Vector Store Configuration
    vector_store_type: str = "chroma"  # chroma or qdrant
    chroma_persist_directory: str = "./chroma_db"
    chroma_collection_name: str = "travel_instructions"
    
    # Document Processing
    chunk_size: int = 256
    chunk_overlap: int = 40
    max_chunks_per_query: int = 10  # Increased to provide more context
    source_preview_max_length: int = 5000  # Max characters for source preview (0 = no limit)
    
    # Parallel Processing Configuration
    parallel_chunk_workers: int = 4
    parallel_embedding_workers: int = 8
    embedding_batch_size: int = 20
    max_concurrent_embeddings: int = 30
    vector_store_batch_size: int = 200
    parallel_retrieval_limit: int = 10  # Maximum concurrent retrieval pipelines
    retriever_timeout: float = 10.0  # Timeout for each retriever in seconds
    
    # Retrieval Configuration
    retrieval_search_type: str = "similarity"  # Changed from mmr to similarity
    retrieval_k: int = 10  # Increased from 5
    retrieval_fetch_k: int = 20  # Increased from 10
    retrieval_lambda_mult: float = 0.7  # Only used for MMR
    
    # Caching Configuration
    redis_url: Optional[str] = "redis://localhost:6379"
    cache_ttl: int = 3600  # 1 hour
    embedding_cache_ttl: int = 604800  # 1 week
    
    # Canada.ca Scraping
    canada_ca_base_url: str = "https://www.canada.ca"
    travel_instructions_url: str = "https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html"
    scraping_timeout: int = 30
    scraping_retry_count: int = 3
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 60
    rate_limit_period: int = 60  # seconds
    
    # Streaming Configuration
    enable_streaming: bool = True
    sse_timeout: int = 300  # 5 minutes
    sse_buffer_size: int = 1024  # 1KB per chunk
    max_streaming_connections: int = 150  # Support 100+ concurrent users with buffer
    streaming_chunk_delay: float = 0.001  # 1ms delay between chunks for backpressure
    streaming_first_token_target_ms: int = 500  # Target for first token latency
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    
    class Config:
        env_file = ".env"
        env_prefix = "RAG_"
        case_sensitive = False
        extra = "ignore"  # Allow extra fields in .env file


# Create settings instance
settings = Settings()

# Override with environment variables
if os.getenv("OPENAI_API_KEY"):
    settings.openai_api_key = os.getenv("OPENAI_API_KEY")
    
if os.getenv("VITE_GEMINI_API_KEY"):
    settings.google_api_key = os.getenv("VITE_GEMINI_API_KEY")
    
if os.getenv("ANTHROPIC_API_KEY"):
    settings.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    
if os.getenv("REDIS_URL"):
    settings.redis_url = os.getenv("REDIS_URL")