import logging
import asyncio
import json
from typing import AsyncGenerator, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from openai import BadRequestError, NotFoundError

from app.models.schemas import ChatRequest, ChatResponse, ErrorResponse
from app.pipelines.manager import PipelineManager
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_pipeline_manager() -> PipelineManager:
    """Dependency to get pipeline manager."""
    from app.main import pipeline_manager
    return pipeline_manager


async def generate_sse_stream(
    message: str,
    model: str,
    provider: str,
    pipeline_manager: PipelineManager,
    conversation_id: str = None,
    retrieval_mode: str = "embedding",
    filters: Dict[str, Any] = None
) -> AsyncGenerator[str, None]:
    """Generate SSE stream for chat response."""
    try:
        # Run the query pipeline with streaming
        async for chunk in pipeline_manager.stream_query(
            query=message,
            conversation_id=conversation_id,
            model=model,
            provider=provider,
            retrieval_mode=retrieval_mode,
            filters=filters
        ):
            if chunk.get("type") == "content":
                # Send content chunk
                yield f"data: {chunk['content']}\n\n"
            elif chunk.get("type") == "error":
                # Send error
                yield f"data: Error: {chunk['message']}\n\n"
                break
        
        # Send completion signal
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        logger.error(f"Error in SSE stream: {e}", exc_info=True)
        yield f"data: Error: {str(e)}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(
    request: ChatRequest,
    pipeline_manager: PipelineManager = Depends(get_pipeline_manager)
):
    """
    Handle chat requests with RAG pipeline.
    Returns Server-Sent Events (SSE) stream.
    """
    try:
        logger.info(f"Chat request: {request.message[:50]}... (model: {request.model})")
        
        if request.stream:
            # Return SSE stream
            return EventSourceResponse(
                generate_sse_stream(
                    message=request.message,
                    model=request.model,
                    provider=request.provider.value,
                    pipeline_manager=pipeline_manager,
                    conversation_id=request.conversation_id,
                    retrieval_mode=request.retrieval_mode.value,
                    filters=request.filters
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "X-Accel-Buffering": "no",  # Disable Nginx buffering
                }
            )
        else:
            # Return complete response (non-streaming)
            result = await pipeline_manager.query(
                query=request.message,
                conversation_id=request.conversation_id,
                model=request.model,
                provider=request.provider.value,
                retrieval_mode=request.retrieval_mode.value,
                filters=request.filters,
                query_config=request.query_config
            )
            
            return ChatResponse(
                response=result["answer"],
                sources=result.get("sources", []),
                conversation_id=result["conversation_id"],
                model=request.model,
                confidence_score=float(result.get("confidence_score")) if result.get("confidence_score") is not None else None,
                metadata=result.get("metadata")
            )
            
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        status_code = 500
        error_type = "chat_error"
        message = str(e)

        if isinstance(e, BadRequestError):
            status_code = 400
            error_type = "bad_request_error"
            message = e.message if hasattr(e, 'message') else str(e)
        elif isinstance(e, NotFoundError):
            status_code = 404
            error_type = "model_not_found"
            message = e.message if hasattr(e, 'message') else str(e)
        
        raise HTTPException(
            status_code=status_code,
            detail=ErrorResponse(
                error=error_type,
                message=message
            ).model_dump()
        )