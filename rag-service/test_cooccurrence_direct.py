"""
Test the co-occurrence retriever directly to see if it finds the Ontario rate.
"""

import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.components.cooccurrence_indexer import CooccurrenceIndexer
from app.components.cooccurrence_retriever import CooccurrenceRetriever
from app.core.logging import get_logger

logger = get_logger(__name__)


def test_cooccurrence():
    """Test co-occurrence retrieval directly."""
    
    # Create retriever
    retriever = CooccurrenceRetriever(
        index_path=Path("cooccurrence_index"),
        top_k=10
    )
    
    # Test queries
    queries = [
        "ontario kilometric rate",
        "ontario rate",
        "ontario $0.57",
        "kilometric rate ontario"
    ]
    
    for query in queries:
        logger.info(f"\n=== Testing query: '{query}' ===")
        
        # Get documents
        docs = retriever._get_relevant_documents(query)
        
        logger.info(f"Found {len(docs)} documents")
        
        for i, doc in enumerate(docs[:3]):
            logger.info(f"\nDocument {i+1}:")
            logger.info(f"  Retrieval method: {doc.metadata.get('retrieval_method', 'unknown')}")
            logger.info(f"  Co-occurrence score: {doc.metadata.get('cooccurrence_score', 'N/A')}")
            logger.info(f"  Matching tokens: {doc.metadata.get('matching_tokens', [])}")
            logger.info(f"  Content preview: {doc.page_content[:200]}...")
            
            # Check if it contains the rate
            if "ontario" in doc.page_content.lower() and ("0.57" in doc.page_content or "$0.57" in doc.page_content):
                logger.info("  *** FOUND ONTARIO RATE $0.57! ***")
    
    # Also test the indexer directly
    logger.info("\n=== Testing indexer directly ===")
    indexer = retriever.indexer
    
    # Check some statistics
    logger.info(f"Total documents in index: {len(indexer.document_tokens)}")
    logger.info(f"Total unique tokens: {len(indexer.token_positions)}")
    
    # Check if key terms exist
    key_terms = ["ontario", "kilometric", "rate", "0.57", "$0.57"]
    for term in key_terms:
        if term in indexer.token_positions:
            docs_with_term = list(indexer.token_positions[term].keys())
            logger.info(f"Term '{term}' found in {len(docs_with_term)} documents")
        else:
            logger.info(f"Term '{term}' NOT FOUND in index")
            
    # Try direct co-occurrence search
    logger.info("\n=== Direct co-occurrence search ===")
    results = indexer.find_connecting_content(["ontario", "kilometric", "rate"], top_k=5)
    
    for doc_id, score, details in results:
        logger.info(f"\nDocument {doc_id}:")
        logger.info(f"  Score: {score:.3f}")
        logger.info(f"  Matching tokens: {details['matching_tokens']}")
        logger.info(f"  Sample context: {details['sample_contexts'][0] if details['sample_contexts'] else 'N/A'}")


def main():
    """Main entry point."""
    # Configure logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    test_cooccurrence()


if __name__ == "__main__":
    main()