"""Script to build BM25 index from existing documents in vector store."""

import asyncio
from app.core.vectorstore import VectorStoreManager
from app.components.bm25_retriever import TravelBM25Retriever
from app.core.logging import get_logger

logger = get_logger(__name__)


async def build_bm25_index():
    """Build BM25 index from all documents in vector store."""
    # Initialize vector store
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    # Get all documents
    logger.info("Fetching all documents from vector store...")
    
    # Query with empty string to get all documents
    all_docs = []
    batch_size = 100
    
    # Use a broad search to get documents
    results = await vector_store_manager.search(
        query="",  # Empty query
        k=1000,  # Get many documents
        search_type="similarity"
    )
    
    if not results:
        # Try with a different query
        results = await vector_store_manager.search(
            query="meal allowance travel",  # Common terms
            k=1000,
            search_type="similarity"
        )
    
    documents = [doc for doc, _ in results]
    logger.info(f"Retrieved {len(documents)} documents from vector store")
    
    if documents:
        # Build BM25 index
        bm25_retriever = TravelBM25Retriever(documents=[])
        bm25_retriever.build_index(documents)
        logger.info("BM25 index built successfully")
    else:
        logger.warning("No documents found in vector store")
    
    # Close vector store
    await vector_store_manager.close()


if __name__ == "__main__":
    asyncio.run(build_bm25_index())