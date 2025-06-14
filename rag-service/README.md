# Haystack RAG Service

A production-ready RAG (Retrieval-Augmented Generation) service built with Haystack 2.0 and FastAPI.

## Features

- Document ingestion from files and URLs
- Vector-based semantic search using OpenAI embeddings
- Context-aware chat with conversation history
- Server-Sent Events (SSE) streaming responses
- RESTful API compatible with existing Node.js proxy
- Support for PDF, TXT, HTML, Markdown, and JSON files

## Prerequisites

- Python 3.11+
- OpenAI API key
- (Optional) PostgreSQL 16+ with pgvector for persistent storage

## Quick Start

1. **Setup the environment:**
   ```bash
   ./setup.sh
   ```

2. **Configure environment variables:**
   Edit `.env` file and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

3. **Start the service:**
   ```bash
   ./run.sh
   ```

The service will start on `http://localhost:8000`

## API Endpoints

### Chat
- `POST /chat` - Send a message and receive SSE streaming response
  ```json
  {
    "message": "What is the capital of France?",
    "model": "gpt-4o-mini",
    "provider": "openai"
  }
  ```

### Document Ingestion
- `POST /ingest/url` - Ingest content from a URL
  ```json
  {
    "url": "https://example.com/document.html"
  }
  ```

- `POST /ingest/file` - Ingest a file (base64 encoded)
  ```json
  {
    "filename": "document.pdf",
    "content": "base64-encoded-content",
    "content_type": "application/pdf"
  }
  ```

### Source Management
- `GET /sources` - List all ingested sources
- `GET /sources/{id}` - Get details of a specific source
- `DELETE /sources/{id}` - Delete a source and its documents

### Health & Status
- `GET /status` - Get service status and statistics
- `GET /health` - Basic health check
- `GET /ready` - Readiness probe

## Configuration

Edit `.env` file to configure:

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `VECTOR_STORE_TYPE` - Vector store type: memory, chroma, pgvector
- `CHUNK_SIZE` - Document chunk size (default: 1000)
- `CHUNK_OVERLAP` - Chunk overlap (default: 200)
- `TOP_K_RETRIEVAL` - Number of documents to retrieve (default: 5)
- `LLM_MODEL` - OpenAI model to use (default: gpt-4o-mini)

## Development

### Install in development mode:
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Run tests:
```bash
pytest tests/
```

### Format code:
```bash
black app/
ruff check app/
```

## Integration with Node.js

This service is designed to work with the existing Node.js proxy. The Node.js server forwards requests from `/api/v2/chat` to this service at `http://localhost:8000/chat`.

## Troubleshooting

1. **Port already in use:**
   Change the port in `.env` file or stop the conflicting service

2. **OpenAI API errors:**
   - Check your API key is valid
   - Verify you have sufficient credits
   - Check rate limits

3. **Memory issues with large files:**
   - Reduce `CHUNK_SIZE` in configuration
   - Use persistent vector store (pgvector/chroma)

## License

MIT