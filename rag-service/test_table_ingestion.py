#!/usr/bin/env python3
"""Test script to validate table-aware ingestion and retrieval."""

import asyncio
import httpx
import json
from datetime import datetime


async def test_njc_rates_ingestion():
    """Test ingesting NJC rates with all appendices."""
    
    # URLs for different appendices
    appendices = {
        "Appendix C - Allowances (includes incidental rates)": 
            "https://www.njc-cnm.gc.ca/directive/d10/v238/s659/sv18/en?print",
        "Appendix D - International Allowances": 
            "https://www.njc-cnm.gc.ca/directive/app_d.php?lang=en&print=1",
        "Main Travel Directive": 
            "https://www.njc-cnm.gc.ca/directive/d10/v238/en?print"
    }
    
    rag_service_url = "http://localhost:8000/api/v1/ingest"
    
    print("=" * 60)
    print("Testing Table-Aware Ingestion for NJC Rates")
    print("=" * 60)
    
    # Ingest each appendix
    for title, url in appendices.items():
        print(f"\nIngesting: {title}")
        print(f"URL: {url}")
        
        payload = {
            "url": url,
            "type": "web",
            "metadata": {
                "source": "NJC",
                "source_type": "official_government",
                "category": "travel_rates",
                "document_type": "official_rates",
                "tags": [
                    "meal_rates", 
                    "incidental_rates",
                    "per_diem", 
                    "allowances", 
                    "njc", 
                    "travel",
                    "government_rates"
                ],
                "ingested_at": datetime.utcnow().isoformat(),
                "description": f"Official NJC {title}"
            },
            "force_refresh": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    rag_service_url,
                    json=payload
                )
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"✓ Success!")
                    print(f"  - Document ID: {result.get('document_id')}")
                    print(f"  - Chunks created: {result.get('chunks_created')}")
                    print(f"  - Processing time: {result.get('processing_time', 0):.2f}s")
                else:
                    print(f"✗ Error: {response.status_code}")
                    print(f"Response: {response.text}")
                    
        except Exception as e:
            print(f"✗ Failed to ingest: {e}")


async def test_table_queries():
    """Test various table-related queries."""
    
    test_queries = [
        "What is the incidental rate per day?",
        "Show me the incidental allowance table",
        "How much is the incidental expense allowance?",
        "What is the daily incidental rate for travel?",
        "incidental rates",
        "What is the meal rate in Yukon?",
        "Show me the meal allowance table",
        "What is the lunch rate in Yukon?",
        "How much is breakfast in NWT?",
        "meal rates Canada provinces territories"
    ]
    
    chat_url = "http://localhost:8000/api/v1/chat"
    
    print("\n" + "=" * 60)
    print("Testing Table Queries")
    print("=" * 60)
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        
        payload = {
            "query": query,
            "model": "openai",
            "conversation_id": "test_" + str(int(datetime.utcnow().timestamp()))
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    chat_url,
                    json=payload
                )
                
                if response.status_code == 200:
                    # Process SSE response
                    answer_parts = []
                    sources = []
                    
                    for line in response.text.split('\n'):
                        if line.startswith('data: '):
                            try:
                                data = json.loads(line[6:])
                                if data['type'] == 'content':
                                    answer_parts.append(data['content'])
                                elif data['type'] == 'sources':
                                    sources = data.get('sources', [])
                            except:
                                pass
                    
                    answer = ''.join(answer_parts)
                    print(f"Answer: {answer[:200]}...")
                    
                    if sources:
                        print(f"Sources found: {len(sources)}")
                        for source in sources[:2]:
                            print(f"  - {source.get('title', 'Unknown')}")
                            if 'content_type' in source.get('metadata', {}):
                                print(f"    Type: {source['metadata']['content_type']}")
                else:
                    print(f"✗ Error: {response.status_code}")
                    
        except Exception as e:
            print(f"✗ Query failed: {e}")


async def test_other_sites():
    """Test table ingestion from other websites."""
    
    test_sites = [
        {
            "url": "https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)",
            "description": "Wikipedia table of countries by GDP"
        },
        {
            "url": "https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes/consumer_price_indexes",
            "description": "Statistics Canada price indexes"
        }
    ]
    
    print("\n" + "=" * 60)
    print("Testing Other Sites with Tables")
    print("=" * 60)
    
    rag_service_url = "http://localhost:8000/api/v1/ingest"
    
    for site in test_sites:
        print(f"\nTesting: {site['description']}")
        print(f"URL: {site['url']}")
        
        payload = {
            "url": site['url'],
            "type": "web",
            "metadata": {
                "source": "test",
                "category": "table_test",
                "description": site['description']
            },
            "force_refresh": True
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    rag_service_url,
                    json=payload
                )
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"✓ Success!")
                    print(f"  - Chunks created: {result.get('chunks_created')}")
                    
                    # Check if any table chunks were created
                    # This would require querying the vector store
                    # For now, we just note success
                else:
                    print(f"✗ Error: {response.status_code}")
                    
        except Exception as e:
            print(f"✗ Failed: {e}")


async def main():
    """Main test function."""
    print("Table-Aware Ingestion and Retrieval Test Suite")
    print("=" * 60)
    print("Make sure the RAG service is running on port 8000")
    print("=" * 60)
    
    # Test 1: Ingest NJC rates
    await test_njc_rates_ingestion()
    
    # Wait a bit for indexing
    print("\nWaiting 5 seconds for indexing...")
    await asyncio.sleep(5)
    
    # Test 2: Query for table data
    await test_table_queries()
    
    # Test 3: Test other sites (optional)
    # await test_other_sites()
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    print("If incidental rates are now being returned correctly,")
    print("the table-aware ingestion is working!")
    print("\nExpected results:")
    print("- Incidental rate: $17.30 per day (100%)")
    print("- Incidental rate after 30 days: $13.00 per day (75%)")
    print("- Meal rates should show full table with all provinces")


if __name__ == "__main__":
    asyncio.run(main())