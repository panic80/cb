import logging
import base64
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse

from app.models.schemas import (
    URLIngestRequest, FileIngestRequest, IngestResponse, ErrorResponse
)
from app.pipelines.manager import PipelineManager
from app.core.config import settings
from app.services.metrics import metrics_service, MetricsContext
from app.utils.file_utils import (
    validate_file_type, 
    save_uploaded_file, 
    save_uploaded_file_streaming, 
    check_file_size_streaming,
    validate_file_comprehensive,
    calculate_file_hash,
    calculate_content_hash
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Simple in-memory job tracking for Phase 1
# In Phase 3, this will be replaced with proper job queue
_ingestion_jobs = {}

class JobStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


async def get_pipeline_manager() -> PipelineManager:
    """Dependency to get pipeline manager."""
    from app.main import pipeline_manager
    return pipeline_manager


async def _process_url_ingestion(
    job_id: str,
    request: URLIngestRequest,
    pipeline_manager: PipelineManager
):
    """Background task to process URL ingestion."""
    with MetricsContext("ingestion_duration", {"type": "url"}):
        try:
            logger.info(f"Processing URL ingestion job {job_id}: {request.url}")
            _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
            metrics_service.increment_counter("ingestion_jobs_total", tags={"type": "url"})
            
            # Run indexing pipeline for URL
            result = await pipeline_manager.index_url(
                url=request.url,
                metadata=request.metadata,
                enable_crawling=request.enable_crawling,
                max_depth=request.max_depth,
                max_pages=request.max_pages,
                follow_external_links=request.follow_external_links
            )
            
            # Update job status
            _ingestion_jobs[job_id].update({
                "status": JobStatus.COMPLETED,
                "result": {
                    "document_id": result["document_id"],
                    "chunk_count": result["chunk_count"]
                }
            })
            
            metrics_service.increment_counter("ingestion_jobs_success", tags={"type": "url"})
            metrics_service.increment_counter("documents_total", value=result["chunk_count"])
            logger.info(f"URL ingestion job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"URL ingestion job {job_id} failed: {e}", exc_info=True)
            _ingestion_jobs[job_id].update({
                "status": JobStatus.FAILED,
                "error": str(e)
            })
            metrics_service.increment_counter("ingestion_jobs_failed", tags={"type": "url"})
            metrics_service.record_error("url_ingestion_error", str(e), {"job_id": job_id})


@router.post("/url", response_model=IngestResponse)
async def ingest_url(
    request: URLIngestRequest,
    background_tasks: BackgroundTasks,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a URL asynchronously."""
    try:
        logger.info(f"Received URL ingestion request: {request.url}")
        
        # Generate job ID
        job_id = str(uuid.uuid4())
        
        # Initialize job tracking
        _ingestion_jobs[job_id] = {
            "id": job_id,
            "status": JobStatus.PENDING,
            "url": request.url,
            "created_at": time.time()
        }
        
        # Add background task
        background_tasks.add_task(
            _process_url_ingestion,
            job_id,
            request,
            pipeline_manager
        )
        
        return IngestResponse(
            id=job_id,
            status="accepted",
            message=f"URL ingestion started. Use job ID {job_id} to check status.",
            document_count=0
        )
        
    except Exception as e:
        logger.error(f"URL ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to start URL ingestion: {str(e)}"
            ).model_dump()
        )


async def _process_file_ingestion(
    job_id: str,
    request: FileIngestRequest,
    content_hash: str,
    pipeline_manager: PipelineManager
):
    """Background task to process file ingestion."""
    tmp_path = None
    try:
        logger.info(f"Processing file ingestion job {job_id}: {request.filename}")
        _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
        
        # Decode base64 content
        file_content = base64.b64decode(request.content)
        
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(request.filename).suffix) as tmp_file:
            tmp_file.write(file_content)
            tmp_path = tmp_file.name
        
        # Prepare metadata with content hash
        metadata = dict(request.metadata) if request.metadata else {}
        metadata["content_hash"] = content_hash
        
        # Run indexing pipeline for file
        result = await pipeline_manager.index_file(
            file_path=tmp_path,
            filename=request.filename,
            content_type=request.content_type,
            metadata=metadata
        )
        
        # Update job status
        _ingestion_jobs[job_id].update({
            "status": JobStatus.COMPLETED,
            "result": {
                "document_id": result["document_id"],
                "chunk_count": result["chunk_count"]
            }
        })
        logger.info(f"File ingestion job {job_id} completed successfully")
        
    except Exception as e:
        logger.error(f"File ingestion job {job_id} failed: {e}", exc_info=True)
        _ingestion_jobs[job_id].update({
            "status": JobStatus.FAILED,
            "error": str(e)
        })
    finally:
        # Clean up temp file
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


@router.post("/file", response_model=IngestResponse)
async def ingest_file(
    request: FileIngestRequest,
    background_tasks: BackgroundTasks,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a file upload asynchronously.
    
    DEPRECATED: This base64 endpoint is deprecated due to memory inefficiency.
    Use /file-upload (multipart/form-data) instead for better performance.
    """
    try:
        logger.warning(f"DEPRECATED: Base64 file endpoint used for {request.filename}. Use /file-upload instead.")
        logger.info(f"Received file ingestion request: {request.filename}")
        
        # Validate file type
        if not validate_file_type(request.content_type):
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="invalid_file_type",
                    message=f"Unsupported file type: {request.content_type}"
                ).model_dump()
            )
        
        # Validate base64 content
        try:
            file_content = base64.b64decode(request.content)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="invalid_base64",
                    message="Invalid base64 encoded content"
                ).model_dump()
            )
        
        # Check file size
        if len(file_content) > settings.MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="file_too_large",
                    message=f"File size exceeds maximum of {settings.MAX_FILE_SIZE_MB}MB"
                ).model_dump()
            )
        
        # Calculate content hash for idempotency checking
        content_hash = calculate_content_hash(file_content)
        logger.info(f"Content hash: {content_hash[:8]}...")
        
        # Check for duplicate content
        existing_source_id = await pipeline_manager.document_store_service.check_duplicate_by_hash(content_hash)
        if existing_source_id:
            logger.info(f"Duplicate file detected, returning existing source: {existing_source_id}")
            existing_source = await pipeline_manager.document_store_service.get_source(existing_source_id)
            if existing_source:
                return IngestResponse(
                    id=existing_source_id,
                    status="duplicate",
                    message=f"File already exists as source {existing_source_id}. No ingestion needed.",
                    document_count=existing_source.get("chunk_count", 0)
                )
        
        # Generate job ID
        job_id = str(uuid.uuid4())
        
        # Initialize job tracking
        _ingestion_jobs[job_id] = {
            "id": job_id,
            "status": JobStatus.PENDING,
            "filename": request.filename,
            "created_at": time.time()
        }
        
        # Add background task
        background_tasks.add_task(
            _process_file_ingestion,
            job_id,
            request,
            content_hash,
            pipeline_manager
        )
        
        return IngestResponse(
            id=job_id,
            status="accepted",
            message=f"File ingestion started. Use job ID {job_id} to check status.",
            document_count=0
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to start file ingestion: {str(e)}"
            ).model_dump()
        )


