#!/usr/bin/env python3
"""Test the chat endpoint directly to find the error."""

import asyncio
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api.chat import chat
from app.models.query import ChatRequest, Provider
from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.services.document_store import DocumentStore

# Mock request object
class MockState:
    def __init__(self):
        self.vector_store_manager = None
        self.document_store = None
        self.cache_service = None

class MockApp:
    def __init__(self):
        self.state = MockState()

class MockRequest:
    def __init__(self):
        self.app = MockApp()

async def test_chat():
    """Test the chat endpoint."""
    try:
        # Initialize components
        print("Initializing vector store...")
        vector_store = VectorStoreManager()
        await vector_store.initialize()
        
        print("Initializing document store...")
        document_store = DocumentStore(vector_store)
        
        # Setup mock request
        request = MockRequest()
        request.app.state.vector_store_manager = vector_store
        request.app.state.document_store = document_store
        
        # Create chat request
        chat_request = ChatRequest(
            message="hello",
            provider=Provider.OPENAI,
            use_rag=False,
            include_sources=False
        )
        
        print("Calling chat endpoint...")
        response = await chat(request, chat_request)
        print(f"Response: {response}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_chat())