"""Progress tracking API endpoints."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio
import json
from typing import Dict, Any

from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()

# Global store for progress updates
progress_queues: Dict[str, asyncio.Queue] = {}


@router.get("/progress/{operation_id}")
async def stream_progress(request: Request, operation_id: str):
    """Stream progress updates for an operation."""
    
    async def event_generator():
        """Generate SSE events."""
        # Create a queue for this client
        queue = asyncio.Queue()
        progress_queues[operation_id] = queue
        
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected', 'operation_id': operation_id})}\n\n"
            
            # Send events from queue
            while True:
                try:
                    # Wait for event with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    if event is None:  # Sentinel to close stream
                        break
                        
                    yield f"data: {json.dumps(event)}\n\n"
                    
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    
        except asyncio.CancelledError:
            logger.info(f"Progress stream cancelled for {operation_id}")
            
        finally:
            # Clean up
            if operation_id in progress_queues:
                del progress_queues[operation_id]
                
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )


async def send_progress_update(operation_id: str, event_type: str, data: Dict[str, Any]):
    """Send progress update to connected clients."""
    if operation_id in progress_queues:
        try:
            event = {
                "type": event_type,
                **data
            }
            await progress_queues[operation_id].put(event)
        except Exception as e:
            logger.error(f"Failed to send progress update: {e}")


async def close_progress_stream(operation_id: str):
    """Close progress stream for an operation."""
    if operation_id in progress_queues:
        await progress_queues[operation_id].put(None)


@router.get("/ingest/progress")
async def stream_progress_by_url(request: Request, url: str):
    """Stream progress updates for a URL ingestion."""
    # Get operation ID from URL mapping
    app = request.app
    url_operations = getattr(app.state, 'url_operations', {})
    
    # Try to find existing operation for this URL
    operation_id = url_operations.get(url)
    
    # If no existing operation, create a new one
    if not operation_id:
        operation_id = f"url_{hash(url)}"
        if not hasattr(app.state, 'url_operations'):
            app.state.url_operations = {}
        app.state.url_operations[url] = operation_id
    
    # Use the existing stream_progress function
    return await stream_progress(request, operation_id)