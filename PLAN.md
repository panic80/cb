# Haystack 2.0 RAG Pipeline Implementation Plan

## Overview
Implement a production-ready RAG pipeline using Haystack 2.0 that integrates seamlessly with the existing `/chat` interface. The current system has:
- **Frontend**: React chat interface with SSE streaming
- **Backend**: Node.js Express server proxying to Python RAG service at `localhost:8000`
- **Target**: Create the missing Python service using Haystack 2.0

## Phase 1: FastAPI Service Foundation
- Create `rag-service/` directory with proper Python project structure
- Set up FastAPI application with async support
- Configure environment variables (OPENAI_API_KEY, model settings)
- Create Pydantic models for request/response validation
- Add basic error handling and logging

## Phase 2: Haystack 2.0 Pipeline Implementation

### Indexing Pipeline
- **Components**: FileConverter → DocumentSplitter → OpenAIDocumentEmbedder → DocumentWriter
- **Document Store**: MemoryDocumentStore (upgradeable to Elasticsearch)
- **File Support**: PDF, TXT, HTML, JSON, Markdown

### Query Pipeline  
- **Components**: OpenAITextEmbedder → InMemoryEmbeddingRetriever → PromptBuilder → OpenAIGenerator
- **Features**: Context-aware response generation with source citations
- **Streaming**: SSE-compatible async response streaming

## Phase 3: API Endpoints (Node.js Compatible)
- `POST /chat` - RAG chat with SSE streaming
- `POST /ingest/file` - File upload and indexing
- `POST /ingest/url` - URL content ingestion  
- `GET /sources` - List ingested documents
- `DELETE /sources/{id}` - Remove documents
- `GET /status` - Service health and statistics

## Phase 4: Integration & Testing
- Test with existing Node.js proxy at `/api/v2/chat`
- Verify SSE streaming works with React frontend
- Test document ingestion workflows
- Performance optimization and error handling

## Technical Stack
- **FastAPI** + **Haystack 2.0** + **OpenAI** embeddings/generation
- **Uvicorn** ASGI server with async file handling
- Compatible with existing React + Node.js architecture

---

# Haystack 2.0 RAG Pipeline: Step-by-Step Implementation Guide

## **Step 1: Set Up Development Environment**
- Install PostgreSQL 16+ and pgvector extension
- Create Python 3.11+ virtual environment
- Install core dependencies: FastAPI, Haystack 2.0, asyncpg
- Set up project structure with proper folder organization
- Configure environment variables (.env file)

## **Step 2: Initialize PostgreSQL Database**
- Create database and enable pgvector extension
- Design schema for documents, conversations, and messages tables
- Set up indexes for vector similarity and full-text search
- Create initial migration scripts with Alembic
- Test database connection and basic operations

## **Step 3: Build Document Store Wrapper**
- Implement PostgreSQL + pgvector document store integration
- Create abstraction layer for Haystack compatibility
- Add tenant isolation and metadata handling
- Implement hybrid search functionality (vector + keyword)
- Test CRUD operations on documents

## **Step 4: Create Indexing Pipeline**
- Set up file converters (PDF, TXT, HTML, Markdown)
- Configure document splitter with overlap strategy
- Integrate OpenAI embeddings generation
- Implement document deduplication logic
- Build async batch processing for large files

## **Step 5: Build Query Pipeline**
- Implement hybrid retriever combining vector and keyword search
- Create prompt templates with conversation context
- Set up OpenAI generator with streaming support
- Add query expansion and reranking components
- Test end-to-end query flow

## **Step 6: Develop FastAPI Service**
- Create main FastAPI application with CORS and middleware
- Implement `/chat` endpoint with SSE streaming
- Build document ingestion endpoints (`/ingest/file`, `/ingest/url`)
- Add conversation management endpoints
- Create health check and status endpoints

## **Step 7: Implement Security Layer**
- Add JWT authentication middleware
- Implement rate limiting per user/endpoint
- Set up row-level security for multi-tenancy
- Create permission system for document access
- Add input validation and sanitization

## **Step 8: Add Monitoring & Observability**
- Integrate Prometheus metrics (latency, throughput, errors)
- Set up structured logging with correlation IDs
- Implement health checks and readiness probes
- Create dashboard for key metrics
- Add alerting for critical issues

## **Step 9: Test Integration**
- Test with existing Node.js proxy
- Verify SSE streaming with React frontend
- Load test with concurrent users
- Test document ingestion at scale
- Validate security and permissions

## **Step 10: Prepare for Production**
- Create Docker containers for service
- Set up connection pooling and caching
- Configure backup and recovery procedures
- Document API and deployment process
- Create runbooks for common operations

## **Success Criteria**
✅ Service responds to chat queries with relevant context  
✅ Documents are persistently stored and searchable  
✅ Streaming works smoothly with existing frontend  
✅ Multi-tenant isolation is enforced  
✅ System handles 100+ concurrent users  
✅ Monitoring shows system health in real-time

## **Time Estimate**
- **Week 1-2**: Steps 1-3 (Infrastructure & Storage)
- **Week 3-4**: Steps 4-6 (Core Pipeline & API)
- **Week 5**: Steps 7-8 (Security & Monitoring)
- **Week 6**: Steps 9-10 (Testing & Production Prep)

**Total: ~6 weeks for production-ready system**

## Expected Outcome
A robust, production-ready RAG service that provides intelligent responses using uploaded documents, maintains conversation context, supports multi-tenancy, and integrates transparently with the existing chat interface.