#!/usr/bin/env python3
"""Test searching for Yukon lunch rates in the vector store."""

import asyncio
from app.core.vectorstore import VectorStoreManager
from app.core.config import settings


async def test_yukon_search():
    """Search for Yukon lunch rates in the vector store."""
    
    # Initialize vector store
    vector_store = VectorStoreManager()
    await vector_store.initialize()
    
    # Search queries
    queries = [
        "Yukon lunch rate",
        "lunch rate Yukon $25.65",
        "meal rates Yukon",
        "Yukon meal allowance lunch"
    ]
    
    print("Searching vector store for Yukon lunch rates...")
    print("=" * 60)
    
    for query in queries:
        print(f"\nQuery: '{query}'")
        print("-" * 40)
        
        # Search
        results = await vector_store.search(
            query=query,
            k=5
        )
        
        for i, doc in enumerate(results):
            print(f"\nResult {i+1}:")
            print(f"Content: {doc.page_content[:200]}...")
            print(f"Source: {doc.metadata.get('source', 'Unknown')}")
            if "$" in doc.page_content:
                # Extract dollar amounts
                import re
                amounts = re.findall(r'\$\d+(?:\.\d{2})?', doc.page_content)
                if amounts:
                    print(f"Dollar amounts found: {', '.join(amounts[:5])}")


asyncio.run(test_yukon_search())