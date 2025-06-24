#!/usr/bin/env python3
"""Test script to diagnose table rendering issues."""

import asyncio
import httpx
import json

BASE_URL = "http://localhost:8000/api/v1"

async def test_query(query: str, use_streaming: bool = False):
    """Test a query and return the response."""
    endpoint = "/streaming_chat" if use_streaming else "/chat"
    
    headers = {
        "Content-Type": "application/json",
    }
    
    payload = {
        "message": query,
        "provider": "openai",
        "model": "gpt-4",
        "use_rag": True,
        "include_sources": True,
        "chat_history": []
    }
    
    print(f"\n{'='*60}")
    print(f"Testing: {query}")
    print(f"Endpoint: {endpoint}")
    print(f"{'='*60}\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        if use_streaming:
            async with client.stream('POST', f"{BASE_URL}{endpoint}", json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            if data['type'] == 'token':
                                print(data['content'], end='', flush=True)
                            elif data['type'] == 'complete':
                                print("\n\n[Streaming complete]")
                        except json.JSONDecodeError:
                            pass
        else:
            response = await client.post(f"{BASE_URL}{endpoint}", json=payload)
            response.raise_for_status()
            data = response.json()
            print("Response:")
            print(data['response'])
            print(f"\nSources: {len(data.get('sources', []))}")

async def main():
    """Run diagnostic tests."""
    # Test queries that should return tables
    test_queries = [
        "What is the lunch rate in Yukon?",
        "What is the incidental rate in Canada?",
        "Show me meal allowances for breakfast, lunch and dinner",
        "What are the kilometric rates?"
    ]
    
    print("DIAGNOSTIC TEST FOR TABLE RENDERING")
    print("Check logs for [TABLE_DIAG], [PROMPT_DIAG], and [RESPONSE_DIAG] markers")
    
    for query in test_queries:
        # Test regular endpoint
        await test_query(query, use_streaming=False)
        
        # Test streaming endpoint
        await test_query(query, use_streaming=True)
        
        print("\n" + "-"*60 + "\n")

if __name__ == "__main__":
    asyncio.run(main())