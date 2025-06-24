#!/usr/bin/env python3
"""Debug script to check document metadata in retrieval."""

import asyncio
import sys
from app.core.vectorstore import VectorStoreManager
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

async def test_metadata():
    """Test metadata retrieval."""
    query = sys.argv[1] if len(sys.argv) > 1 else "What are the meal rates for Yukon?"
    
    # Initialize vector store
    vector_store = VectorStoreManager()
    await vector_store.initialize()
    
    # Perform search
    results = await vector_store.search(query, k=5)
    
    print(f"\n🔍 Query: '{query}'")
    print("=" * 60)
    print(f"Found {len(results)} documents\n")
    
    for i, (doc, score) in enumerate(results):
        print(f"Document {i+1}:")
        print(f"  Score: {score:.4f}")
        print(f"  Content preview: {doc.page_content[:100]}...")
        print(f"  Metadata keys: {list(doc.metadata.keys())}")
        print(f"  Full metadata:")
        for key, value in doc.metadata.items():
            print(f"    {key}: {value}")
        print("-" * 40)

if __name__ == "__main__":
    asyncio.run(test_metadata())