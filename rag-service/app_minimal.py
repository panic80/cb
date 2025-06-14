"""
Minimal RAG Service to test integration with existing Node.js proxy.
This is a simplified version without Haystack for initial testing.
"""

import logging
import asyncio
import json
import uuid
from typing import AsyncGenerator, Optional, Dict, List
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
import httpx
from bs4 import BeautifulSoup

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai_client = None

# In-memory storage
documents = {}
sources = {}
conversations = {}


class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = "gpt-4o-mini"
    provider: Optional[str] = "openai"
    conversation_id: Optional[str] = None
    stream: bool = True


class URLIngestRequest(BaseModel):
    url: str
    metadata: Optional[Dict] = None


class FileIngestRequest(BaseModel):
    filename: str
    content: str  # Base64 encoded
    content_type: str
    metadata: Optional[Dict] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize app on startup."""
    global openai_client
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not found in environment")
    else:
        openai_client = AsyncOpenAI(api_key=api_key)
        logger.info("OpenAI client initialized")
    
    yield
    
    logger.info("Shutting down...")


app = FastAPI(
    title="Minimal RAG Service",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def generate_sse_stream(
    message: str,
    model: str,
    conversation_id: str = None
) -> AsyncGenerator[str, None]:
    """Generate SSE stream for chat response."""
    try:
        if not openai_client:
            yield "data: Error: OpenAI client not initialized. Please check your API key.\n\n"
            yield "data: [DONE]\n\n"
            return
        
        # Get conversation history
        if conversation_id and conversation_id in conversations:
            messages = conversations[conversation_id]
        else:
            messages = []
        
        # Add system message
        system_message = {
            "role": "system",
            "content": "You are a helpful AI assistant."
        }
        
        # Build messages
        full_messages = [system_message] + messages + [{"role": "user", "content": message}]
        
        # Generate streaming response
        stream = await openai_client.chat.completions.create(
            model=model,
            messages=full_messages,
            stream=True,
            temperature=0.7,
            max_tokens=4096
        )
        
        full_response = ""
        buffer = ""
        sentence_count = 0
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_response += content
                buffer += content
                
                # Count complete sentences
                if content in '.!?':
                    sentence_count += 1
                
                # Send complete paragraphs (2-3 sentences) or when we hit natural paragraph breaks
                if ((sentence_count >= 2 and buffer.endswith(('.', '!', '?'))) or 
                    buffer.endswith('\n\n') or
                    (sentence_count >= 3) or
                    (len(buffer) > 150 and buffer.endswith('.'))):
                    yield f"data: {buffer.strip()}\n\n"
                    buffer = ""
                    sentence_count = 0
        
        # Send any remaining content
        if buffer:
            yield f"data: {buffer.strip()}\n\n"
        
        # Store conversation
        if not conversation_id:
            conversation_id = str(uuid.uuid4())
        
        if conversation_id not in conversations:
            conversations[conversation_id] = []
        
        conversations[conversation_id].extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": full_response}
        ])
        
        # Keep only last 10 messages
        conversations[conversation_id] = conversations[conversation_id][-10:]
        
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        logger.error(f"Error in SSE stream: {e}", exc_info=True)
        yield f"data: Error: {str(e)}\n\n"
        yield "data: [DONE]\n\n"


@app.post("/chat")
async def chat(request: ChatRequest):
    """Handle chat requests with streaming."""
    logger.info(f"Chat request: {request.message[:50]}...")
    
    return StreamingResponse(
        generate_sse_stream(
            message=request.message,
            model=request.model,
            conversation_id=request.conversation_id
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/ingest/url")
async def ingest_url(request: URLIngestRequest):
    """Ingest content from URL."""
    try:
        logger.info(f"Ingesting URL: {request.url}")
        
        # Fetch URL content
        async with httpx.AsyncClient() as client:
            response = await client.get(request.url)
            response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, "html.parser")
        text = soup.get_text()
        
        # Store document
        doc_id = str(uuid.uuid4())
        documents[doc_id] = {
            "id": doc_id,
            "content": text[:10000],  # Limit content size
            "source": request.url,
            "metadata": request.metadata or {}
        }
        
        sources[doc_id] = {
            "id": doc_id,
            "title": request.url,
            "source": request.url,
            "content_type": "text/html",
            "chunk_count": 1,
            "created_at": datetime.utcnow()
        }
        
        return {
            "id": doc_id,
            "status": "success",
            "message": f"Successfully ingested content from {request.url}",
            "document_count": 1
        }
        
    except Exception as e:
        logger.error(f"URL ingestion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest/file")
async def ingest_file(request: FileIngestRequest):
    """Ingest file content."""
    try:
        logger.info(f"Ingesting file: {request.filename}")
        
        import base64
        
        # Decode base64 content
        try:
            file_content = base64.b64decode(request.content)
            text = file_content.decode('utf-8')
        except Exception:
            text = "Binary file content"
        
        # Store document
        doc_id = str(uuid.uuid4())
        documents[doc_id] = {
            "id": doc_id,
            "content": text[:10000],  # Limit content size
            "source": request.filename,
            "metadata": request.metadata or {}
        }
        
        sources[doc_id] = {
            "id": doc_id,
            "title": request.filename,
            "source": request.filename,
            "content_type": request.content_type,
            "chunk_count": 1,
            "created_at": datetime.utcnow()
        }
        
        return {
            "id": doc_id,
            "status": "success",
            "message": f"Successfully ingested file: {request.filename}",
            "document_count": 1
        }
        
    except Exception as e:
        logger.error(f"File ingestion error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sources")
async def list_sources():
    """List all sources."""
    return {
        "sources": [
            {
                "id": s["id"],
                "title": s["title"],
                "source": s["source"],
                "content_type": s["content_type"],
                "chunk_count": s["chunk_count"],
                "created_at": s["created_at"].isoformat()
            }
            for s in sources.values()
        ],
        "total": len(sources)
    }


@app.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """Delete a source."""
    if source_id in sources:
        del sources[source_id]
        if source_id in documents:
            del documents[source_id]
        return {
            "id": source_id,
            "status": "success",
            "message": "Source deleted successfully"
        }
    else:
        raise HTTPException(status_code=404, detail="Source not found")


@app.get("/status")
async def get_status():
    """Get service status."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "document_count": len(documents),
        "vector_store_type": "memory",
        "models": {
            "embedding": "text-embedding-3-small",
            "llm": "gpt-4o-mini"
        },
        "uptime": 0
    }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Minimal RAG Service",
        "version": "1.0.0",
        "status": "running"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)