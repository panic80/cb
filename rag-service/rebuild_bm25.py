"""Script to rebuild BM25 index from all documents in vector store."""

import asyncio
from app.core.vectorstore import VectorStoreManager
from app.components.bm25_retriever import TravelBM25Retriever
from app.core.logging import get_logger

logger = get_logger(__name__)


async def rebuild_bm25_index():
    """Rebuild BM25 index from all documents in vector store."""
    # Initialize vector store
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    # Get all documents from vector store
    logger.info("Fetching all documents from vector store...")
    
    # Get the vector store collection
    collection = vector_store_manager.vector_store._collection
    
    # Get all documents from the collection
    results = collection.get(include=["documents", "metadatas"])
    
    if results and results['documents']:
        # Convert to Document objects
        from langchain_core.documents import Document
        
        documents = []
        for i, content in enumerate(results['documents']):
            metadata = results['metadatas'][i] if results['metadatas'] else {}
            doc = Document(
                page_content=content,
                metadata=metadata
            )
            documents.append(doc)
        
        logger.info(f"Retrieved {len(documents)} documents from vector store")
        
        # Build BM25 index
        bm25_retriever = TravelBM25Retriever(documents=[])
        bm25_retriever.build_index(documents)
        logger.info("BM25 index rebuilt successfully")
    else:
        logger.warning("No documents found in vector store")
    
    # Close vector store
    await vector_store_manager.close()


if __name__ == "__main__":
    asyncio.run(rebuild_bm25_index())