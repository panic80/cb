"""
Test the chat API directly to see what response we get for Ontario kilometric rate.
"""

import requests
import json

def test_chat_api():
    """Test the chat API endpoint."""
    
    url = "http://localhost:8000/api/v1/chat"
    
    payload = {
        "message": "what is the ontario kilometric rate",
        "conversation_id": "test-ontario-rate",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "sources_enabled": True,
        "chat_history": []
    }
    
    print("Sending request to:", url)
    print("Payload:", json.dumps(payload, indent=2))
    
    try:
        response = requests.post(url, json=payload)
        
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            print("\n=== RESPONSE ===")
            print(f"Response: {data.get('response', 'No response')}")
            
            print("\n=== SOURCES ===")
            sources = data.get('sources', [])
            for i, source in enumerate(sources):
                print(f"\nSource {i+1}:")
                print(f"  Title: {source.get('title', 'N/A')}")
                print(f"  URL: {source.get('url', 'N/A')}")
                print(f"  Score: {source.get('score', 'N/A')}")
                print(f"  Text preview: {source.get('text', '')[:200]}...")
                
                # Check if this source contains Ontario rate
                text = source.get('text', '').lower()
                if 'ontario' in text and ('62.5' in text or '0.625' in text):
                    print("  *** CONTAINS ONTARIO RATE! ***")
                    
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")


if __name__ == "__main__":
    test_chat_api()