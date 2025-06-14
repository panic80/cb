import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import chat, ingestion, sources, health
from app.core.config import settings
from app.core.logging import setup_logging
from app.pipelines.manager import PipelineManager

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Initialize pipeline manager
pipeline_manager = PipelineManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    logger.info("Starting RAG service...")
    
    # Initialize pipelines
    try:
        await pipeline_manager.initialize()
        logger.info("Pipelines initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize pipelines: {e}")
        raise
    
    yield
    
    # Cleanup
    logger.info("Shutting down RAG service...")
    await pipeline_manager.cleanup()


# Create FastAPI app
app = FastAPI(
    title="Haystack RAG Service",
    description="Production-ready RAG service using Haystack 2.0",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


# Include routers
app.include_router(chat.router, tags=["chat"])
app.include_router(ingestion.router, prefix="/ingest", tags=["ingestion"])
app.include_router(sources.router, prefix="/sources", tags=["sources"])
app.include_router(health.router, tags=["health"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Haystack RAG Service",
        "version": "1.0.0",
        "status": "running"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        log_level=settings.LOG_LEVEL.lower()
    )