async def _process_file_upload_ingestion(
    job_id: str,
    file_path: str,
    filename: str,
    content_type: str,
    file_hash: str,
    pipeline_manager: PipelineManager
):
    """Background task to process file upload ingestion."""
    with MetricsContext("ingestion_duration", {"type": "file_upload"}):
        try:
            logger.info(f"Processing file upload ingestion job {job_id}: {filename}")
            _ingestion_jobs[job_id]["status"] = JobStatus.PROCESSING
            metrics_service.increment_counter("ingestion_jobs_total", tags={"type": "file_upload"})
            
            # Run indexing pipeline for file
            result = await pipeline_manager.index_file(
                file_path=file_path,
                filename=filename,
                content_type=content_type,
                metadata={"source": "direct_upload", "content_hash": file_hash}
            )
            
            # Update job status
            _ingestion_jobs[job_id].update({
                "status": JobStatus.COMPLETED,
                "result": {
                    "document_id": result["document_id"],
                    "chunk_count": result["chunk_count"]
                }
            })
            
            metrics_service.increment_counter("ingestion_jobs_success", tags={"type": "file_upload"})
            metrics_service.increment_counter("documents_total", value=result["chunk_count"])
            logger.info(f"File upload ingestion job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"File upload ingestion job {job_id} failed: {e}", exc_info=True)
            _ingestion_jobs[job_id].update({
                "status": JobStatus.FAILED,
                "error": str(e)
            })
            metrics_service.increment_counter("ingestion_jobs_failed", tags={"type": "file_upload"})
            metrics_service.record_error("file_ingestion_error", str(e), {"job_id": job_id})
        finally:
            # Clean up temp file
            Path(file_path).unlink(missing_ok=True)


@router.post("/file-upload", response_model=IngestResponse)
async def ingest_file_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a direct file upload (multipart/form-data) asynchronously."""
    try:
        logger.info(f"Received file upload request: {file.filename}")
        
        # Comprehensive file validation
        validation_result = await validate_file_comprehensive(
            file, 
            settings.MAX_FILE_SIZE_BYTES,
            check_content=True
        )
        
        # Check if validation failed
        if not validation_result["valid"]:
            error_message = "; ".join(validation_result["errors"])
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="file_validation_failed",
                    message=error_message
                ).model_dump()
            )
        
        # Log warnings if any
        if validation_result["warnings"]:
            for warning in validation_result["warnings"]:
                logger.warning(f"File validation warning: {warning}")
        
        logger.info(f"File validation passed. Size: {validation_result['file_size']} bytes")
        
        # Calculate file hash for idempotency checking
        file_hash = await calculate_file_hash(file)
        logger.info(f"File hash: {file_hash[:8]}...")
        
        # Check for duplicate content
        existing_source_id = await pipeline_manager.document_store_service.check_duplicate_by_hash(file_hash)
        if existing_source_id:
            logger.info(f"Duplicate file detected, returning existing source: {existing_source_id}")
            existing_source = await pipeline_manager.document_store_service.get_source(existing_source_id)
            if existing_source:
                metrics_service.increment_counter("ingestion_jobs_duplicate", tags={"type": "file_upload"})
                return IngestResponse(
                    id=existing_source_id,
                    status="duplicate",
                    message=f"File already exists as source {existing_source_id}. No ingestion needed.",
                    document_count=existing_source.get("chunk_count", 0)
                )
        
        # Save file temporarily using streaming (memory efficient)
        tmp_path = await save_uploaded_file_streaming(file)
        
        # Generate job ID
        job_id = str(uuid.uuid4())
        
        # Initialize job tracking
        _ingestion_jobs[job_id] = {
            "id": job_id,
            "status": JobStatus.PENDING,
            "filename": file.filename,
            "created_at": time.time()
        }
        
        # Add background task
        background_tasks.add_task(
            _process_file_upload_ingestion,
            job_id,
            str(tmp_path),
            file.filename,
            file.content_type,
            file_hash,
            pipeline_manager
        )
        
        return IngestResponse(
            id=job_id,
            status="accepted",
            message=f"File upload ingestion started. Use job ID {job_id} to check status.",
            document_count=0
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to start file upload ingestion: {str(e)}"
            ).model_dump()
        )


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of an ingestion job."""
    if job_id not in _ingestion_jobs:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="job_not_found",
                message=f"Job {job_id} not found"
            ).model_dump()
        )
    
    return _ingestion_jobs[job_id]