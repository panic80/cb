#!/usr/bin/env python3
"""
Simple test to check streaming endpoint and metadata.
"""
import asyncio
import json
import time
import aiohttp

async def test_streaming():
    url = "http://localhost:8000/api/v1/streaming_chat"
    payload = {
        "message": "What is the incidental allownace rate",
        "model": "gpt-4.1-mini",
        "stream": True
    }
    
    sources_received = []
    tokens_received = []
    first_token_time = None
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            url,
            json=payload,
            headers={"Accept": "text/event-stream"}
        ) as response:
            
            if response.status != 200:
                error_text = await response.text()
                print(f"❌ HTTP {response.status}: {error_text}")
                return
            
            print("✅ Connected to streaming endpoint")
            
            async for line in response.content:
                if line:
                    line_str = line.decode('utf-8').strip()
                    
                    # Parse SSE format
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        
                        if data_str == "[DONE]":
                            print("✅ Stream completed")
                            break
                        
                        try:
                            event_data = json.loads(data_str)
                            event_type = event_data.get("type")
                            
                            if event_type == "sources":
                                sources = event_data.get("sources", [])
                                sources_received = sources
                                print(f"\n📚 Received {len(sources)} sources:")
                                for i, source in enumerate(sources[:5]):  # Show first 5
                                    # The endpoint sends 'url' field, not 'source'
                                    url = source.get('url', 'Unknown')
                                    print(f"   [{i+1}] {url}")
                                    
                            elif event_type == "first_token":
                                first_token_time = time.time()
                                latency = (first_token_time - start_time) * 1000
                                print(f"\n⏱️  First token latency: {latency:.2f}ms")
                                
                            elif event_type == "token":
                                # The endpoint sends 'content' field, not 'token'
                                token = event_data.get("content", "")
                                tokens_received.append(token)
                                print(token, end="", flush=True)
                                
                            elif event_type == "complete":
                                total_time = (time.time() - start_time) * 1000
                                print(f"\n\n✅ Generation complete")
                                print(f"⏱️  Total time: {total_time:.2f}ms")
                                
                        except json.JSONDecodeError as e:
                            print(f"\n❌ Failed to parse event: {e}")
                            print(f"   Raw: {line_str}")
    
    # Summary
    print("\n" + "="*50)
    print("SUMMARY:")
    print(f"Total tokens received: {len(tokens_received)}")
    print(f"Total response: {len(''.join(tokens_received))} chars")
    print(f"Sources with metadata: {sum(1 for s in sources_received if s.get('url') != 'Unknown')}/{len(sources_received)}")
    
    # Check for metadata issues
    if sources_received:
        unknown_sources = [s for s in sources_received if s.get('url') == 'Unknown']
        if unknown_sources:
            print(f"\n⚠️  WARNING: {len(unknown_sources)} sources have 'Unknown' as URL")
            print("First unknown source data:")
            print(json.dumps(unknown_sources[0], indent=2))

if __name__ == "__main__":
    asyncio.run(test_streaming())
