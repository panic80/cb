#!/usr/bin/env python3
"""Test parallel ingestion performance."""

import asyncio
import time
from datetime import datetime

from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.pipelines.ingestion import IngestionPipeline
from app.models.documents import DocumentIngestionRequest


async def test_ingestion_performance():
    """Test ingestion with parallel processing."""
    print("Testing parallel ingestion performance...")
    print(f"Configuration:")
    print(f"  - Parallel chunk workers: {settings.parallel_chunk_workers}")
    print(f"  - Parallel embedding workers: {settings.parallel_embedding_workers}")
    print(f"  - Embedding batch size: {settings.embedding_batch_size}")
    print(f"  - Max concurrent embeddings: {settings.max_concurrent_embeddings}")
    print(f"  - Vector store batch size: {settings.vector_store_batch_size}")
    print()
    
    # Initialize components
    vector_store = VectorStoreManager()
    await vector_store.initialize()
    
    pipeline = IngestionPipeline(
        vector_store_manager=vector_store,
        use_smart_chunking=True,
        use_hierarchical_chunking=False
    )
    
    # Test URL
    test_url = "https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html"
    
    # Create request
    request = DocumentIngestionRequest(
        url=test_url,
        type="web",
        force_refresh=True,
        metadata={
            "test": "parallel_ingestion",
            "timestamp": datetime.utcnow().isoformat()
        }
    )
    
    # Run ingestion
    print(f"Starting ingestion of: {test_url}")
    start_time = time.time()
    
    response = await pipeline.ingest_document(request)
    
    end_time = time.time()
    total_time = end_time - start_time
    
    # Print results
    print("\nIngestion Results:")
    print(f"  - Status: {response.status}")
    print(f"  - Chunks created: {response.chunks_created}")
    print(f"  - Total time: {total_time:.2f} seconds")
    print(f"  - Processing time (reported): {response.processing_time:.2f} seconds")
    
    if response.status == "success":
        chunks_per_second = response.chunks_created / total_time
        print(f"  - Throughput: {chunks_per_second:.2f} chunks/second")
    
    if response.error_details:
        print(f"  - Error details: {response.error_details}")
    
    # Cleanup
    await pipeline.cleanup()
    await vector_store.close()
    
    print("\nTest completed!")


if __name__ == "__main__":
    asyncio.run(test_ingestion_performance())