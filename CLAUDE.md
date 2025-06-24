# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Primary Development
- `npm run dev` - Start frontend development server (port 3001)
- `npm run dev:server` - Start backend Express server (port 3000)
- `npm run dev:full` - Start both servers concurrently
- `./start-dev.sh` - Development script with cleanup

### RAG Service (Python)
- `cd rag-service && uvicorn app.main:app --reload --port 8000` - Start RAG service
- `cd rag-service && ./setup.sh` - Initial setup for RAG service
- `cd rag-service && docker-compose up -d` - Run with Docker

### Building & Testing
- `npm run build` - Production build
- `npm run test` - Run all tests with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Health Checks & Deployment
- `npm run health-check:local` - Verify local services
- `npm run deploy:staging:script` - Deploy to staging
- `npm run deploy:production:script` - Deploy to production
- `npm run rollback:production:script` - Rollback production deployment

## Architecture Overview

This is a Canadian Forces Travel Instructions Chatbot with a multi-service architecture:

**Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui components
**Backend**: Express.js server with Redis caching and API proxy
**AI Integration**: Multiple LLM providers (OpenAI, Google Gemini, Anthropic)
**RAG Service**: Python/FastAPI with LangChain for document retrieval and citation

### Service Ports
- Frontend dev server: 3001
- Express backend: 3000
- RAG service: 8000
- Redis cache: 6379

### Key Directories
- `/src/` - React frontend code
- `/server/` - Express.js backend
- `/rag-service/` - Python RAG service with LangChain
- `/scripts/` - Deployment and utility scripts

## Configuration

Environment files: `.env`, `.env.development`, `.env.staging`, `.env.production`

Critical environment variables:
- `VITE_GEMINI_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `REDIS_URL` - Redis connection URL
- `NODE_ENV` - Environment mode
- `ENABLE_CACHE` - Cache toggle
- `ENABLE_RATE_LIMIT` - Rate limiting toggle

## Testing

**Frontend**: Vitest + React Testing Library with Happy DOM
**Integration**: Full workflow testing across services

Test files location: `src/**/*.{test,spec}.{js,jsx,ts,tsx}`

## Development Notes

- The system uses Server-Sent Events (SSE) for real-time chat streaming
- Multi-level caching strategy (Redis, in-memory, browser storage)
- PM2 process management in production via `ecosystem.config.cjs`
- Docker Compose setup available for containerized development
- Automated deployment with health checks and rollback capabilities
- Proxy architecture separates API routing from main application logic

## Development Principles

- Always adhere to langchain defacto and builtin solution before creating custom scripts
- Always generate generic solutions, not site or URL or file specific solutions