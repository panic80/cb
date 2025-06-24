#!/usr/bin/env python3
"""Test the chat API with meal allowance queries."""

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
        "show me the meal allowance table",
        "what are the meal rates for Canada",
        "breakfast lunch dinner allowances"
    ]
    
    for query in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        print(f"{'='*60}")
        
        try:
            result = await test_chat_query(query)
            
            print(f"\nResponse: {result['response']}")
            
            if result.get('sources'):
                print(f"\nSources found: {len(result['sources'])}")
                for i, source in enumerate(result['sources'][:3]):
                    print(f"\nSource {i+1}:")
                    print(f"  Section: {source.get('section', 'Unknown')}")
                    print(f"  Score: {source.get('score', 'Unknown')}")
                    
                    # Check if this source has meal table content
                    text = source.get('text', '')
                    if '$' in text and ('breakfast' in text.lower() or 'lunch' in text.lower()):
                        print(f"  ✓ Contains meal rates")
                        # Show a bit more of the content
                        print(f"  Content preview: {text[:300]}...")
                    else:
                        print(f"  Text preview: {text[:100]}...")
                    
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())