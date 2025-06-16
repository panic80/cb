import logging
import time
from datetime import datetime
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.models.schemas import StatusResponse
from app.pipelines.manager import PipelineManager
from app.core.config import settings
from app.services.metrics import metrics_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Track service start time
SERVICE_START_TIME = time.time()


async def get_pipeline_manager() -> PipelineManager:
    """Dependency to get pipeline manager."""
    from app.main import pipeline_manager
    return pipeline_manager


@router.get("/status", response_model=StatusResponse)
async def get_status(
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Get service status and health information."""
    try:
        # Get document count from store
        doc_count = await pipeline_manager.get_document_count()
        
        # Calculate uptime
        uptime = time.time() - SERVICE_START_TIME
        
        return StatusResponse(
            status="healthy",
            version="1.0.0",
            document_count=doc_count,
            vector_store_type=settings.VECTOR_STORE_TYPE,
            models={
                "embedding": settings.EMBEDDING_MODEL,
                "llm": settings.LLM_MODEL
            },
            uptime=uptime
        )
        
    except Exception as e:
        logger.error(f"Error getting status: {e}", exc_info=True)
        return StatusResponse(
            status="unhealthy",
            version="1.0.0",
            document_count=0,
            vector_store_type=settings.VECTOR_STORE_TYPE,
            models={
                "embedding": settings.EMBEDDING_MODEL,
                "llm": settings.LLM_MODEL
            },
            uptime=time.time() - SERVICE_START_TIME
        )


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@router.get("/ready")
async def readiness_check(
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Readiness check endpoint."""
    try:
        # Check if pipelines are initialized
        if not pipeline_manager.is_initialized():
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "message": "Pipelines not initialized"}
            )
        
        return {"status": "ready", "timestamp": datetime.utcnow().isoformat()}
        
    except Exception as e:
        logger.error(f"Readiness check failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "message": str(e)}
        )


@router.get("/metrics")
async def get_metrics():
    """Get service metrics."""
    try:
        metrics = metrics_service.export_metrics()
        return metrics
    except Exception as e:
        logger.error(f"Error getting metrics: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to get metrics", "message": str(e)}
        )


@router.get("/metrics/summary")
async def get_metrics_summary(
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Get summarized service metrics."""
    try:
        service_metrics = metrics_service.get_service_metrics()
        
        # Update document count
        try:
            doc_count = await pipeline_manager.get_document_count()
            metrics_service._counters["documents_total"] = doc_count
            service_metrics.documents_total = doc_count
        except Exception as e:
            logger.warning(f"Could not get document count: {e}")
        
        # Update source count  
        try:
            sources_data = await pipeline_manager.list_sources(limit=1)
            source_count = sources_data.get("total", 0)
            metrics_service._counters["sources_total"] = source_count
            service_metrics.sources_total = source_count
        except Exception as e:
            logger.warning(f"Could not get source count: {e}")
        
        return service_metrics
        
    except Exception as e:
        logger.error(f"Error getting metrics summary: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to get metrics summary", "message": str(e)}
        )