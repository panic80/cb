import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import JSONResponse

from app.models.schemas import (
    Source, SourcesResponse, DeleteResponse, ErrorResponse
)
from pydantic import BaseModel
from app.pipelines.manager import PipelineManager
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_pipeline_manager() -> PipelineManager:
    """Dependency to get pipeline manager."""
    from app.main import pipeline_manager
    return pipeline_manager


@router.get("", response_model=SourcesResponse)
async def list_sources(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """List all ingested sources."""
    try:
        logger.info(f"Listing sources (limit: {limit}, offset: {offset})")
        
        # Get sources from document store
        sources = await pipeline_manager.list_sources(limit=limit, offset=offset)
        
        return SourcesResponse(
            sources=[
                Source(
                    id=src["id"],
                    title=src["title"],
                    source=src["source"],
                    content_type=src["content_type"],
                    chunk_count=src["chunk_count"],
                    created_at=src["created_at"],
                    metadata=src.get("metadata")
                )
                for src in sources["items"]
            ],
            total=sources["total"]
        )
        
    except Exception as e:
        logger.error(f"Error listing sources: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="list_sources_error",
                message=f"Failed to list sources: {str(e)}"
            ).model_dump()
        )


@router.get("/{source_id}", response_model=Source)
async def get_source(
    source_id: str,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Get details of a specific source."""
    try:
        logger.info(f"Getting source: {source_id}")
        
        # Get source details
        source = await pipeline_manager.get_source(source_id)
        
        if not source:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="source_not_found",
                    message=f"Source {source_id} not found"
                ).model_dump()
            )
        
        return Source(
            id=source["id"],
            title=source["title"],
            source=source["source"],
            content_type=source["content_type"],
            chunk_count=source["chunk_count"],
            created_at=source["created_at"],
            metadata=source.get("metadata")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting source: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="get_source_error",
                message=f"Failed to get source: {str(e)}"
            ).model_dump()
        )


@router.delete("/{source_id}", response_model=DeleteResponse)
async def delete_source(
    source_id: str,
    request: Request,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Delete a specific source and all its documents."""
    try:
        logger.info(f"Attempting to delete source with ID: {source_id}")
        
        # Delete source and its documents
        result = await pipeline_manager.delete_source(source_id)
        
        if not result["success"]:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="source_not_found",
                    message=f"Source {source_id} not found"
                ).model_dump()
            )
        
        return DeleteResponse(
            id=source_id,
            status="success",
            message=f"Successfully deleted source and {result['documents_deleted']} documents"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="delete_source_error",
                message=f"Failed to delete source: {str(e)}"
            ).model_dump()
        )


# Additional POST endpoint for deletion to handle complex source IDs
class DeleteSourceRequest(BaseModel):
    """Request model for deleting a source via POST."""
    id: str


@router.post("/delete", response_model=DeleteResponse)
async def delete_source_post(
    request: DeleteSourceRequest,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """Delete a specific source using POST method (for complex IDs with special characters)."""
    try:
        source_id = request.id
        logger.info(f"Deleting source via POST: {source_id}")
        
        # Delete source and its documents
        result = await pipeline_manager.delete_source(source_id)
        
        if not result["success"]:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="source_not_found",
                    message=f"Source {source_id} not found"
                ).model_dump()
            )
        
        return DeleteResponse(
            id=source_id,
            status="success",
            message=f"Successfully deleted source and {result['documents_deleted']} documents"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="delete_source_error",
                message=f"Failed to delete source: {str(e)}"
            ).model_dump()
        )