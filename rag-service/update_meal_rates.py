#!/usr/bin/env python3
"""
Script to update meal rates from NJC (National Joint Council) website.
This ensures the chatbot has the latest meal rates including correct values like:
- Yukon lunch rate: $25.65
"""

import asyncio
import httpx
import json
from datetime import datetime


async def ingest_njc_rates():
    """Ingest meal rates from NJC website."""
    
    njc_url = "https://www.njc-cnm.gc.ca/directive/d10/v238/en"
    rag_service_url = "http://localhost:8000/api/v1/ingest"
    
    # Prepare ingestion request
    payload = {
        "url": njc_url,
        "type": "web",
        "metadata": {
            "source": "NJC",
            "category": "meal_rates",
            "document_type": "official_rates",
            "tags": ["meal_rates", "per_diem", "allowances", "njc", "travel"],
            "ingested_at": datetime.utcnow().isoformat()
        },
        "force_refresh": True
    }
    
    print(f"Ingesting NJC meal rates from: {njc_url}")
    print("This contains official meal rates including:")
    print("- Breakfast, lunch, and dinner rates for all provinces/territories")
    print("- Special rates for remote locations")
    print("- Yukon lunch rate: $25.65")
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
                print(f"\n✓ Success! Document ingested:")
                print(f"  - Document ID: {result.get('document_id')}")
                print(f"  - Chunks created: {result.get('chunks_created')}")
                print(f"  - Processing time: {result.get('processing_time', 0):.2f}s")
                print(f"\nIMPORTANT: Clear the cache to ensure the new rates are used:")
                print("  npm run force-cache-refresh")
            else:
                print(f"\n✗ Error: {response.status_code}")
                print(f"Response: {response.text}")
                
    except Exception as e:
        print(f"\n✗ Failed to ingest NJC rates: {e}")
        print("\nMake sure the RAG service is running:")
        print("  cd rag-service && uvicorn app.main:app --reload --port 8000")


async def clear_cache():
    """Clear the Redis cache to ensure new rates are used."""
    try:
        import redis
        r = redis.Redis.from_url("redis://localhost:6379")
        r.flushall()
        print("\n✓ Cache cleared successfully")
    except Exception as e:
        print(f"\n⚠ Could not clear cache: {e}")
        print("Run manually: npm run force-cache-refresh")


async def main():
    """Main function."""
    print("=" * 60)
    print("NJC Meal Rates Update Script")
    print("=" * 60)
    
    # Ingest NJC rates
    await ingest_njc_rates()
    
    # Offer to clear cache
    print("\nWould you like to clear the cache now? (y/n): ", end="")
    if input().lower() == 'y':
        await clear_cache()
    
    print("\nUpdate complete!")


if __name__ == "__main__":
    asyncio.run(main())