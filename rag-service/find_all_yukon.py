#!/usr/bin/env python3

"""Find all documents mentioning Yukon and check for lunch rates."""

import os
import logging
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from app.core.config import settings

# Set minimal logging
logging.basicConfig(level=logging.WARNING)

def find_yukon_docs():
    print("Searching for all Yukon documents...\n")
    
    # Create document store
    ds = PgvectorDocumentStore(
        connection_string=Secret.from_token(settings.DATABASE_URL),
        table_name="documents",
        embedding_dimension=3072,
        recreate_table=False
    )
    
    # Get all documents
    all_docs = ds.filter_documents()
    
    # Find all Yukon documents
    yukon_docs = []
    lunch_docs = []
    
    for doc in all_docs:
        content_lower = doc.content.lower()
        
        # Check for Yukon
        if "yukon" in content_lower:
            yukon_docs.append(doc)
            
            # Check if it also has lunch info
            if "lunch" in content_lower or "$37" in doc.content or "$27.75" in doc.content or "$18.50" in doc.content:
                lunch_docs.append(doc)
        
        # Also check for lunch rates without Yukon to see if they're in separate docs
        elif "lunch" in content_lower and ("$37" in doc.content or "$27.75" in doc.content or "$18.50" in doc.content):
            lunch_docs.append(doc)
    
    print(f"Found {len(yukon_docs)} documents mentioning Yukon")
    print(f"Found {len(lunch_docs)} documents with lunch rate information\n")
    
    # Print all Yukon documents
    print("=== ALL YUKON DOCUMENTS ===")
    for i, doc in enumerate(yukon_docs):
        print(f"\nDocument {i+1}:")
        print(f"Source: {doc.meta.get('source', 'Unknown')}")
        print(f"Has embedding: {hasattr(doc, 'embedding') and doc.embedding is not None}")
        print(f"Content length: {len(doc.content)} chars")
        
        # Check for lunch/meal content
        if "lunch" in doc.content.lower() or "meal" in doc.content.lower():
            print("✓ Contains lunch/meal information")
        
        # Show content preview
        print(f"Content preview:\n{doc.content[:500]}...")
        print("-" * 80)
    
    # Check if lunch rates are in separate documents
    if lunch_docs:
        print("\n\n=== DOCUMENTS WITH LUNCH RATES ===")
        for i, doc in enumerate(lunch_docs[:5]):  # Show first 5
            print(f"\nDocument {i+1}:")
            print(f"Source: {doc.meta.get('source', 'Unknown')}")
            print(f"Has embedding: {hasattr(doc, 'embedding') and doc.embedding is not None}")
            
            # Search for Yukon lunch rates specifically
            content = doc.content
            
            # Find Yukon section
            yukon_start = content.lower().find("yukon")
            if yukon_start >= 0:
                # Get context around Yukon mention
                context_start = max(0, yukon_start - 500)
                context_end = min(len(content), yukon_start + 1000)
                yukon_context = content[context_start:context_end]
                
                print("Yukon context:")
                print(yukon_context)
            else:
                # Just show lunch rate lines
                lines = doc.content.split('\n')
                relevant_lines = []
                for j, line in enumerate(lines):
                    if "$37" in line or "$27.75" in line or "$18.50" in line or "lunch" in line.lower():
                        # Get surrounding context
                        start = max(0, j-2)
                        end = min(len(lines), j+3)
                        relevant_lines.extend(lines[start:end])
                
                if relevant_lines:
                    print("Lunch rate content:")
                    for line in relevant_lines[:20]:  # Show more lines
                        print(line)
            print("-" * 80)

if __name__ == "__main__":
    find_yukon_docs()