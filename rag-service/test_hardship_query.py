#!/usr/bin/env python3

"""Test hardship allowance queries after table fix."""

import sys
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from haystack.components.retrievers import InMemoryEmbeddingRetriever
from haystack.components.embedders import OpenAITextEmbedder
from app.core.config import settings

def test_hardship_allowance_queries():
    """Test queries for hardship allowance after table extraction fix."""
    
    print("Testing hardship allowance queries...")
    
    # Initialize document store
    if settings.VECTOR_STORE_TYPE == "pgvector":
        document_store = PgvectorDocumentStore(
            connection_string=Secret.from_token(settings.DATABASE_URL),
            table_name="documents",
            embedding_dimension=3072,
            vector_function="cosine_similarity",
            recreate_table=False,
            search_strategy="exact_search"
        )
    else:
        document_store = InMemoryDocumentStore(embedding_similarity_function="cosine")
    
    print(f"Document store type: {type(document_store).__name__}")
    
    # Create simple retrieval pipeline
    embedder = OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    )
    
    if isinstance(document_store, InMemoryDocumentStore):
        retriever = InMemoryEmbeddingRetriever(document_store=document_store)
    else:
        from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever
        retriever = PgvectorEmbeddingRetriever(document_store=document_store)
    
    # Test queries
    test_queries = [
        "hardship allowance table",
        "hardship allowance rates", 
        "hardship allowance level 4",
        "hardship allowance monthly amount",
        "level IV hardship allowance",
        "austere hardship allowance",
        "CFB standard hardship",
        "show me the hardship allowance table"
    ]
    
    print(f"\nTesting {len(test_queries)} queries...")
    print("="*60)
    
    for i, query in enumerate(test_queries):
        print(f"\n{i+1}. Query: '{query}'")
        
        try:
            # Get query embedding
            embedding_result = embedder.run(text=query)
            query_embedding = embedding_result["embedding"]
            
            # Retrieve documents
            retrieval_result = retriever.run(
                query_embedding=query_embedding,
                top_k=5
            )
            
            documents = retrieval_result["documents"]
            print(f"   Retrieved {len(documents)} documents")
            
            if documents:
                for j, doc in enumerate(documents[:3]):  # Show top 3
                    score = getattr(doc, 'score', 'N/A')
                    source = doc.meta.get('source', 'unknown')[:50] + '...'
                    
                    print(f"   Doc {j+1} (score: {score:.3f}): {source}")
                    
                    # Check for hardship allowance content
                    content_lower = doc.content.lower()
                    indicators = []
                    
                    if 'hardship' in content_lower and 'allowance' in content_lower:
                        indicators.append('hardship_allowance')
                    
                    if any(f'level {level}' in content_lower for level in ['i', 'ii', 'iii', 'iv', 'v', 'vi', '1', '2', '3', '4', '5', '6']):
                        indicators.append('levels')
                    
                    # Look for table content
                    if '|' in doc.content:
                        indicators.append('table_format')
                        
                        # Show table content
                        lines = doc.content.split('\n')
                        table_lines = [line for line in lines if '|' in line and line.strip()]
                        
                        if table_lines:
                            print(f"      Table found ({len(table_lines)} lines):")
                            for line in table_lines[:5]:  # Show first 5 lines
                                print(f"        {line}")
                            if len(table_lines) > 5:
                                print(f"        ... and {len(table_lines) - 5} more lines")
                    
                    # Look for specific amounts
                    amounts = []
                    for amount in ['235', '470', '705', '940', '1175', '1409']:
                        if amount in doc.content:
                            amounts.append(amount)
                    
                    if amounts:
                        indicators.append(f'amounts({",".join(amounts)})')
                    
                    if indicators:
                        print(f"      ✅ Contains: {', '.join(indicators)}")
                    else:
                        print(f"      ❌ No hardship allowance indicators")
                    
                    # Show a snippet with hardship content
                    if 'hardship' in content_lower:
                        words = doc.content.split()
                        hardship_indices = [i for i, word in enumerate(words) if 'hardship' in word.lower()]
                        
                        if hardship_indices:
                            idx = hardship_indices[0]
                            start = max(0, idx - 10)
                            end = min(len(words), idx + 20)
                            snippet = ' '.join(words[start:end])
                            print(f"      Snippet: ...{snippet}...")
            else:
                print(f"   ❌ No documents retrieved")
                
        except Exception as e:
            print(f"   Error: {e}")
    
    # Check specific hardship allowance documents
    print(f"\n{'='*60}")
    print("HARDSHIP ALLOWANCE DOCUMENT ANALYSIS")
    print('='*60)
    
    all_docs = document_store.filter_documents()
    hardship_docs = []
    
    for doc in all_docs:
        content_lower = doc.content.lower()
        if 'hardship' in content_lower and 'allowance' in content_lower:
            hardship_docs.append(doc)
    
    print(f"Found {len(hardship_docs)} hardship allowance documents")
    
    # Look for the updated documents with tables
    for i, doc in enumerate(hardship_docs):
        if '|' in doc.content and ('235' in doc.content or '470' in doc.content):
            print(f"\nDocument {i+1} with extracted table:")
            print(f"Source: {doc.meta.get('source', 'unknown')}")
            print(f"Content length: {len(doc.content)} chars")
            
            # Show the table content
            lines = doc.content.split('\n')
            table_start = -1
            table_end = -1
            
            for j, line in enumerate(lines):
                if '|' in line and 'Level' in line:
                    table_start = j
                    break
            
            if table_start >= 0:
                for j in range(table_start, len(lines)):
                    if lines[j].strip() and '|' not in lines[j]:
                        table_end = j
                        break
                
                if table_end == -1:
                    table_end = len(lines)
                
                print(f"Table content (lines {table_start+1}-{table_end}):")
                for j in range(table_start, min(table_end, table_start + 10)):
                    print(f"  {lines[j]}")
                
                if table_end - table_start > 10:
                    print(f"  ... and {table_end - table_start - 10} more lines")
            
            # Also show surrounding context
            print("\nContext around table:")
            context_start = max(0, table_start - 3)
            context_end = min(len(lines), table_end + 3)
            
            for j in range(context_start, context_end):
                marker = ">>> " if table_start <= j < table_end else "    "
                print(f"{marker}{lines[j]}")
            
            break  # Just show the first one with table

if __name__ == "__main__":
    test_hardship_allowance_queries()