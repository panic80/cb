"""
Debug what Ontario-related content is in the index.
"""

import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.components.cooccurrence_indexer import CooccurrenceIndexer
from app.core.logging import get_logger

logger = get_logger(__name__)


def debug_ontario():
    """Debug Ontario content in the index."""
    
    # Load indexer
    indexer = CooccurrenceIndexer(index_path=Path("cooccurrence_index"))
    indexer.load_index()
    
    # Find documents with Ontario
    ontario_docs = indexer.token_positions.get("ontario", {})
    logger.info(f"Found 'ontario' in {len(ontario_docs)} documents")
    
    # Look at each document
    for doc_id in ontario_docs:
        tokens = indexer.document_tokens.get(doc_id, [])
        logger.info(f"\nDocument {doc_id}:")
        logger.info(f"  Total tokens: {len(tokens)}")
        
        # Find ontario positions
        ontario_positions = ontario_docs[doc_id]
        
        # Show context around ontario
        for pos in ontario_positions[:2]:  # Show first 2 occurrences
            start = max(0, pos - 5)
            end = min(len(tokens), pos + 6)
            context = tokens[start:end]
            logger.info(f"  Context at position {pos}: {' '.join(context)}")
            
            # Look for numeric values nearby
            numeric_tokens = [t for t in context if any(c.isdigit() for c in t)]
            if numeric_tokens:
                logger.info(f"    Numeric values found: {numeric_tokens}")
    
    # Also search for patterns that might be rates
    logger.info("\n=== Searching for rate patterns ===")
    
    # Look for tokens that could be rates
    rate_patterns = []
    for token in indexer.token_positions.keys():
        # Check if it looks like a rate (contains digits and decimal or dollar sign)
        if any(c.isdigit() for c in token) and ('.' in token or '$' in token or 'cent' in token.lower()):
            rate_patterns.append(token)
    
    logger.info(f"Found {len(rate_patterns)} potential rate values")
    logger.info(f"Sample rate values: {rate_patterns[:20]}")
    
    # Check co-occurrence between ontario and rate values
    logger.info("\n=== Checking Ontario + rate co-occurrences ===")
    
    if "ontario" in indexer.cooccurrence_graph:
        ontario_neighbors = indexer.cooccurrence_graph["ontario"]
        
        # Look for numeric neighbors
        numeric_neighbors = []
        for neighbor, edge in ontario_neighbors.items():
            if any(c.isdigit() for c in neighbor):
                min_dist = edge.get_min_distance()
                numeric_neighbors.append((neighbor, min_dist))
        
        # Sort by distance
        numeric_neighbors.sort(key=lambda x: x[1])
        
        logger.info(f"Numeric terms near 'ontario':")
        for term, dist in numeric_neighbors[:10]:
            logger.info(f"  '{term}' at distance {dist}")


def main():
    """Main entry point."""
    # Configure logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    debug_ontario()


if __name__ == "__main__":
    main()