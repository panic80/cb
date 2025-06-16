#!/usr/bin/env python3

"""Debug script to test WebCrawler functionality."""

import logging
from app.components.web_crawler import WebCrawler

logging.basicConfig(level=logging.INFO)

def test_webcrawler():
    """Test WebCrawler basic functionality."""
    
    print("Testing WebCrawler creation...")
    
    crawler = WebCrawler(
        max_depth=1,
        max_pages=2,
        delay=0.5,
        respect_robots_txt=True,
        follow_external_links=False,
        timeout=10
    )
    
    print(f"WebCrawler created: {type(crawler).__name__}")
    
    # Test with a simple URL
    test_url = "https://httpbin.org/html"
    print(f"Testing with URL: {test_url}")
    
    try:
        result = crawler.run(urls=[test_url])
        print(f"Crawler result: {len(result['streams'])} streams fetched")
        
        if result['streams']:
            stream = result['streams'][0]
            print(f"First stream meta: {stream.meta}")
            content = stream.data.decode('utf-8', errors='ignore')[:200]
            print(f"Content preview: {content}...")
        else:
            print("No streams fetched!")
            
    except Exception as e:
        print(f"Error running crawler: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_webcrawler()