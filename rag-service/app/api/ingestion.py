import logging
import base64
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks

from app.models.schemas import (
    URLIngestRequest, FileIngestRequest, IngestResponse, ErrorResponse
)
from app.pipelines.manager import PipelineManager
from app.core.config import settings
from app.services.metrics import metrics_service
from app.services.ingestion_service import IngestionService, JobStatus
from app.utils.file_utils import (
    validate_file_type,
    save_uploaded_file_streaming,
    validate_file_comprehensive,
    calculate_file_hash,
    calculate_content_hash
)

logger = logging.getLogger(__name__)
router = APIRouter()

async def get_pipeline_manager() -> PipelineManager:
    from app.main import pipeline_manager
    return pipeline_manager

# This should be a singleton managed by a dependency injection system in a real app
_ingestion_service: Optional[IngestionService] = None

def get_ingestion_service(pipeline_manager: PipelineManager = Depends(get_pipeline_manager)) -> IngestionService:
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = IngestionService(pipeline_manager)
    return _ingestion_service


@router.post("/url", response_model=IngestResponse)
async def ingest_url(
    request: URLIngestRequest,
    background_tasks: BackgroundTasks,
    ingestion_service: IngestionService = Depends(get_ingestion_service)
):
    try:
        logger.info(f"Received URL ingestion request: {request.url}")
        job_id = ingestion_service.create_job("url", {"url": request.url})
        background_tasks.add_task(ingestion_service.process_url_ingestion, job_id, request)
        return IngestResponse(
            id=job_id,
            status="accepted",
            message=f"URL ingestion started. Use job ID {job_id} to check status.",
            document_count=0
        )
    except Exception as e:
        logger.error(f"URL ingestion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=ErrorResponse(error="ingestion_error", message=str(e)).model_dump())


@router.post("/file", response_model=IngestResponse)
async def ingest_file(
    request: FileIngestRequest,
    background_tasks: BackgroundTasks,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
):
    """Ingest content from a file upload asynchronously.
    
    DEPRECATED: This base64 endpoint is deprecated due to memory inefficiency.
    Use /file-upload (multipart/form-data) instead for better performance.
    """
    try:
        logger.warning(f"DEPRECATED: Base64 file endpoint used for {request.filename}. Use /file-upload instead.")
        logger.info(f"Received file ingestion request: {request.filename}")
        
        if not validate_file_type(request.content_type):
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="invalid_file_type",
                    message=f"Unsupported file type: {request.content_type}"
                ).model_dump()
            )
        
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
        
        if len(file_content) > settings.MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="file_too_large",
                    message=f"File size exceeds maximum of {settings.MAX_FILE_SIZE_MB}MB"
                ).model_dump()
            )
        
        content_hash = calculate_content_hash(file_content)
        logger.info(f"Content hash: {content_hash[:8]}...")
        
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
        
        job_id = ingestion_service.create_job("file", {"filename": request.filename})
        background_tasks.add_task(ingestion_service.process_file_ingestion, job_id, request, content_hash)
        
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


@router.post("/file-upload", response_model=IngestResponse)
async def ingest_file_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager),
    ingestion_service: IngestionService = Depends(get_ingestion_service)
):
    try:
        logger.info(f"Received file upload request: {file.filename}")
        
        validation_result = await validate_file_comprehensive(
            file, 
            settings.MAX_FILE_SIZE_BYTES,
            check_content=True
        )
        
        if not validation_result["valid"]:
            error_message = "; ".join(validation_result["errors"])
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="file_validation_failed",
                    message=error_message
                ).model_dump()
            )
        
        if validation_result["warnings"]:
            for warning in validation_result["warnings"]:
                logger.warning(f"File validation warning: {warning}")
        
        logger.info(f"File validation passed. Size: {validation_result['file_size']} bytes")
        
        file_hash = await calculate_file_hash(file)
        logger.info(f"File hash: {file_hash[:8]}...")
        
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
        
        tmp_path = await save_uploaded_file_streaming(file)
        job_id = ingestion_service.create_job("file_upload", {"filename": file.filename})
        background_tasks.add_task(
            ingestion_service.process_file_upload_ingestion, 
            job_id, str(tmp_path), file.filename, file.content_type, file_hash
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
async def get_job_status(job_id: str, ingestion_service: IngestionService = Depends(get_ingestion_service)):
    job = ingestion_service.get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=ErrorResponse(error="job_not_found", message=f"Job {job_id} not found").model_dump())
    return job