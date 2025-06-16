#!/usr/bin/env python3

"""Search for meal allowance tables in the document."""

import os
import logging
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from app.core.config import settings

# Set minimal logging
logging.basicConfig(level=logging.WARNING)

def search_meal_rates():
    print("Searching for meal allowance tables...\n")
    
    # Create document store
    ds = PgvectorDocumentStore(
        connection_string=Secret.from_token(settings.DATABASE_URL),
        table_name="documents",
        embedding_dimension=3072,
        recreate_table=False
    )
    
    # Get the document from NJC
    all_docs = ds.filter_documents()
    
    njc_doc = None
    for doc in all_docs:
        if "njc-cnm.gc.ca" in doc.meta.get('source', ''):
            njc_doc = doc
            break
    
    if njc_doc:
        print(f"Found NJC document with {len(njc_doc.content)} characters")
        
        # Search for meal allowances section
        content = njc_doc.content
        
        # Look for different meal-related patterns
        search_terms = [
            "meal allowances",
            "meal and incidental",
            "breakfast",
            "lunch", 
            "dinner",
            "supper",
            "$37",
            "$27.75",
            "$18.50",
            "Yukon & Alaska",
            "N.W.T.",
            "Nunavut"
        ]
        
        # Find all occurrences
        for term in search_terms:
            indices = []
            start = 0
            while True:
                index = content.lower().find(term.lower(), start)
                if index == -1:
                    break
                indices.append(index)
                start = index + 1
            
            if indices:
                print(f"\nFound '{term}' at {len(indices)} locations")
                
                # Show context for first few occurrences
                for i, idx in enumerate(indices[:3]):
                    print(f"\nOccurrence {i+1} at position {idx}:")
                    # Get surrounding context
                    context_start = max(0, idx - 200)
                    context_end = min(len(content), idx + 300)
                    context = content[context_start:context_end]
                    
                    # Highlight the term
                    highlighted = context.replace(term, f"***{term}***")
                    print(highlighted)
                    print("-" * 50)
        
        # Try to find table structure
        print("\n\nSearching for table structures with dollar amounts...")
        lines = content.split('\n')
        
        for i, line in enumerate(lines):
            # Look for lines with dollar amounts
            if '$' in line and any(x in line for x in ['37', '27', '18', '50']):
                print(f"\nLine {i}: {line}")
                
                # Show surrounding lines for context
                start = max(0, i-3)
                end = min(len(lines), i+4)
                print("Context:")
                for j in range(start, end):
                    prefix = ">>> " if j == i else "    "
                    print(f"{prefix}{lines[j]}")
                print("-" * 80)

if __name__ == "__main__":
    search_meal_rates()