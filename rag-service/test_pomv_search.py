#!/usr/bin/env python3
"""Test script to search for POMV content in the vector store."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline
from app.core.logging import get_logger

logger = get_logger(__name__)


async def test_pomv_search():
    """Test POMV search with various queries."""
    
    # Initialize components
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    # Create retrieval pipeline
    pipeline = ImprovedRetrievalPipeline(
        vector_store_manager=vector_store_manager,
        use_multi_query=True,
        use_compression=False,
        use_smart_chunking=True
    )
    
    # Test queries
    test_queries = [
        "can i drive pomv",
        "can i drive pmv", 
        "privately owned motor vehicle",
        "private motor vehicle authorization",
        "pmv travel policy",
        "use my own car for duty travel",
        "personal vehicle kilometric rate",
        "am i allowed to use my personal car"
    ]
    
    print("\n" + "="*80)
    print("TESTING POMV/PMV SEARCH")
    print("="*80 + "\n")
    
    for query in test_queries:
        print(f"\nQuery: '{query}'")
        print("-" * 60)
        
        try:
            # Get results
            results = await pipeline.retrieve(query=query, k=5)
            
            print(f"Found {len(results)} results")
            
            # Check results
            found_pmv = False
            for i, (doc, score) in enumerate(results):
                content = doc.page_content.lower()
                if any(term in content for term in ["pmv", "pomv", "private motor vehicle", "privately owned"]):
                    found_pmv = True
                    print(f"\n✓ Result {i+1} contains PMV/POMV content (score: {score:.3f})")
                    print(f"  Source: {doc.metadata.get('source', 'Unknown')}")
                    print(f"  Section: {doc.metadata.get('section', 'Unknown')}")
                    print(f"  Preview: {doc.page_content[:200]}...")
                else:
                    print(f"\n✗ Result {i+1} (score: {score:.3f}) - no PMV content found")
            
            if not found_pmv:
                print("\n❌ No PMV/POMV content found in any results!")
                
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_pomv_search())