"""Parallel retrieval pipeline for concurrent retriever execution."""

import asyncio
from typing import List, Dict, Any, Optional, Tuple, Set
from datetime import datetime
import time

from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from langchain_core.language_models import BaseLLM

from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)


class CircuitBreaker:
    """Circuit breaker for failing retrievers."""
    
    def __init__(self, failure_threshold: int = 3, timeout: float = 60.0):
        """Initialize circuit breaker."""
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failures: Dict[str, int] = {}
        self.last_failure_time: Dict[str, float] = {}
        
    def is_open(self, retriever_name: str) -> bool:
        """Check if circuit is open (retriever should be skipped)."""
        if retriever_name not in self.failures:
            return False
            
        if self.failures[retriever_name] >= self.failure_threshold:
            # Check if timeout has passed
            if time.time() - self.last_failure_time[retriever_name] > self.timeout:
                # Reset circuit
                self.failures[retriever_name] = 0
                return False
            return True
        return False
        
    def record_failure(self, retriever_name: str):
        """Record a failure for a retriever."""
        self.failures[retriever_name] = self.failures.get(retriever_name, 0) + 1
        self.last_failure_time[retriever_name] = time.time()
        
    def record_success(self, retriever_name: str):
        """Record a success for a retriever."""
        if retriever_name in self.failures:
            self.failures[retriever_name] = 0


class ParallelRetrievalPipeline:
    """Pipeline for executing multiple retrievers in parallel."""
    
    def __init__(
        self,
        retrievers: Dict[str, BaseRetriever],
        weights: Optional[Dict[str, float]] = None,
        concurrency_limit: int = 5,
        timeout_per_retriever: float = 10.0,
        circuit_breaker: Optional[CircuitBreaker] = None
    ):
        """
        Initialize parallel retrieval pipeline.
        
        Args:
            retrievers: Dictionary of retriever name to retriever instance
            weights: Optional weights for each retriever (for result merging)
            concurrency_limit: Maximum number of concurrent retriever calls
            timeout_per_retriever: Timeout for each retriever in seconds
            circuit_breaker: Optional circuit breaker for handling failures
        """
        self.retrievers = retrievers
        self.weights = weights or {name: 1.0 for name in retrievers}
        self.concurrency_limit = concurrency_limit
        self.timeout_per_retriever = timeout_per_retriever
        self.circuit_breaker = circuit_breaker or CircuitBreaker()
        
        # Normalize weights
        total_weight = sum(self.weights.values())
        self.weights = {k: v / total_weight for k, v in self.weights.items()}
        
    async def _retrieve_with_timeout(
        self,
        retriever_name: str,
        retriever: BaseRetriever,
        query: str,
        k: int
    ) -> Tuple[str, List[Document], float]:
        """Retrieve documents with timeout."""
        start_time = time.time()
        
        try:
            # Apply timeout
            docs = await asyncio.wait_for(
                retriever.aget_relevant_documents(query),
                timeout=self.timeout_per_retriever
            )
            
            elapsed = time.time() - start_time
            
            # Record success
            self.circuit_breaker.record_success(retriever_name)
            
            # Limit results to k
            return retriever_name, docs[:k], elapsed
            
        except asyncio.TimeoutError:
            logger.warning(f"Retriever {retriever_name} timed out after {self.timeout_per_retriever}s")
            self.circuit_breaker.record_failure(retriever_name)
            return retriever_name, [], self.timeout_per_retriever
            
        except Exception as e:
            logger.error(f"Retriever {retriever_name} failed: {e}")
            self.circuit_breaker.record_failure(retriever_name)
            elapsed = time.time() - start_time
            return retriever_name, [], elapsed
    
    async def retrieve(
        self,
        query: str,
        k: int = 5,
        merge_strategy: str = "weighted"
    ) -> List[Tuple[Document, float]]:
        """
        Retrieve documents from all retrievers in parallel.
        
        Args:
            query: Search query
            k: Number of documents to return
            merge_strategy: How to merge results ("weighted", "round_robin", "score_based")
            
        Returns:
            List of (document, score) tuples
        """
        # Filter out retrievers with open circuits
        active_retrievers = {
            name: retriever
            for name, retriever in self.retrievers.items()
            if not self.circuit_breaker.is_open(name)
        }
        
        if not active_retrievers:
            logger.warning("All retrievers have open circuits!")
            return []
        
        # Create retrieval tasks
        tasks = []
        for name, retriever in active_retrievers.items():
            task = self._retrieve_with_timeout(name, retriever, query, k * 2)  # Get more for merging
            tasks.append(task)
        
        # Execute with concurrency limit
        results_by_retriever = {}
        latencies = {}
        
        # Process in batches based on concurrency limit
        for i in range(0, len(tasks), self.concurrency_limit):
            batch = tasks[i:i + self.concurrency_limit]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)
            
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Retrieval task failed: {result}")
                else:
                    name, docs, latency = result
                    if docs:
                        results_by_retriever[name] = docs
                        latencies[name] = latency
        
        # Log retrieval metrics
        logger.info(f"Parallel retrieval completed - Active: {len(active_retrievers)}, "
                   f"Successful: {len(results_by_retriever)}, "
                   f"Latencies: {latencies}")
        
        # Merge results based on strategy
        merged_results = self._merge_results(results_by_retriever, k, merge_strategy)
        
        return merged_results
    
    def _merge_results(
        self,
        results_by_retriever: Dict[str, List[Document]],
        k: int,
        strategy: str
    ) -> List[Tuple[Document, float]]:
        """Merge results from multiple retrievers."""
        
        if strategy == "weighted":
            return self._weighted_merge(results_by_retriever, k)
        elif strategy == "round_robin":
            return self._round_robin_merge(results_by_retriever, k)
        elif strategy == "score_based":
            return self._score_based_merge(results_by_retriever, k)
        else:
            logger.warning(f"Unknown merge strategy: {strategy}, using weighted")
            return self._weighted_merge(results_by_retriever, k)
    
    def _weighted_merge(
        self,
        results_by_retriever: Dict[str, List[Document]],
        k: int
    ) -> List[Tuple[Document, float]]:
        """Merge results using weighted scores."""
        # Track unique documents by content hash
        seen_hashes: Set[int] = set()
        merged_results: List[Tuple[Document, float]] = []
        
        # Score each document based on retriever weight and position
        for retriever_name, docs in results_by_retriever.items():
            weight = self.weights.get(retriever_name, 1.0)
            
            for i, doc in enumerate(docs):
                # Create content hash for deduplication
                content_hash = hash(doc.page_content)
                
                if content_hash not in seen_hashes:
                    seen_hashes.add(content_hash)
                    
                    # Calculate score based on position and weight
                    position_score = 1.0 / (i + 1)  # Higher score for earlier positions
                    final_score = weight * position_score
                    
                    merged_results.append((doc, final_score))
        
        # Sort by score and return top k
        merged_results.sort(key=lambda x: x[1], reverse=True)
        return merged_results[:k]
    
    def _round_robin_merge(
        self,
        results_by_retriever: Dict[str, List[Document]],
        k: int
    ) -> List[Tuple[Document, float]]:
        """Merge results using round-robin selection."""
        seen_hashes: Set[str] = set()
        merged_results: List[Tuple[Document, float]] = []
        
        # Create iterators for each retriever's results
        iterators = {
            name: iter(docs)
            for name, docs in results_by_retriever.items()
        }
        
        # Round-robin through retrievers
        while len(merged_results) < k and iterators:
            empty_iterators = []
            
            for name, iterator in iterators.items():
                try:
                    doc = next(iterator)
                    content_hash = hash(doc.page_content)
                    
                    if content_hash not in seen_hashes:
                        seen_hashes.add(content_hash)
                        # Use retriever weight as score
                        score = self.weights.get(name, 1.0)
                        merged_results.append((doc, score))
                        
                        if len(merged_results) >= k:
                            break
                            
                except StopIteration:
                    empty_iterators.append(name)
            
            # Remove exhausted iterators
            for name in empty_iterators:
                del iterators[name]
        
        return merged_results[:k]
    
    def _score_based_merge(
        self,
        results_by_retriever: Dict[str, List[Document]],
        k: int
    ) -> List[Tuple[Document, float]]:
        """Merge results based on metadata scores if available."""
        seen_hashes: Set[str] = set()
        all_results: List[Tuple[Document, float]] = []
        
        for retriever_name, docs in results_by_retriever.items():
            weight = self.weights.get(retriever_name, 1.0)
            
            for doc in docs:
                content_hash = hash(doc.page_content)
                
                if content_hash not in seen_hashes:
                    seen_hashes.add(content_hash)
                    
                    # Try to get score from metadata
                    metadata_score = doc.metadata.get("score", 0.5)
                    final_score = weight * metadata_score
                    
                    all_results.append((doc, final_score))
        
        # Sort by score and return top k
        all_results.sort(key=lambda x: x[1], reverse=True)
        return all_results[:k]
    
    def get_retriever_stats(self) -> Dict[str, Any]:
        """Get statistics about retriever performance."""
        stats = {
            "retrievers": list(self.retrievers.keys()),
            "weights": self.weights,
            "circuit_breaker": {
                name: {
                    "failures": self.circuit_breaker.failures.get(name, 0),
                    "is_open": self.circuit_breaker.is_open(name)
                }
                for name in self.retrievers
            }
        }
        return stats


