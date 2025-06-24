"""
Rebuild the co-occurrence index from all documents in the vector store.

This script fetches all documents from the vector store and rebuilds
the co-occurrence index from scratch.
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime

from langchain_core.documents import Document as LangchainDocument

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.components.cooccurrence_indexer import CooccurrenceIndexer
from app.core.config import settings
from app.core.logging import get_logger
from app.core.vectorstore import VectorStoreManager

logger = get_logger(__name__)


async def fetch_all_documents(vector_store_manager: VectorStoreManager) -> list[LangchainDocument]:
    """Fetch all documents from the vector store."""
    logger.info("Fetching all documents from vector store...")
    
    try:
        # This is a simplified approach - in production you might want to
        # paginate through results or use a more efficient method
        
        # Search with an empty query to get documents
        # We'll use multiple searches with different common terms to get more coverage
        search_terms = [
            "",  # Empty search
            "the", "and", "of", "to", "in",  # Common words
            "rate", "travel", "allowance", "canada",  # Domain-specific terms
            "kilometric", "meal", "hotel", "transportation"  # More specific terms
        ]
        
        all_docs = []
        seen_ids = set()
        
        for term in search_terms:
            logger.info(f"Searching with term: '{term}'")
            results = await vector_store_manager.search(
                query=term,
                k=500,  # Get many results
                search_type="similarity"
            )
            
            for doc, score in results:
                doc_id = doc.metadata.get("id", doc.page_content[:50])
                if doc_id not in seen_ids:
                    seen_ids.add(doc_id)
                    all_docs.append(doc)
            
            logger.info(f"Total unique documents so far: {len(all_docs)}")
        
        logger.info(f"Fetched {len(all_docs)} unique documents from vector store")
        return all_docs
        
    except Exception as e:
        logger.error(f"Error fetching documents: {e}")
        return []


async def rebuild_cooccurrence_index():
    """Rebuild the co-occurrence index from scratch."""
    start_time = datetime.now()
    
    logger.info("=== Starting Co-occurrence Index Rebuild ===")
    
    # Initialize vector store manager
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    # Fetch all documents
    documents = await fetch_all_documents(vector_store_manager)
    
    if not documents:
        logger.error("No documents found in vector store")
        return
    
    # Create new co-occurrence indexer
    indexer = CooccurrenceIndexer(
        window_sizes=[5, 10, 20, 50, 100],  # Multiple window sizes for better coverage
        min_token_length=2,
        index_path=Path("cooccurrence_index")
    )
    
    # Clear existing index
    logger.info("Clearing existing co-occurrence index...")
    indexer.clear_index()
    
    # Index all documents
    logger.info(f"Indexing {len(documents)} documents...")
    
    batch_size = 100
    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        for doc in batch:
            try:
                indexer.add_document(doc)
            except Exception as e:
                logger.error(f"Error indexing document: {e}")
                continue
        
        # Log progress
        progress = min(i + batch_size, len(documents))
        logger.info(f"Indexed {progress}/{len(documents)} documents ({progress/len(documents)*100:.1f}%)")
    
    # Save the index
    logger.info("Saving co-occurrence index...")
    indexer.save_index()
    
    # Print statistics
    elapsed_time = (datetime.now() - start_time).total_seconds()
    logger.info(f"\n=== Co-occurrence Index Rebuild Complete ===")
    logger.info(f"Total documents indexed: {len(documents)}")
    logger.info(f"Total unique tokens: {len(indexer.token_positions)}")
    logger.info(f"Total co-occurrence edges: {sum(len(neighbors) for neighbors in indexer.cooccurrence_graph.values())}")
    logger.info(f"Time elapsed: {elapsed_time:.2f} seconds")
    logger.info(f"Index saved to: {indexer.index_path}")
    
    # Test with a sample query
    logger.info("\n=== Testing with sample query ===")
    test_query = ["ontario", "kilometric", "rate"]
    results = indexer.find_connecting_content(test_query, top_k=3)
    
    if results:
        logger.info(f"Query '{' '.join(test_query)}' returned {len(results)} results:")
        for doc_id, score, details in results:
            logger.info(f"  - Document {doc_id}: score={score:.3f}, matching_tokens={details['matching_tokens']}")
    else:
        logger.info("No results found for test query")


def main():
    """Main entry point."""
    # Configure logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run the rebuild
    asyncio.run(rebuild_cooccurrence_index())


if __name__ == "__main__":
    main()