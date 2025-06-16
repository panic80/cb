#!/usr/bin/env python3

"""Search for existing hardship allowance content in the document store."""

import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from app.pipelines.query import create_query_pipeline
from app.services.document_store import get_document_store

def search_hardship_content():
    """Search for hardship allowance content in the existing document store."""
    
    print("Searching for hardship allowance content in existing document store...")
    
    try:
        # Try to connect to the existing document store
        document_store = get_document_store()
        
        print(f"Connected to document store: {type(document_store).__name__}")
        
        # Get document count
        try:
            filter_all = {}
            all_docs = document_store.filter_documents(filters=filter_all)
            print(f"Total documents in store: {len(all_docs)}")
            
            if len(all_docs) > 0:
                print(f"Sample document IDs: {[doc.id[:8] + '...' for doc in all_docs[:5]]}")
        except Exception as e:
            print(f"Could not count documents: {e}")
        
        # Create query pipeline
        query_pipeline = create_query_pipeline(document_store)
        
        # Search for hardship allowance related content
        search_queries = [
            "hardship allowance",
            "hardship allowance table",
            "hardship allowance rates",
            "HA level",
            "austere hardship",
            "CFB standard hardship",
            "monthly hardship rate",
            "hardship allowance amount"
        ]
        
        print("\n" + "="*60)
        print("SEARCHING FOR HARDSHIP ALLOWANCE CONTENT")
        print("="*60)
        
        for query in search_queries:
            print(f"\nQuery: '{query}'")
            try:
                result = query_pipeline.run({
                    "text_embedder": {"text": query},
                    "prompt_builder": {"query": query}
                })
                
                # Check retriever results
                retriever_result = result.get("retriever", {})
                documents = retriever_result.get("documents", [])
                
                print(f"  Retrieved {len(documents)} documents")
                
                if documents:
                    for i, doc in enumerate(documents[:3]):  # Show top 3
                        score = getattr(doc, 'score', 'N/A')
                        preview = doc.content[:200].replace('\n', ' ')
                        print(f"  Doc {i+1} (score: {score}): {preview}...")
                        
                        # Check for key hardship allowance terms
                        content_lower = doc.content.lower()
                        ha_indicators = []
                        
                        if 'hardship' in content_lower:
                            ha_indicators.append('hardship')
                        if 'allowance' in content_lower:
                            ha_indicators.append('allowance')
                        if any(level in content_lower for level in ['level 0', 'level 1', 'level 2', 'level 3', 'level 4', 'level 5', 'level 6']):
                            ha_indicators.append('levels')
                        if '$' in doc.content:
                            ha_indicators.append('amounts')
                        if any(term in content_lower for term in ['cfb', 'austere', 'monthly']):
                            ha_indicators.append('descriptors')
                        if '|' in doc.content or 'table' in content_lower:
                            ha_indicators.append('table_format')
                        
                        if ha_indicators:
                            print(f"    ✅ Contains: {', '.join(ha_indicators)}")
                        else:
                            print(f"    ❌ No hardship allowance indicators found")
                else:
                    print("  ❌ No documents found")
                    
            except Exception as e:
                print(f"  Error: {e}")
        
        # Try to find any documents with table content
        print(f"\n" + "="*60)
        print("SEARCHING FOR TABLE CONTENT")
        print("="*60)
        
        table_queries = [
            "table",
            "|",  # Markdown table indicator
            "level",
            "monthly rate",
            "amount"
        ]
        
        for query in table_queries:
            print(f"\nQuery: '{query}'")
            try:
                result = query_pipeline.run({
                    "text_embedder": {"text": query},
                    "prompt_builder": {"query": query}
                })
                
                retriever_result = result.get("retriever", {})
                documents = retriever_result.get("documents", [])
                
                print(f"  Retrieved {len(documents)} documents")
                
                if documents and query == "|":  # Focus on markdown tables
                    for i, doc in enumerate(documents[:2]):
                        if "|" in doc.content:
                            print(f"  Doc {i+1} contains table formatting:")
                            # Show lines with table formatting
                            lines = doc.content.split('\n')
                            table_lines = [line for line in lines if '|' in line]
                            for line in table_lines[:5]:  # Show first 5 table lines
                                print(f"    {line.strip()}")
                            if len(table_lines) > 5:
                                print(f"    ... and {len(table_lines) - 5} more table lines")
                            
            except Exception as e:
                print(f"  Error: {e}")
                
    except Exception as e:
        print(f"Error connecting to document store: {e}")
        print("Using in-memory document store for testing...")
        
        # Fallback to in-memory store
        document_store = InMemoryDocumentStore()
        print("Created in-memory document store - no existing content to search")

if __name__ == "__main__":
    search_hardship_content()