def create_parallel_pipeline(
    vector_store_manager,
    llm: Optional[BaseLLM] = None,
    retriever_configs: Optional[Dict[str, Dict[str, Any]]] = None
) -> ParallelRetrievalPipeline:
    """Create a parallel retrieval pipeline with default retrievers."""
    from app.pipelines.retriever_factory import HybridRetrieverFactory
    
    # Default retriever configurations
    if retriever_configs is None:
        retriever_configs = {
            "vector_similarity": {
                "type": "vector",
                "search_type": "similarity",
                "k": 10
            },
            "vector_mmr": {
                "type": "vector", 
                "search_type": "mmr",
                "k": 10,
                "lambda_mult": 0.5
            },
            "bm25": {
                "type": "bm25",
                "k": 10
            }
        }
        
        # Add multi-query if LLM is available
        if llm:
            retriever_configs["multi_query"] = {
                "type": "multi_query",
                "base_retriever": "vector_similarity",
                "llm": llm
            }
    
    # Create retrievers
    factory = HybridRetrieverFactory(
        vectorstore=vector_store_manager.vector_store,
        llm=llm,
        embeddings=vector_store_manager.embeddings
    )
    retrievers = {}
    
    for name, config in retriever_configs.items():
        try:
            retriever = factory.create_retriever(config)
            if retriever:
                retrievers[name] = retriever
        except Exception as e:
            logger.error(f"Failed to create retriever {name}: {e}")
    
    # Define weights based on retriever importance
    weights = {
        "vector_similarity": 0.4,
        "vector_mmr": 0.2,
        "bm25": 0.3,
        "multi_query": 0.1
    }
    
    return ParallelRetrievalPipeline(
        retrievers=retrievers,
        weights=weights,
        concurrency_limit=settings.parallel_retrieval_limit,
        timeout_per_retriever=settings.retriever_timeout
    )