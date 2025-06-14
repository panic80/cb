#!/bin/bash

# Activate virtual environment
source venv/bin/activate

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    echo "Please run ./setup.sh first and configure your .env file"
    exit 1
fi

# Check if OPENAI_API_KEY is set
if ! grep -q "OPENAI_API_KEY=.*[a-zA-Z0-9]" .env; then
    echo "Error: OPENAI_API_KEY not configured in .env file!"
    echo "Please add your OpenAI API key to the .env file"
    exit 1
fi

# Start the service
echo "Starting Haystack RAG Service on http://localhost:8000..."
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload