#!/usr/bin/env python3
"""Test POMV queries with the improved system."""

import asyncio
import aiohttp
import json

async def test_chat_query(query):
    """Test a chat query."""
    url = "http://localhost:8000/api/v1/chat"
    
    payload = {
        "message": query,
        "provider": "openai",
        "model": "gpt-4o-mini",
        "use_rag": True,
        "include_sources": True,
        "chat_history": []
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as response:
            result = await response.json()
            return result

async def main():
    """Run the test."""
    test_queries = [
        "can i drive pomv?",
        "what are the requirements for using my personal vehicle for duty travel?"
    ]
    
    for query in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        print(f"{'='*60}")
        
        try:
            result = await test_chat_query(query)
            
            print(f"\nResponse:\n{result['response']}")
            
            if result.get('sources'):
                print(f"\nSources found: {len(result['sources'])}")
                # Check if PMV content was found
                for source in result['sources']:
                    if 'pmv' in source.get('text', '').lower() or 'pmv' in source.get('section', '').lower():
                        print("✓ PMV/POMV content found in sources")
                        break
                    
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())