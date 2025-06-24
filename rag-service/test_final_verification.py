"""
Final verification that co-occurrence retrieval can find Ontario rate.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.core.logging import get_logger
from app.core.vectorstore import VectorStoreManager
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline

logger = get_logger(__name__)


async def test_retrieval():
    """Test the full retrieval pipeline."""
    
    # Initialize components
    vector_store_manager = VectorStoreManager()
    await vector_store_manager.initialize()
    
    # Create retrieval pipeline
    pipeline = ImprovedRetrievalPipeline(
        vector_store_manager=vector_store_manager,
        use_multi_query=True,
        use_compression=False,
        use_smart_chunking=True
    )
    
    # Test queries
    test_queries = [
        "ontario kilometric rate",
        "what is the kilometric rate for ontario",
        "ontario 62.5 cents per kilometer"
    ]
    
    for query in test_queries:
        logger.info(f"\n{'='*60}")
        logger.info(f"Query: '{query}'")
        logger.info(f"{'='*60}")
        
        # Get results
        results = await pipeline.retrieve(query=query, k=10)
        
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
        
        # Check results
        found_ontario_rate = False
        
        for i, source in enumerate(sources):
            # Check if source contains the actual Ontario rate
            if "ontario" in source.text.lower() and ("62.5" in source.text or "62.0" in source.text):
                found_ontario_rate = True
                logger.info(f"\n✓ FOUND ONTARIO RATE in source {i+1}!")
                logger.info(f"  Score: {source.score}")
                logger.info(f"  Content: {source.text[:300]}...")
                
                # Extract the exact rate
                import re
                # Look for Ontario followed by a number
                pattern = r'Ontario[^\d]*(\d+\.?\d*)'
                match = re.search(pattern, source.text, re.IGNORECASE)
                if match:
                    logger.info(f"  Extracted rate: {match.group(1)} cents/km")
                break
        
        if not found_ontario_rate:
            logger.info("\n✗ Ontario rate NOT FOUND in top results")
            # Show what was found instead
            if sources:
                logger.info(f"\nTop result was:")
                logger.info(f"  Score: {sources[0].score}")
                logger.info(f"  Content: {sources[0].text[:200]}...")


def main():
    """Main entry point."""
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    asyncio.run(test_retrieval())


if __name__ == "__main__":
    main()