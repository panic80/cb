"""
Performance test suite for Phase 4 RAG stack upgrade.

Tests streaming functionality, concurrent connections, and first token latency.
Target: < 500ms first token latency, 100+ concurrent users.
"""
import asyncio
import json
import time
import statistics
from typing import List, Dict, Any, Tuple
from datetime import datetime
from dataclasses import dataclass, field
import aiohttp
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

@dataclass
class PerformanceMetrics:
    """Tracks performance metrics for a test run."""
    first_token_latencies: List[float] = field(default_factory=list)
    total_response_times: List[float] = field(default_factory=list)
    tokens_received: List[int] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    connection_times: List[float] = field(default_factory=list)
    
    def add_result(self, first_token_latency: float, total_time: float, 
                   tokens: int, connection_time: float):
        """Add a successful result."""
        self.first_token_latencies.append(first_token_latency)
        self.total_response_times.append(total_time)
        self.tokens_received.append(tokens)
        self.connection_times.append(connection_time)
    
    def add_error(self, error: str):
        """Add an error."""
        self.errors.append(error)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary statistics."""
        if not self.first_token_latencies:
            return {"error": "No successful responses"}
        
        return {
            "total_requests": len(self.first_token_latencies) + len(self.errors),
            "successful_requests": len(self.first_token_latencies),
            "failed_requests": len(self.errors),
            "error_rate": len(self.errors) / (len(self.first_token_latencies) + len(self.errors)) * 100,
            "first_token_latency": {
                "min": min(self.first_token_latencies),
                "max": max(self.first_token_latencies),
                "mean": statistics.mean(self.first_token_latencies),
                "median": statistics.median(self.first_token_latencies),
                "p95": sorted(self.first_token_latencies)[int(len(self.first_token_latencies) * 0.95)],
                "p99": sorted(self.first_token_latencies)[int(len(self.first_token_latencies) * 0.99)]
            },
            "total_response_time": {
                "min": min(self.total_response_times),
                "max": max(self.total_response_times),
                "mean": statistics.mean(self.total_response_times),
                "median": statistics.median(self.total_response_times)
            },
            "connection_time": {
                "mean": statistics.mean(self.connection_times),
                "median": statistics.median(self.connection_times)
            },
            "tokens_per_response": {
                "mean": statistics.mean(self.tokens_received),
                "total": sum(self.tokens_received)
            }
        }


class StreamingPerformanceTester:
    """Tests streaming endpoint performance."""
    
    def __init__(self, base_url: str = "http://localhost:8000/api/v1"):
        self.base_url = base_url
        self.streaming_url = f"{base_url}/streaming_chat"
        
    async def test_single_streaming_request(self, query: str, model: str = "gpt-4") -> Tuple[float, float, int, float]:
        """
        Test a single streaming request and measure performance.
        
        Returns: (first_token_latency_ms, total_time_ms, token_count, connection_time_ms)
        """
        start_time = time.time()
        first_token_time = None
        token_count = 0
        connection_time = None
        
        payload = {
            "message": query,
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
                    connection_time = (time.time() - start_time) * 1000
                    
                    async for line in response.content:
                        if line:
                            line_str = line.decode('utf-8').strip()
                            
                            if line_str.startswith("data: "):
                                data_str = line_str[6:]
                                
                                if data_str == "[DONE]":
                                    break
                                
                                try:
                                    event_data = json.loads(data_str)
                                    event_type = event_data.get("type")
                                    
                                    if event_type == "first_token" and first_token_time is None:
                                        first_token_time = time.time()
                                    elif event_type == "token":
                                        token_count += 1
                                        
                                except json.JSONDecodeError:
                                    continue
                    
                    total_time = time.time() - start_time
                    first_token_latency = (first_token_time - start_time) * 1000 if first_token_time else -1
                    
                    return (first_token_latency, total_time * 1000, token_count, connection_time)
                    
        except Exception as e:
            logger.error(f"Error in streaming request: {e}")
            raise
    
    async def test_concurrent_streaming(self, num_concurrent: int, queries: List[str]) -> PerformanceMetrics:
        """Test multiple concurrent streaming connections."""
        metrics = PerformanceMetrics()
        
        # Create tasks for concurrent requests
        tasks = []
        for i in range(num_concurrent):
            query = queries[i % len(queries)]
            tasks.append(self.test_single_streaming_request(query))
        
        # Execute all tasks concurrently
        logger.info(f"Starting {num_concurrent} concurrent streaming requests...")
        start_time = time.time()
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        total_time = time.time() - start_time
        logger.info(f"Completed {num_concurrent} requests in {total_time:.2f}s")
        
        # Process results
        for result in results:
            if isinstance(result, Exception):
                metrics.add_error(str(result))
            else:
                first_token_latency, total_time, tokens, connection_time = result
                if first_token_latency > 0:
                    metrics.add_result(first_token_latency, total_time, tokens, connection_time)
                else:
                    metrics.add_error("No first token received")
        
        return metrics
    
    async def test_sustained_load(self, requests_per_second: int, duration_seconds: int, 
                                  queries: List[str]) -> PerformanceMetrics:
        """Test sustained load with controlled request rate."""
        metrics = PerformanceMetrics()
        request_interval = 1.0 / requests_per_second
        
        logger.info(f"Starting sustained load test: {requests_per_second} req/s for {duration_seconds}s")
        
        start_time = time.time()
        request_count = 0
        
        while time.time() - start_time < duration_seconds:
            # Start a request
            query = queries[request_count % len(queries)]
            asyncio.create_task(self._track_request(query, metrics))
            
            request_count += 1
            
            # Wait for next request interval
            await asyncio.sleep(request_interval)
        
        # Wait for all pending requests to complete
        logger.info(f"Waiting for {request_count} requests to complete...")
        await asyncio.sleep(5)  # Give requests time to complete
        
        return metrics
    
    async def _track_request(self, query: str, metrics: PerformanceMetrics):
        """Track a single request for sustained load testing."""
        try:
            result = await self.test_single_streaming_request(query)
            first_token_latency, total_time, tokens, connection_time = result
            if first_token_latency > 0:
                metrics.add_result(first_token_latency, total_time, tokens, connection_time)
            else:
                metrics.add_error("No first token received")
        except Exception as e:
            metrics.add_error(str(e))
    
    async def test_backpressure_handling(self, slow_client_delay_ms: int = 100) -> Dict[str, Any]:
        """Test how the system handles slow clients (backpressure)."""
        query = "What are the meal allowances for travel to Toronto?"
        results = {
            "tokens_received": 0,
            "connection_dropped": False,
            "errors": [],
            "total_time_ms": 0
        }
        
        start_time = time.time()
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.streaming_url,
                    json={"message": query, "model": "gpt-4", "stream": True},
                    headers={"Accept": "text/event-stream"}
                ) as response:
                    
                    async for line in response.content:
                        if line:
                            # Simulate slow client
                            await asyncio.sleep(slow_client_delay_ms / 1000)
                            
                            line_str = line.decode('utf-8').strip()
                            if line_str.startswith("data: "):
                                data_str = line_str[6:]
                                
                                if data_str == "[DONE]":
                                    break
                                
                                try:
                                    event_data = json.loads(data_str)
                                    if event_data.get("type") == "token":
                                        results["tokens_received"] += 1
                                except json.JSONDecodeError:
                                    continue
                    
                    results["total_time_ms"] = (time.time() - start_time) * 1000
                    
        except Exception as e:
            results["errors"].append(str(e))
            results["connection_dropped"] = True
        
        return results


async def run_performance_tests():
    """Run complete performance test suite."""
    tester = StreamingPerformanceTester()
    
    # Test queries
    test_queries = [
        "What are the meal allowances for travel to Toronto?",
        "How do I claim POMV expenses?",
        "What is the kilometric rate for Ontario?",
        "Tell me about travel advances",
        "What are the rules for booking hotels?",
        "How do I submit travel claims?",
        "What are the per diem rates for Vancouver?",
        "Explain the travel card policy",
        "What documents do I need for international travel?",
        "How are taxi expenses reimbursed?"
    ]
    
    print("\n" + "="*60)
    print("RAG STREAMING PERFORMANCE TEST SUITE")
    print("="*60)
    
    # Test 1: Single request baseline
    print("\n[1] Single Request Baseline Test")
    print("-" * 40)
    try:
        latency, total_time, tokens, conn_time = await tester.test_single_streaming_request(test_queries[0])
        print(f"✓ First token latency: {latency:.2f}ms")
        print(f"✓ Total response time: {total_time:.2f}ms")
        print(f"✓ Tokens received: {tokens}")
        print(f"✓ Connection time: {conn_time:.2f}ms")
        
        if latency < 500:
            print("✅ PASSED: First token latency < 500ms target")
        else:
            print("❌ FAILED: First token latency exceeds 500ms target")
    except Exception as e:
        print(f"❌ Test failed: {e}")
    
    # Test 2: Concurrent connections
    print("\n[2] Concurrent Connection Test")
    print("-" * 40)
    
    for concurrent_users in [10, 50, 100, 150]:
        print(f"\nTesting with {concurrent_users} concurrent users...")
        try:
            metrics = await tester.test_concurrent_streaming(concurrent_users, test_queries)
            summary = metrics.get_summary()
            
            if "error" not in summary:
                print(f"✓ Success rate: {100 - summary['error_rate']:.1f}%")
                print(f"✓ First token latency - Mean: {summary['first_token_latency']['mean']:.2f}ms, "
                      f"P95: {summary['first_token_latency']['p95']:.2f}ms, "
                      f"P99: {summary['first_token_latency']['p99']:.2f}ms")
                
                if summary['first_token_latency']['p95'] < 500:
                    print(f"✅ PASSED: P95 latency < 500ms with {concurrent_users} users")
                else:
                    print(f"❌ FAILED: P95 latency exceeds 500ms with {concurrent_users} users")
            else:
                print(f"❌ Test failed: {summary['error']}")
                
        except Exception as e:
            print(f"❌ Test failed: {e}")
    
    # Test 3: Sustained load
    print("\n[3] Sustained Load Test")
    print("-" * 40)
    print("Testing 20 requests/second for 30 seconds...")
    
    try:
        metrics = await tester.test_sustained_load(20, 30, test_queries)
        summary = metrics.get_summary()
        
        if "error" not in summary:
            print(f"✓ Total requests: {summary['total_requests']}")
            print(f"✓ Success rate: {100 - summary['error_rate']:.1f}%")
            print(f"✓ Mean first token latency: {summary['first_token_latency']['mean']:.2f}ms")
            print(f"✓ P95 first token latency: {summary['first_token_latency']['p95']:.2f}ms")
        else:
            print(f"❌ Test failed: {summary['error']}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
    
    # Test 4: Backpressure handling
    print("\n[4] Backpressure Handling Test")
    print("-" * 40)
    print("Testing with slow client (100ms delay per token)...")
    
    try:
        results = await tester.test_backpressure_handling(100)
        
        if not results["connection_dropped"]:
            print(f"✓ Connection maintained with slow client")
            print(f"✓ Tokens received: {results['tokens_received']}")
            print(f"✓ Total time: {results['total_time_ms']:.2f}ms")
            print("✅ PASSED: System handles backpressure correctly")
        else:
            print(f"❌ Connection dropped: {results['errors']}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
    
    print("\n" + "="*60)
    print("Performance test suite completed!")
    print("="*60)


if __name__ == "__main__":
    # Run the async test suite
    asyncio.run(run_performance_tests())