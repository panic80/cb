"""
Test the retrieval pipeline directly with the ontario kilometric rate query.
"""

import asyncio
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.logging import get_logger
from app.core.vectorstore import VectorStoreManager
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline
from app.services.cache import QueryCache

logger = get_logger(__name__)


async def test_query():
    """Test the ontario kilometric rate query."""
    
    # Initialize components
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    query_cache = None  # Make it optional
    
    # Create retrieval pipeline
    pipeline = ImprovedRetrievalPipeline(
        vector_store_manager=vector_store_manager,
        use_multi_query=True,
        use_compression=False,
        use_smart_chunking=True
    )
    
    # Test query
    query = "ontario kilometric rate"
    logger.info(f"Testing query: '{query}'")
    
    # Get results
    results = await pipeline.retrieve(query=query, k=5)
    
    # Convert results to context and sources
    context_parts = []
    sources = []
    
    for i, (doc, score) in enumerate(results):
        # Add to context
        context_parts.append(f"[Source {i+1}]\n{doc.page_content}\n")
        
        # Create source
        from app.models.query import Source
        source = Source(
            id=doc.metadata.get("id", f"source_{i}"),
            text=doc.page_content[:500] + "..." if len(doc.page_content) > 500 else doc.page_content,
            title=doc.metadata.get("title"),
            url=doc.metadata.get("source"),
            section=doc.metadata.get("section"),
            page=doc.metadata.get("page_number"),
            score=score,
            metadata=doc.metadata
        )
        sources.append(source)
    
    context = "\n".join(context_parts)
    
    # Print results
    logger.info(f"Retrieved {len(sources)} sources")
    
    for i, source in enumerate(sources):
        logger.info(f"\nSource {i+1}:")
        logger.info(f"  Title: {source.title}")
        logger.info(f"  URL: {source.url}")
        logger.info(f"  Score: {source.score}")
        logger.info(f"  Text preview: {source.text[:200]}...")
        
    # Look for specific rate information
    logger.info("\n=== Looking for Ontario rate ===")
    for i, source in enumerate(sources):
        if "ontario" in source.text.lower() and ("$0.57" in source.text or "0.57" in source.text):
            logger.info(f"Found Ontario rate in source {i+1}!")
            logger.info(f"Context: {source.text}")
            

def main():
    """Main entry point."""
    # Configure logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run the test
    asyncio.run(test_query())


if __name__ == "__main__":
    main()