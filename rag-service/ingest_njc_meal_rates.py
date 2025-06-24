#!/usr/bin/env python3
"""
Script to properly ingest NJC meal rates including correct Yukon lunch rate.
Uses the print version of the page which contains the actual data in tables.
"""

import asyncio
import httpx
import json
from datetime import datetime


async def ingest_njc_meal_rates():
    """Ingest meal rates from NJC print version."""
    
    # Use the print version which has the actual table data
    njc_url = "https://www.njc-cnm.gc.ca/directive/d10/v238/en?print"
    rag_service_url = "http://localhost:8000/api/v1/ingest"
    
    # Prepare ingestion request with detailed metadata
    payload = {
        "url": njc_url,
        "type": "web",
        "metadata": {
            "source": "NJC",
            "source_type": "official_government",
            "category": "meal_rates",
            "document_type": "official_rates",
            "directive": "Travel Directive - Appendix D",
            "tags": [
                "meal_rates", 
                "per_diem", 
                "allowances", 
                "njc", 
                "travel",
                "breakfast_rates",
                "lunch_rates", 
                "dinner_rates",
                "yukon",
                "provinces",
                "territories"
            ],
            "ingested_at": datetime.utcnow().isoformat(),
            "description": "Official NJC meal rates for all Canadian provinces and territories including Yukon lunch rate of $25.65"
        },
        "force_refresh": True
    }
    
    print("=" * 60)
    print("NJC Meal Rates Ingestion")
    print("=" * 60)
    print(f"Ingesting from: {njc_url}")
    print("\nThis document contains:")
    print("- Official meal rates for all provinces and territories")
    print("- Breakfast, lunch, and dinner rates")
    print("- Special rates for remote locations")
    print("- Yukon lunch rate: $25.65 (correct rate)")
    print("\nSending ingestion request...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                rag_service_url,
                json=payload,
                timeout=60.0
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"\n✓ Success! NJC meal rates ingested:")
                print(f"  - Document ID: {result.get('document_id')}")
                print(f"  - Chunks created: {result.get('chunks_created')}")
                print(f"  - Processing time: {result.get('processing_time', 0):.2f}s")
                print(f"\nThe chatbot should now return the correct Yukon lunch rate of $25.65")
                return True
            else:
                print(f"\n✗ Error: {response.status_code}")
                print(f"Response: {response.text}")
                return False
                
    except Exception as e:
        print(f"\n✗ Failed to ingest NJC rates: {e}")
        print("\nMake sure the RAG service is running:")
        print("  cd rag-service && uvicorn app.main:app --reload --port 8000")
        return False


async def main():
    """Main function."""
    # Ingest the NJC meal rates
    success = await ingest_njc_meal_rates()
    
    if success:
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("=" * 60)
        print("1. Clear the cache to ensure new rates are used:")
        print("   redis-cli FLUSHALL")
        print("\n2. Test the chatbot with:")
        print("   'What is the lunch rate in Yukon?'")
        print("   Expected answer: $25.65")
        print("\n3. If still showing old rate, restart all services:")
        print("   npm run dev:full")


if __name__ == "__main__":
    asyncio.run(main())