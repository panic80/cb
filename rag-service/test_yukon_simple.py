#!/usr/bin/env python3

"""Simple test to check Yukon data retrieval."""

import os
import logging
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever
from haystack.components.embedders import OpenAITextEmbedder
from haystack.utils import Secret
from app.core.config import settings

# Set minimal logging
logging.basicConfig(level=logging.WARNING)

# Suppress HTTP logs
logging.getLogger("httpx").setLevel(logging.ERROR)
logging.getLogger("haystack").setLevel(logging.WARNING)

def test_simple():
    print("Testing Yukon data retrieval...\n")
    
    # Create document store
    ds = PgvectorDocumentStore(
        connection_string=Secret.from_token(settings.DATABASE_URL),
        table_name="documents",
        embedding_dimension=3072,
        recreate_table=False
    )
    
    print(f"Total documents in store: {ds.count_documents()}\n")
    
    # Get all documents and check for Yukon
    print("Checking for Yukon content in all documents...")
    all_docs = ds.filter_documents()
    
    yukon_docs = []
    for doc in all_docs:
        if "Yukon" in doc.content or "yukon" in doc.content.lower():
            yukon_docs.append(doc)
    
    print(f"Found {len(yukon_docs)} documents with Yukon content\n")
    
    if yukon_docs:
        print("Sample Yukon document:")
        # Print the full content to see if it contains lunch rates
        print(f"Full content:\n{yukon_docs[0].content}\n")
        print(f"Source: {yukon_docs[0].meta.get('source', 'Unknown')}")
        print(f"Has embedding: {hasattr(yukon_docs[0], 'embedding') and yukon_docs[0].embedding is not None}")
        
        # Check if lunch rates are in the content
        if "$37" in yukon_docs[0].content or "lunch" in yukon_docs[0].content.lower():
            print("✓ Document contains lunch rate information!")
        else:
            print("✗ Document does NOT contain lunch rate information")
    
    # Test embedding search
    print("\n\nTesting embedding search for 'lunch rate Yukon'...")
    
    # Create embedder
    embedder = OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    )
    
    # Get query embedding
    result = embedder.run(text="What is the lunch rate in Yukon?")
    query_embedding = result["embedding"]
    
    # Create retriever
    retriever = PgvectorEmbeddingRetriever(
        document_store=ds,
        top_k=30
    )
    
    # Search
    retrieval_result = retriever.run(query_embedding=query_embedding)
    retrieved_docs = retrieval_result["documents"]
    
    print(f"\nRetrieved {len(retrieved_docs)} documents")
    
    # Check if Yukon is in retrieved docs
    yukon_found = False
    yukon_positions = []
    
    for i, doc in enumerate(retrieved_docs):
        if "Yukon" in doc.content or "yukon" in doc.content.lower():
            yukon_found = True
            yukon_positions.append(i+1)
            if len(yukon_positions) == 1:  # Print first match
                print(f"\n✓ Found Yukon at position {i+1} with score {getattr(doc, 'score', 'N/A')}")
                print(f"Content preview: {doc.content[:200]}...")
    
    if yukon_found:
        print(f"\nYukon content found at positions: {yukon_positions}")
    else:
        print("\n✗ No Yukon content in top 30 retrieved documents!")
        print("\nTop 5 retrieved documents instead:")
        for i, doc in enumerate(retrieved_docs[:5]):
            print(f"\n{i+1}. Score: {getattr(doc, 'score', 'N/A')}")
            print(f"   Content: {doc.content[:150]}...")
    
    # Check settings
    print(f"\n\nCurrent settings:")
    print(f"TOP_K_RETRIEVAL: {settings.TOP_K_RETRIEVAL}")
    print(f"TOP_K_RERANKING: {settings.TOP_K_RERANKING}")
    print(f"Score filter threshold: 0.05")
    print(f"Initial retrieval in pipeline: {settings.TOP_K_RETRIEVAL * 3} docs")

if __name__ == "__main__":
    test_simple()