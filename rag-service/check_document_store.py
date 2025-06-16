#!/usr/bin/env python3

"""Check what's in the document store for hardship allowance content."""

import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from app.core.config import settings
from app.pipelines.query import create_query_pipeline

def check_document_store():
    """Check what's in the current document store."""
    
    print("Checking document store configuration...")
    print(f"Vector store type: {settings.VECTOR_STORE_TYPE}")
    print(f"Database URL configured: {'Yes' if settings.DATABASE_URL else 'No'}")
    
    # Initialize document store the same way the manager does
    try:
        if settings.VECTOR_STORE_TYPE == "memory":
            document_store = InMemoryDocumentStore(embedding_similarity_function="cosine")
            print("Using InMemoryDocumentStore")
        elif settings.VECTOR_STORE_TYPE == "pgvector":
            if not settings.DATABASE_URL:
                print("Error: DATABASE_URL required for pgvector but not configured")
                return
            
            print("Initializing PgvectorDocumentStore...")
            document_store = PgvectorDocumentStore(
                connection_string=Secret.from_token(settings.DATABASE_URL),
                table_name="documents",
                embedding_dimension=3072,
                vector_function="cosine_similarity",
                recreate_table=False,
                search_strategy="exact_search"
            )
            print("PgvectorDocumentStore initialized")
        else:
            print(f"Error: Unknown vector store type: {settings.VECTOR_STORE_TYPE}")
            return
            
        # Get all documents
        print("\nQuerying document store...")
        all_docs = document_store.filter_documents()
        print(f"Total documents found: {len(all_docs)}")
        
        if len(all_docs) == 0:
            print("No documents found in the store. The store appears to be empty.")
            return
        
        # Analyze document sources and content
        print("\nAnalyzing documents...")
        sources = set()
        hardship_docs = []
        table_docs = []
        
        for i, doc in enumerate(all_docs):
            # Collect source information
            source = doc.meta.get('source', 'unknown')
            sources.add(source)
            
            # Check for hardship allowance content
            content_lower = doc.content.lower()
            if 'hardship' in content_lower and 'allowance' in content_lower:
                hardship_docs.append(doc)
            
            # Check for table content
            if '|' in doc.content or 'table' in content_lower:
                table_docs.append(doc)
            
            # Show first few documents
            if i < 5:
                print(f"\nDoc {i+1}:")
                print(f"  ID: {doc.id[:8]}...")
                print(f"  Source: {source}")
                print(f"  Content preview: {doc.content[:150].replace('\n', ' ')}...")
                print(f"  Meta keys: {list(doc.meta.keys())}")
        
        print(f"\nSources found: {sources}")
        print(f"Hardship allowance documents: {len(hardship_docs)}")
        print(f"Table-formatted documents: {len(table_docs)}")
        
        # Show hardship allowance documents if found
        if hardship_docs:
            print(f"\n{'='*60}")
            print("HARDSHIP ALLOWANCE DOCUMENTS FOUND:")
            print('='*60)
            
            for i, doc in enumerate(hardship_docs[:3]):  # Show first 3
                print(f"\nHardship Doc {i+1}:")
                print(f"  Source: {doc.meta.get('source', 'unknown')}")
                print(f"  Content length: {len(doc.content)} chars")
                print(f"  Content preview:")
                print("  " + "-" * 50)
                
                # Show relevant lines
                lines = doc.content.split('\n')
                for line_num, line in enumerate(lines[:20]):  # First 20 lines
                    if any(term in line.lower() for term in ['hardship', 'allowance', 'level', '$']):
                        print(f"  {line_num+1:2d}: {line}")
                
                if len(lines) > 20:
                    print(f"  ... and {len(lines) - 20} more lines")
                print("  " + "-" * 50)
        
        # Show table documents if found
        if table_docs:
            print(f"\n{'='*60}")
            print("TABLE-FORMATTED DOCUMENTS FOUND:")
            print('='*60)
            
            for i, doc in enumerate(table_docs[:2]):  # Show first 2
                print(f"\nTable Doc {i+1}:")
                print(f"  Source: {doc.meta.get('source', 'unknown')}")
                
                # Show table lines
                lines = doc.content.split('\n')
                table_lines = [line for line in lines if '|' in line]
                
                if table_lines:
                    print(f"  Table lines found: {len(table_lines)}")
                    print("  Sample table content:")
                    for line in table_lines[:10]:  # Show first 10 table lines
                        print(f"    {line}")
                    if len(table_lines) > 10:
                        print(f"    ... and {len(table_lines) - 10} more table lines")
        
        # Test queries
        print(f"\n{'='*60}")
        print("TESTING QUERIES:")
        print('='*60)
        
        query_pipeline = create_query_pipeline(document_store)
        
        test_queries = [
            "hardship allowance",
            "hardship allowance table",
            "hardship allowance rates",
            "HA level",
            "monthly hardship allowance",
            "austere hardship allowance"
        ]
        
        for query in test_queries:
            print(f"\nQuery: '{query}'")
            try:
                result = query_pipeline.run({
                    "text_embedder": {"text": query},
                    "prompt_builder": {"query": query}
                })
                
                retriever_result = result.get("retriever", {})
                documents = retriever_result.get("documents", [])
                
                print(f"  Retrieved {len(documents)} documents")
                
                if documents:
                    for j, doc in enumerate(documents[:2]):  # Show top 2
                        score = getattr(doc, 'score', 'N/A')
                        preview = doc.content[:100].replace('\n', ' ')
                        print(f"    Doc {j+1} (score: {score}): {preview}...")
                        
                        # Check if this looks like hardship allowance content
                        content_check = doc.content.lower()
                        indicators = []
                        if 'hardship' in content_check:
                            indicators.append('hardship')
                        if 'allowance' in content_check:
                            indicators.append('allowance')
                        if any(f'level {i}' in content_check for i in range(7)):
                            indicators.append('levels')
                        if '$' in doc.content:
                            indicators.append('amounts')
                        if '|' in doc.content:
                            indicators.append('table')
                        
                        if indicators:
                            print(f"      ✅ Contains: {', '.join(indicators)}")
                        else:
                            print(f"      ❌ No hardship allowance indicators")
                else:
                    print("    ❌ No documents retrieved")
                    
            except Exception as e:
                print(f"    Error: {e}")
                
    except Exception as e:
        print(f"Error accessing document store: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_document_store()