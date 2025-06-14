import logging
import base64
import tempfile
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse

from app.models.schemas import (
    URLIngestRequest, FileIngestRequest, IngestResponse, ErrorResponse
)
from app.pipelines.manager import PipelineManager
from app.core.config import settings
from app.utils.file_utils import validate_file_type, save_uploaded_file

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_pipeline_manager() -> PipelineManager:
    """Dependency to get pipeline manager."""
    from app.main import pipeline_manager
    return pipeline_manager


@router.post("/url", response_model=IngestResponse)
async def ingest_url(
    request: URLIngestRequest,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a URL."""
    try:
        logger.info(f"Ingesting URL: {request.url}")
        
        # Run indexing pipeline for URL
        result = await pipeline_manager.index_url(
            url=request.url,
            metadata=request.metadata
        )
        
        return IngestResponse(
            id=result["document_id"],
            status="success",
            message=f"Successfully ingested content from {request.url}",
            document_count=result["chunk_count"]
        )
        
    except Exception as e:
        logger.error(f"URL ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to ingest URL: {str(e)}"
            ).model_dump()
        )


@router.post("/file", response_model=IngestResponse)
async def ingest_file(
    request: FileIngestRequest,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a file upload."""
    try:
        logger.info(f"Ingesting file: {request.filename}")
        
        # Validate file type
        if not validate_file_type(request.content_type):
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="invalid_file_type",
                    message=f"Unsupported file type: {request.content_type}"
                ).model_dump()
            )
        
        # Decode base64 content
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
        
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(request.filename).suffix) as tmp_file:
            tmp_file.write(file_content)
            tmp_path = tmp_file.name
        
        try:
            # Run indexing pipeline for file
            result = await pipeline_manager.index_file(
                file_path=tmp_path,
                filename=request.filename,
                content_type=request.content_type,
                metadata=request.metadata
            )
            
            return IngestResponse(
                id=result["document_id"],
                status="success",
                message=f"Successfully ingested file: {request.filename}",
                document_count=result["chunk_count"]
            )
            
        finally:
            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to ingest file: {str(e)}"
            ).model_dump()
        )


@router.post("/file-upload", response_model=IngestResponse)
async def ingest_file_upload(
    file: UploadFile = File(...),
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Ingest content from a direct file upload (multipart/form-data)."""
    try:
        logger.info(f"Ingesting uploaded file: {file.filename}")
        
        # Validate file type
        if not validate_file_type(file.content_type):
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="invalid_file_type",
                    message=f"Unsupported file type: {file.content_type}"
                ).model_dump()
            )
        
        # Check file size
        file_content = await file.read()
        if len(file_content) > settings.MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    error="file_too_large",
                    message=f"File size exceeds maximum of {settings.MAX_FILE_SIZE_MB}MB"
                ).model_dump()
            )
        
        # Save file temporarily
        tmp_path = await save_uploaded_file(file, file_content)
        
        try:
            # Run indexing pipeline for file
            result = await pipeline_manager.index_file(
                file_path=str(tmp_path),
                filename=file.filename,
                content_type=file.content_type,
                metadata={"source": "direct_upload"}
            )
            
            return IngestResponse(
                id=result["document_id"],
                status="success",
                message=f"Successfully ingested file: {file.filename}",
                document_count=result["chunk_count"]
            )
            
        finally:
            # Clean up temp file
            tmp_path.unlink(missing_ok=True)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload ingestion error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="ingestion_error",
                message=f"Failed to ingest uploaded file: {str(e)}"
            ).model_dump()
        )