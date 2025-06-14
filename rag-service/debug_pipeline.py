#!/usr/bin/env python3
"""Debug script to test the query pipeline step by step."""

import os
import sys
import asyncio
from dotenv import load_dotenv

# Add the app directory to the path
sys.path.append('app')

from app.pipelines.manager import PipelineManager

async def debug_pipeline():
    """Debug the pipeline step by step."""
    load_dotenv()
    
    # Initialize pipeline manager
    manager = PipelineManager()
    await manager.initialize()
    
    print("=== Pipeline Debug ===")
    
    # Check document count
    doc_count = await manager.get_document_count()
    print(f"Document count: {doc_count}")
    
    # Test query
    query = "what are travel rates"
    print(f"Testing query: {query}")
    
    # Run the pipeline manually and inspect results
    result = manager._run_query_pipeline(query, [], "gpt-4o-mini")
    print(f"Pipeline result: {result}")
    print(f"Answer: '{result.get('answer', 'NO ANSWER')}'")
    print(f"Sources: {len(result.get('sources', []))} sources")
    
    # Check the raw pipeline output
    raw_result = manager.query_pipeline.run({
        "embedder": {"text": query},
        "prompt_builder": {
            "question": query,
            "conversation_history": []
        }
    })
    print(f"Raw pipeline result keys: {list(raw_result.keys())}")
    for key, value in raw_result.items():
        print(f"  {key}: {type(value)} - {str(value)[:100]}...")

if __name__ == "__main__":
    asyncio.run(debug_pipeline())