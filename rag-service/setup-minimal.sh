#!/bin/bash

echo "Setting up Minimal RAG Service..."

# Create virtual environment with Python 3.11 or 3.10
if command -v python3.11 &> /dev/null; then
    python3.11 -m venv venv
elif command -v python3.10 &> /dev/null; then
    python3.10 -m venv venv
else
    echo "Please install Python 3.10 or 3.11"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install minimal dependencies
pip install -r requirements-minimal.txt

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Please edit .env file and add your OpenAI API key"
fi

echo "Setup complete!"
echo "Run: source venv/bin/activate && python app_minimal.py"