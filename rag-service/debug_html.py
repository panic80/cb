#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
from haystack.components.converters import HTMLToDocument

# Test what HTMLToDocument does to our tables
url = "https://www.njc-cnm.gc.ca/directive/d10/v238/en?print"

# Get raw HTML
print("Fetching raw HTML...")
response = requests.get(url)
print(f"Raw HTML size: {len(response.content)} bytes")

# Check if tables exist in raw HTML
soup = BeautifulSoup(response.content, 'html.parser')
tables = soup.find_all('table')
print(f"Tables found in raw HTML: {len(tables)}")

# Test HTMLToDocument converter
converter = HTMLToDocument()
try:
    documents = converter.run(sources=[response.content])["documents"]
except Exception as e:
    print(f"HTMLToDocument error: {e}")
    
    # Try with different input format
    try:
        documents = converter.run(sources=[url])["documents"]
        print("Success with URL as source")
    except Exception as e2:
        print(f"HTMLToDocument error with URL: {e2}")
        documents = []

print(f"Documents created by HTMLToDocument: {len(documents)}")

if documents:
    doc_content = documents[0].content
    print(f"Converted document size: {len(doc_content)} characters")
    
    # Check if tables still exist after conversion
    soup_converted = BeautifulSoup(doc_content, 'html.parser')
    tables_after = soup_converted.find_all('table')
    print(f"Tables found after HTMLToDocument: {len(tables_after)}")
    
    # Check if our specific rates exist
    if "25.65" in doc_content:
        print("✓ Found 25.65 in converted content")
    else:
        print("✗ 25.65 NOT found in converted content")
        
    if "37.00" in doc_content:
        print("✓ Found 37.00 in converted content")
    else:
        print("✗ 37.00 NOT found in converted content")