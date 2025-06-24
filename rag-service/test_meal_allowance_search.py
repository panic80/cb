#!/usr/bin/env python3
"""Test script to search for meal allowance content."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline
from app.core.logging import get_logger

logger = get_logger(__name__)


async def test_meal_allowance_search():
    """Test meal allowance search with various queries."""
    
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
        "meal allowance table",
        "meal rates",
        "breakfast lunch dinner rates",
        "meal allowances Canada USA",
        "Appendix C meal",
        "daily meal rates",
        "$23.30 $23.25 $52.30"  # Specific Yukon/Alaska rates
    ]
    
    print("\n" + "="*80)
    print("TESTING MEAL ALLOWANCE SEARCH")
    print("="*80 + "\n")
    
    for query in test_queries:
        print(f"\nQuery: '{query}'")
        print("-" * 60)
        
        try:
            # Get results using the improved pipeline
            results = await pipeline.retrieve(query=query, k=5)
            
            print(f"Found {len(results)} results")
            
            # Check results for meal content
            found_meal_content = False
            found_table = False
            found_values = False
            
            for i, (doc, score) in enumerate(results):
                content = doc.page_content.lower()
                
                # Check for meal-related content
                if any(term in content for term in ["meal", "breakfast", "lunch", "dinner"]):
                    found_meal_content = True
                
                # Check for table content
                if "|" in doc.page_content or "table" in content:
                    found_table = True
                    
                # Check for dollar values
                if "$" in doc.page_content:
                    found_values = True
                
                print(f"\nResult {i+1} (score: {score:.3f})")
                print(f"  Source: {doc.metadata.get('source', 'Unknown')}")
                print(f"  Section: {doc.metadata.get('section', 'Unknown')}")
                print(f"  Content Type: {doc.metadata.get('content_type', 'Unknown')}")
                
                # Show more content for debugging
                preview = doc.page_content[:300]
                print(f"  Preview: {preview}...")
                
                # Look for specific indicators
                if found_meal_content and (found_table or found_values):
                    print(f"  ✓ Contains meal rates/table content")
                    
            print(f"\nSummary:")
            print(f"  Found meal content: {found_meal_content}")
            print(f"  Found table format: {found_table}")
            print(f"  Found dollar values: {found_values}")
                    
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
    
    # Also do a direct vector search to compare
    print("\n" + "="*80)
    print("DIRECT VECTOR SEARCH COMPARISON")
    print("="*80 + "\n")
    
    query = "meal allowance table rates Canada USA"
    print(f"Direct search for: '{query}'")
    
    direct_results = await vector_store_manager.search(query, k=10)
    print(f"Found {len(direct_results)} results")
    
    for i, (doc, score) in enumerate(direct_results[:5]):
        print(f"\nDirect Result {i+1} (score: {score:.3f})")
        print(f"  Source: {doc.metadata.get('source', 'Unknown')}")
        print(f"  Section: {doc.metadata.get('section', 'Unknown')}")
        print(f"  Preview: {doc.page_content[:200]}...")


if __name__ == "__main__":
    asyncio.run(test_meal_allowance_search())