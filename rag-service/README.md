# Canadian Forces Travel Instructions RAG Service

A Retrieval-Augmented Generation (RAG) service built with FastAPI and LangChain for the Canadian Forces Travel Instructions Chatbot.

## Features

- **Document Ingestion**: Support for web scraping, PDFs, text files, and markdown
- **Smart Text Splitting**: Semantic-aware chunking that preserves document structure
- **Hybrid Search**: Combines semantic similarity and keyword matching
- **Multi-Provider LLM Support**: OpenAI, Google Gemini, and Anthropic
- **Caching**: Redis-based caching for embeddings and query results
- **Source Attribution**: Every response includes verifiable sources
- **Canada.ca Integration**: Automated scraping of official travel instructions

## Architecture

```
rag-service/
├── app/
│   ├── api/              # FastAPI endpoints
│   ├── core/             # Core configuration and services
│   ├── models/           # Pydantic models
│   ├── pipelines/        # Document processing pipelines
│   └── services/         # Business logic services
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Setup

### Prerequisites

- Python 3.11+
- Redis (optional, for caching)
- API keys for at least one LLM provider:
  - OpenAI API key
  - Google Gemini API key
  - Anthropic API key

### Environment Variables

Create a `.env` file in the project root:

```bash
# API Keys
OPENAI_API_KEY=your_openai_key
VITE_GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_anthropic_key

# Redis (optional)
REDIS_URL=redis://localhost:6379

# RAG Configuration (optional)
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
RAG_RETRIEVAL_K=5
```

### Running with Docker

1. Build and start the services:
```bash
docker-compose up -d
```

2. The RAG service will be available at `http://localhost:8000`

### Running Locally

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start Redis (optional):
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

4. Run the service:
```bash
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

### Health Check
- `GET /api/v1/health` - Service health status
- `GET /api/v1/ready` - Readiness check

### Chat
- `POST /api/v1/chat` - Chat with RAG support
- `POST /api/v1/followup` - Generate follow-up questions

### Document Ingestion
- `POST /api/v1/ingest` - Ingest document from URL or content
- `POST /api/v1/ingest/file` - Upload and ingest file
- `POST /api/v1/ingest/batch` - Ingest multiple documents
- `POST /api/v1/ingest/canada-ca` - Scrape and ingest Canada.ca travel instructions
- `DELETE /api/v1/documents/{document_id}` - Delete a document

### Source Management
- `GET /api/v1/sources` - List indexed sources
- `GET /api/v1/sources/{document_id}` - Get specific source
- `POST /api/v1/sources/search` - Search sources
- `GET /api/v1/sources/stats` - Get indexing statistics

## Usage Examples

### Ingest Canada.ca Content

```bash
curl -X POST http://localhost:8000/api/v1/ingest/canada-ca
```

### Chat with RAG

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the meal allowances for travel?",
    "use_rag": true,
    "provider": "openai"
  }'
```

### Upload a PDF

```bash
curl -X POST http://localhost:8000/api/v1/ingest/file \
  -F "file=@policy.pdf" \
  -F "document_type=pdf"
```

## Integration with Express.js Backend

The RAG service is designed to be called from the main Express.js backend. Add these endpoints to your Express server:

```javascript
// Proxy to RAG service
app.post('/api/v2/chat/rag', async (req, res) => {
  const response = await fetch('http://localhost:8000/api/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await response.json();
  res.json(data);
});
```

## Development

### Running Tests

```bash
pytest tests/
```

### Code Formatting

```bash
black app/
flake8 app/
```

## Monitoring

- Check service health: `http://localhost:8000/api/v1/health`
- View API docs: `http://localhost:8000/api/v1/docs`
- Monitor Redis: `redis-cli ping`

## Troubleshooting

### Common Issues

1. **Import errors**: Ensure all dependencies are installed
2. **Vector store errors**: Check that ChromaDB directory has write permissions
3. **API key errors**: Verify environment variables are set correctly
4. **Memory issues**: Adjust chunk size and batch processing settings

### Logs

- Application logs are written to `./logs/` directory
- Use structured JSON logging for production
- Set `RAG_LOG_LEVEL=DEBUG` for verbose logging