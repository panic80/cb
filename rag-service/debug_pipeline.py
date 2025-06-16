#!/usr/bin/env python3

"""Debug script to test pipeline creation with WebCrawler."""

import logging
from haystack.document_stores.in_memory import InMemoryDocumentStore
from app.pipelines.indexing import create_url_indexing_pipeline

logging.basicConfig(level=logging.INFO)

def test_pipeline_creation():
    """Test pipeline creation with WebCrawler."""
    
    print("Testing pipeline creation...")
    
    # Create document store
    document_store = InMemoryDocumentStore()
    
    # Test crawling pipeline creation
    print("Creating crawling pipeline...")
    crawling_pipeline = create_url_indexing_pipeline(
        document_store=document_store,
        enable_crawling=True,
        max_depth=1,
        max_pages=5,
        follow_external_links=False
    )
    
    # Check fetcher component type
    fetcher = crawling_pipeline.get_component("fetcher")
    print(f"Crawling pipeline fetcher type: {type(fetcher).__name__}")
    
    # Test non-crawling pipeline creation
    print("Creating non-crawling pipeline...")
    single_pipeline = create_url_indexing_pipeline(
        document_store=document_store,
        enable_crawling=False
    )
    
    # Check fetcher component type
    fetcher2 = single_pipeline.get_component("fetcher")
    print(f"Single-page pipeline fetcher type: {type(fetcher2).__name__}")
    
    # Test running the crawling pipeline
    print("Testing crawling pipeline run...")
    try:
        result = crawling_pipeline.run({
            "fetcher": {
                "urls": ["https://httpbin.org/html"]
            }
        })
        print(f"Pipeline run successful! Result keys: {list(result.keys())}")
        
        writer_result = result.get("writer", {})
        doc_count = writer_result.get("documents_written", 0)
        print(f"Documents written: {doc_count}")
        
    except Exception as e:
        print(f"Error running pipeline: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_pipeline_creation()