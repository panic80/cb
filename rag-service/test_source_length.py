#!/usr/bin/env python3
"""Test to check source preview lengths."""

import asyncio
import aiohttp
import json

async def test_chat_query(query):
    """Test a chat query and check source lengths."""
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
    query = "show me the complete meal allowance table with all rates"
    
    print(f"Query: {query}")
    print("="*60)
    
    try:
        result = await test_chat_query(query)
        
        print(f"\nResponse preview: {result['response'][:200]}...")
        
        if result.get('sources'):
            print(f"\nTotal sources: {len(result['sources'])}")
            
            for i, source in enumerate(result['sources'][:3]):
                text_len = len(source['text'])
                print(f"\nSource {i+1}:")
                print(f"  Section: {source.get('section', 'Unknown')}")
                print(f"  Text length: {text_len} characters")
                
                # Check if it's table content
                if '|' in source['text']:
                    print("  ✓ Contains table content")
                    # Count table rows
                    rows = source['text'].count('\n')
                    print(f"  Rows: ~{rows}")
                    
                    # Show if it was truncated
                    if source['text'].endswith('...'):
                        print("  ⚠️  TRUNCATED")
                    else:
                        print("  ✓ COMPLETE (not truncated)")
                        
                # Show first and last 200 chars to see what we got
                if text_len > 400:
                    print(f"  Start: {source['text'][:200]}")
                    print(f"  ...")
                    print(f"  End: {source['text'][-200:]}")
                else:
                    print(f"  Full text: {source['text']}")
                    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())