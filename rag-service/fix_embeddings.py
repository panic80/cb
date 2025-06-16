#!/usr/bin/env python3

"""Re-generate embeddings for all documents in the database."""

import asyncio
import logging
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.components.embedders import OpenAIDocumentEmbedder
from haystack.utils import Secret
from haystack import Document
from app.core.config import settings

# Set logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def fix_embeddings():
    """Re-embed all documents that are missing embeddings."""
    
    print("Starting embedding fix process...\n")
    
    # Create document store
    ds = PgvectorDocumentStore(
        connection_string=Secret.from_token(settings.DATABASE_URL),
        table_name="documents",
        embedding_dimension=3072,
        recreate_table=False
    )
    
    # Create embedder
    embedder = OpenAIDocumentEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    )
    
    # Get all documents
    print("Fetching all documents...")
    all_docs = ds.filter_documents()
    print(f"Found {len(all_docs)} documents total")
    
    # Find documents without embeddings
    docs_without_embeddings = []
    for doc in all_docs:
        if not hasattr(doc, 'embedding') or doc.embedding is None:
            docs_without_embeddings.append(doc)
    
    print(f"Found {len(docs_without_embeddings)} documents without embeddings")
    
    if not docs_without_embeddings:
        print("All documents already have embeddings!")
        return
    
    # Process in batches
    batch_size = 10
    total_processed = 0
    
    for i in range(0, len(docs_without_embeddings), batch_size):
        batch = docs_without_embeddings[i:i+batch_size]
        print(f"\nProcessing batch {i//batch_size + 1} ({len(batch)} documents)...")
        
        try:
            # Generate embeddings for the batch
            result = embedder.run(documents=batch)
            embedded_docs = result["documents"]
            
            # Update documents in the store
            for doc in embedded_docs:
                if hasattr(doc, 'embedding') and doc.embedding is not None:
                    # Write the document back with its new embedding
                    ds.write_documents([doc], policy="overwrite")
                    total_processed += 1
                    
                    # Show progress for important documents
                    if "yukon" in doc.content.lower():
                        print(f"  ✓ Embedded Yukon document: {doc.meta.get('source', 'Unknown')[:50]}...")
            
            print(f"  Processed {len(embedded_docs)} documents in this batch")
            
        except Exception as e:
            logger.error(f"Error processing batch: {e}")
            print(f"  ✗ Error in batch: {str(e)}")
        
        # Small delay to avoid rate limits
        await asyncio.sleep(1)
    
    print(f"\n\nEmbedding process complete!")
    print(f"Successfully embedded {total_processed} documents")
    
    # Verify the fix
    print("\nVerifying embeddings...")
    all_docs_after = ds.filter_documents()
    docs_with_embeddings = sum(1 for doc in all_docs_after if hasattr(doc, 'embedding') and doc.embedding is not None)
    print(f"Documents with embeddings: {docs_with_embeddings}/{len(all_docs_after)}")
    
    # Test retrieval for Yukon
    print("\nTesting Yukon retrieval...")
    from haystack.components.embedders import OpenAITextEmbedder
    from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever
    
    text_embedder = OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    )
    
    retriever = PgvectorEmbeddingRetriever(
        document_store=ds,
        top_k=10
    )
    
    # Test query
    query = "What is the lunch rate in Yukon?"
    embedding_result = text_embedder.run(text=query)
    retrieval_result = retriever.run(query_embedding=embedding_result["embedding"])
    
    yukon_found = False
    for doc in retrieval_result["documents"]:
        if "yukon" in doc.content.lower() and "$37" in doc.content:
            yukon_found = True
            print(f"✓ Found Yukon lunch rates! Score: {doc.score}")
            break
    
    if not yukon_found:
        print("✗ Yukon lunch rates still not found in top results")
    
if __name__ == "__main__":
    asyncio.run(fix_embeddings())