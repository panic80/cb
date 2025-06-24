#!/usr/bin/env python3
"""Simple test to check incidental rate from RAG system."""

import requests
import json

# Configuration
RAG_SERVICE_URL = "http://localhost:8000"
CHAT_ENDPOINT = f"{RAG_SERVICE_URL}/api/v1/chat"
EXPECTED_INCIDENTAL_RATE = "$17.30"

def test_incidental_rate():
    print("Testing RAG system for incidental rate...")
    print(f"Expected value: {EXPECTED_INCIDENTAL_RATE}")
    print("-" * 60)
    
    query = "What is the incidental rate in Canada?"
    
    payload = {
        "message": query,
        "conversation_id": "test-incidental-123",
        "user_id": "test-user"
    }
    
    try:
        print(f"\nQuerying: {query}")
        response = requests.post(
            CHAT_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            # The API returns 'response' not 'answer'
            answer = data.get("response", "")
            sources = data.get("sources", [])
            
            print(f"\nRESPONSE:\n{answer}")
            
            # Check if answer contains expected rate
            contains_rate = EXPECTED_INCIDENTAL_RATE in answer
            print(f"\nContains {EXPECTED_INCIDENTAL_RATE}: {contains_rate}")
            
            # Show sources
            print(f"\nSOURCES ({len(sources)} found):")
            for i, source in enumerate(sources):
                print(f"\n{i+1}. {source.get('source', 'Unknown')}")
                print(f"   Score: {source.get('score', 'N/A')}")
                print(f"   Content preview: {source.get('content', '')[:100]}...")
            
            # Final verdict
            print("\n" + "=" * 60)
            if contains_rate:
                print(f"✅ SUCCESS: Found {EXPECTED_INCIDENTAL_RATE}")
            else:
                print(f"❌ FAILURE: Did not find {EXPECTED_INCIDENTAL_RATE}")
                
                # Look for any dollar amounts
                import re
                dollar_amounts = re.findall(r'\$[\d,]+\.?\d*', answer)
                if dollar_amounts:
                    print(f"   Found these amounts instead: {dollar_amounts}")
                
        else:
            print(f"ERROR: {response.text}")
            
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_incidental_rate()