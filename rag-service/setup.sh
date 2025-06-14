#!/bin/bash

echo "Setting up Haystack RAG Service..."

# Check Python version
PYTHON_CMD=""
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD="python3.10"
elif command -v python3.9 &> /dev/null; then
    PYTHON_CMD="python3.9"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "Error: Python 3 not found. Please install Python 3.9 or higher."
    exit 1
fi

echo "Using Python: $PYTHON_CMD"
$PYTHON_CMD --version

# Create virtual environment
echo "Creating Python virtual environment..."
$PYTHON_CMD -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Create .env file from example if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please edit .env file and add your OpenAI API key"
fi

# Create necessary directories
mkdir -p logs
mkdir -p data
mkdir -p chroma_db

echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your OpenAI API key"
echo "2. Run ./run.sh to start the service"