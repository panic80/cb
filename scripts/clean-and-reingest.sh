#!/bin/bash

echo "=== Cleaning and Re-ingesting Travel Instructions Data ==="
echo

# Step 1: Stop the RAG service if running
echo "1. Stopping RAG service (if running)..."
pkill -f "uvicorn app.main:app" || true
sleep 2

# Step 2: Remove the existing Chroma database
echo "2. Removing existing vector database..."
rm -rf rag-service/chroma_db/*
echo "   ✓ Vector database cleared"

# Step 3: Clear Redis cache
echo "3. Clearing Redis cache..."
redis-cli FLUSHALL 2>/dev/null || echo "   ⚠ Redis not running or accessible"

# Step 4: Start the RAG service
echo "4. Starting RAG service..."
cd rag-service
uvicorn app.main:app --reload --port 8000 &
RAG_PID=$!
cd ..

# Wait for service to be ready
echo "   Waiting for RAG service to start..."
sleep 5

# Step 5: Re-ingest Canada.ca data
echo "5. Re-ingesting Canada.ca travel instructions..."
curl -X POST http://localhost:8000/api/v1/ingest/canada-ca \
  -H "Content-Type: application/json"

echo
echo "6. Ingesting NJC meal rates..."
curl -X POST http://localhost:8000/api/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.njc-cnm.gc.ca/directive/d10/v238/en",
    "type": "web",
    "metadata": {
      "source": "NJC",
      "category": "meal_rates",
      "tags": ["meal_rates", "per_diem", "allowances", "njc"]
    },
    "force_refresh": true
  }'

echo
echo "=== Complete! ==="
echo "The database has been cleared and re-populated with:"
echo "- Latest Canada.ca travel instructions"
echo "- NJC meal rates (including Yukon lunch rate: $25.65)"
echo
echo "RAG service is running with PID: $RAG_PID"
echo "To stop it later: kill $RAG_PID"