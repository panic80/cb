"""
Simple client for testing the streaming chat endpoint.

This demonstrates how to consume Server-Sent Events (SSE) from the streaming endpoint.
"""
import asyncio
import json
import time
import aiohttp
from typing import Dict, Any, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StreamingChatClient:
    """Client for interacting with the streaming chat endpoint."""
    
    def __init__(self, base_url: str = "http://localhost:8000/api/v1"):
        self.base_url = base_url
        self.streaming_url = f"{base_url}/streaming_chat"
    
    async def stream_chat(self, message: str, model: str = "gpt-4", 
                          on_token: Optional[callable] = None,
                          on_source: Optional[callable] = None) -> Dict[str, Any]:
        """
        Stream a chat response from the server.
        
        Args:
            message: The user's message
            model: The model to use
            on_token: Callback for each token received
            on_source: Callback for source documents
            
        Returns:
            Dictionary with response details
        """
        response_data = {
            "message": "",
            "sources": [],
            "metadata": {},
            "timings": {},
            "error": None
        }
        
        start_time = time.time()
        first_token_time = None
        
        payload = {
            "message": message,
            "model": model,
            "stream": True
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.streaming_url,
                    json=payload,
                    headers={"Accept": "text/event-stream"}
                ) as response:
                    
                    if response.status != 200:
                        error_text = await response.text()
                        response_data["error"] = f"HTTP {response.status}: {error_text}"
                        return response_data
                    
                    logger.info("Connected to streaming endpoint")
                    
                    async for line in response.content:
                        if line:
                            line_str = line.decode('utf-8').strip()
                            
                            # Parse SSE format
                            if line_str.startswith("data: "):
                                data_str = line_str[6:]
                                
                                if data_str == "[DONE]":
                                    logger.info("Stream completed")
                                    break
                                
                                try:
                                    event_data = json.loads(data_str)
                                    await self._handle_event(
                                        event_data, response_data,
                                        on_token, on_source,
                                        start_time, first_token_time
                                    )
                                    
                                    # Track first token time
                                    if event_data.get("type") == "first_token" and not first_token_time:
                                        first_token_time = time.time()
                                        
                                except json.JSONDecodeError as e:
                                    logger.error(f"Failed to parse event: {e}")
                                    continue
                            
                            elif line_str.startswith("event: "):
                                # Handle named events if needed
                                event_name = line_str[7:]
                                logger.debug(f"Received event: {event_name}")
        
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            response_data["error"] = str(e)
        
        # Calculate final timings
        total_time = time.time() - start_time
        response_data["timings"]["total_time_ms"] = total_time * 1000
        
        if first_token_time:
            response_data["timings"]["first_token_latency_ms"] = (first_token_time - start_time) * 1000
        
        return response_data
    
    async def _handle_event(self, event_data: Dict[str, Any], 
                           response_data: Dict[str, Any],
                           on_token: Optional[callable],
                           on_source: Optional[callable],
                           start_time: float,
                           first_token_time: Optional[float]):
        """Handle a streaming event."""
        event_type = event_data.get("type")
        
        if event_type == "connection":
            logger.info(f"Connection established: {event_data.get('message')}")
            
        elif event_type == "retrieval_start":
            logger.info("Starting document retrieval...")
            
        elif event_type == "retrieval_complete":
            retrieval_time = event_data.get("retrieval_time_ms", 0)
            doc_count = event_data.get("document_count", 0)
            logger.info(f"Retrieval complete: {doc_count} docs in {retrieval_time:.2f}ms")
            response_data["timings"]["retrieval_time_ms"] = retrieval_time
            
        elif event_type == "sources":
            sources = event_data.get("sources", [])
            response_data["sources"] = sources
            logger.info(f"Received {len(sources)} source documents")
            
            if on_source:
                await on_source(sources)
                
        elif event_type == "generation_start":
            logger.info("Starting response generation...")
            
        elif event_type == "first_token":
            latency = event_data.get("latency_ms", 0)
            logger.info(f"First token received: {latency:.2f}ms")
            response_data["timings"]["first_token_latency_ms"] = latency
            
        elif event_type == "token":
            token = event_data.get("token", "")
            response_data["message"] += token
            
            if on_token:
                await on_token(token)
                
        elif event_type == "complete":
            total_tokens = event_data.get("total_tokens", 0)
            generation_time = event_data.get("generation_time_ms", 0)
            logger.info(f"Generation complete: {total_tokens} tokens in {generation_time:.2f}ms")
            response_data["timings"]["generation_time_ms"] = generation_time
            response_data["metadata"]["total_tokens"] = total_tokens
            
        elif event_type == "error":
            error = event_data.get("error", "Unknown error")
            logger.error(f"Stream error: {error}")
            response_data["error"] = error


async def interactive_chat():
    """Run an interactive chat session with streaming."""
    client = StreamingChatClient()
    
    print("\n🚀 RAG Streaming Chat Client")
    print("=" * 50)
    print("Type your questions (or 'quit' to exit)")
    print("=" * 50)
    
    # Token callback to print tokens as they arrive
    async def print_token(token: str):
        print(token, end="", flush=True)
    
    # Source callback to display sources
    async def print_sources(sources: list):
        print("\n\n📚 Sources:")
        for i, source in enumerate(sources[:3]):  # Show top 3 sources
            print(f"  [{i+1}] {source.get('source', 'Unknown')}")
            if source.get('snippet'):
                print(f"      {source['snippet'][:100]}...")
    
    while True:
        try:
            # Get user input
            user_input = input("\n\n👤 You: ")
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                print("Goodbye! 👋")
                break
            
            print("\n🤖 Assistant: ", end="", flush=True)
            
            # Stream the response
            result = await client.stream_chat(
                user_input,
                on_token=print_token,
                on_source=print_sources
            )
            
            # Display timing information
            if not result.get("error"):
                timings = result.get("timings", {})
                print(f"\n\n⏱️  Performance:")
                print(f"   First token: {timings.get('first_token_latency_ms', 0):.2f}ms")
                print(f"   Retrieval: {timings.get('retrieval_time_ms', 0):.2f}ms")
                print(f"   Generation: {timings.get('generation_time_ms', 0):.2f}ms")
                print(f"   Total: {timings.get('total_time_ms', 0):.2f}ms")
            else:
                print(f"\n\n❌ Error: {result['error']}")
                
        except KeyboardInterrupt:
            print("\n\nInterrupted. Goodbye! 👋")
            break
        except Exception as e:
            print(f"\n\n❌ Error: {e}")


async def test_specific_queries():
    """Test specific queries to verify functionality."""
    client = StreamingChatClient()
    
    test_queries = [
        "What are the meal allowances for travel to Toronto?",
        "How do I claim POMV expenses?",
        "What is the kilometric rate for Ontario?"
    ]
    
    print("\n🧪 Testing Specific Queries")
    print("=" * 50)
    
    for query in test_queries:
        print(f"\n📝 Query: {query}")
        print("-" * 40)
        
        result = await client.stream_chat(query)
        
        if not result.get("error"):
            print(f"✅ Response: {result['message'][:200]}...")
            print(f"📚 Sources: {len(result['sources'])} documents")
            print(f"⏱️  First token: {result['timings'].get('first_token_latency_ms', 0):.2f}ms")
        else:
            print(f"❌ Error: {result['error']}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        # Run specific test queries
        asyncio.run(test_specific_queries())
    else:
        # Run interactive chat
        asyncio.run(interactive_chat())