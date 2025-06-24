"""Main FastAPI application for RAG service."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
from typing import Dict, Any

from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.core.langchain_config import LangChainConfig
from app.api import health, chat, ingestion, sources, websocket, progress, streaming_chat
from app.services.document_store import DocumentStore
from app.core.vectorstore import VectorStoreManager
from app.services.cache import CacheService
from app.services.llm_pool import initialize_llm_pool, shutdown_llm_pool

# Set up logging
setup_logging(settings.log_level, settings.log_format)
logger = get_logger(__name__)

# Global instances
document_store: DocumentStore = None
vector_store_manager: VectorStoreManager = None
cache_service: CacheService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    global document_store, vector_store_manager, cache_service
    
    logger.info("Starting RAG service...")
    
    # Initialize services
    try:
        # Initialize LangChain configuration
        LangChainConfig.initialize()
        logger.info("LangChain configuration initialized")
        
        # Initialize cache service
        cache_service = CacheService()
        await cache_service.connect()
        logger.info("Cache service initialized")
        
        # Initialize vector store
        vector_store_manager = VectorStoreManager()
        await vector_store_manager.initialize()
        logger.info("Vector store initialized")
        
        # Initialize document store
        document_store = DocumentStore(vector_store_manager, cache_service)
        logger.info("Document store initialized")
        
        # Initialize LLM connection pool
        await initialize_llm_pool()
        logger.info("LLM connection pool initialized")
        
        # Set instances in app state
        app.state.document_store = document_store
        app.state.vector_store_manager = vector_store_manager
        app.state.cache_service = cache_service
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise
        
    yield
    
    # Cleanup
    logger.info("Shutting down RAG service...")
    
    # Shutdown LLM pool
    await shutdown_llm_pool()
    logger.info("LLM connection pool shut down")
    
    if cache_service:
        await cache_service.disconnect()
    if vector_store_manager:
        await vector_store_manager.close()


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Add request processing time to response headers."""
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response


# Exception handlers
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Handle validation errors."""
    logger.error(f"Validation error: {exc}")
    return JSONResponse(
        status_code=400,
        content={"error": "Bad Request", "message": str(exc)},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "message": "An unexpected error occurred"},
    )


# Include routers
app.include_router(health.router, prefix=settings.api_prefix, tags=["health"])
app.include_router(chat.router, prefix=settings.api_prefix, tags=["chat"])
app.include_router(streaming_chat.router, prefix=settings.api_prefix, tags=["streaming"])
app.include_router(ingestion.router, prefix=settings.api_prefix, tags=["ingestion"])
app.include_router(sources.router, prefix=settings.api_prefix, tags=["sources"])
app.include_router(websocket.router, prefix=settings.api_prefix, tags=["websocket"])
app.include_router(progress.router, prefix=settings.api_prefix, tags=["progress"])


@app.get("/")
async def root() -> Dict[str, Any]:
    """Root endpoint."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "status": "operational",
        "docs": f"{settings.api_prefix}/docs",
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        workers=settings.workers,
        log_level=settings.log_level.lower(),
    )