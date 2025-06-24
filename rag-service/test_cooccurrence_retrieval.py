"""
Test script for content co-occurrence retrieval.

This script tests the generic co-occurrence indexing approach with various
document formats including tables, prose, JSON, and lists.
"""

import asyncio
from pathlib import Path
from typing import List

from langchain_core.documents import Document

from app.components.cooccurrence_indexer import CooccurrenceIndexer
from app.components.cooccurrence_retriever import CooccurrenceRetriever
from app.core.logging import get_logger

logger = get_logger(__name__)


def create_test_documents() -> List[Document]:
    """Create test documents with various formats."""
    
    # Test document 1: Table format (markdown)
    doc1 = Document(
        page_content="""
## Appendix C - Kilometric Rates by Province

| Province | Rate per km | Effective Date |
|----------|------------|----------------|
| Ontario | $0.57 | April 1, 2024 |
| Quebec | $0.54 | April 1, 2024 |
| British Columbia | $0.59 | April 1, 2024 |
| Alberta | $0.55 | April 1, 2024 |
| Manitoba | $0.53 | April 1, 2024 |
| Saskatchewan | $0.52 | April 1, 2024 |
| Nova Scotia | $0.56 | April 1, 2024 |
| New Brunswick | $0.55 | April 1, 2024 |
| Newfoundland | $0.58 | April 1, 2024 |
| PEI | $0.54 | April 1, 2024 |
| Yukon | $0.615 | April 1, 2024 |
| Northwest Territories | $0.625 | April 1, 2024 |
| Nunavut | $0.635 | April 1, 2024 |
""",
        metadata={
            "id": "doc1",
            "source": "test_table.md",
            "type": "markdown",
            "content_type": "table_markdown"
        }
    )
    
    # Test document 2: Prose format
    doc2 = Document(
        page_content="""
The kilometric rate for Ontario has been set at $0.57 per kilometer effective 
April 1, 2024. This rate applies to all personal vehicle usage for official 
government business travel. Quebec maintains a slightly lower rate of $0.54 
per kilometer, while British Columbia has a higher rate of $0.59 per kilometer 
due to higher fuel costs in the province.
""",
        metadata={
            "id": "doc2",
            "source": "test_prose.txt",
            "type": "text"
        }
    )
    
    # Test document 3: JSON format
    doc3 = Document(
        page_content="""
{
  "kilometric_rates": {
    "2024": {
      "Ontario": {
        "rate": "$0.57",
        "per": "km",
        "effective": "2024-04-01"
      },
      "Quebec": {
        "rate": "$0.54",
        "per": "km",
        "effective": "2024-04-01"
      },
      "Yukon": {
        "rate": "$0.615",
        "per": "km",
        "effective": "2024-04-01"
      }
    }
  }
}
""",
        metadata={
            "id": "doc3",
            "source": "test_data.json",
            "type": "json"
        }
    )
    
    # Test document 4: List format
    doc4 = Document(
        page_content="""
Provincial Kilometric Rates (2024):
- Ontario: kilometric rate $0.57/km
- Quebec: kilometric rate $0.54/km  
- British Columbia: kilometric rate $0.59/km
- Alberta: kilometric rate $0.55/km
- Yukon: kilometric rate $0.615/km
- Northwest Territories: kilometric rate $0.625/km
- Nunavut: kilometric rate $0.635/km
""",
        metadata={
            "id": "doc4",
            "source": "test_list.txt",
            "type": "text"
        }
    )
    
    # Test document 5: Key-value table
    doc5 = Document(
        page_content="""
## Meal Allowances

Breakfast: $23.60
Lunch: $23.65
Dinner: $60.90
Incidentals: $17.30

Total Daily Allowance: $125.45

## Kilometric Allowances

Low Rate Provinces:
Saskatchewan: $0.52/km
Manitoba: $0.53/km

Medium Rate Provinces:
Quebec: $0.54/km
Alberta: $0.55/km
New Brunswick: $0.55/km

High Rate Provinces:
Ontario: $0.57/km
Nova Scotia: $0.56/km
Newfoundland: $0.58/km
British Columbia: $0.59/km

Northern Territories:
Yukon: $0.615/km
Northwest Territories: $0.625/km
Nunavut: $0.635/km
""",
        metadata={
            "id": "doc5",
            "source": "test_keyvalue.txt",
            "type": "text",
            "content_type": "table_key_value"
        }
    )
    
    # Test document 6: Complex table with multiple values
    doc6 = Document(
        page_content="""
Travel Rates Summary Table

Category | Ontario | Quebec | Yukon | Notes
---------|---------|--------|-------|-------
Kilometric Rate | $0.57 | $0.54 | $0.615 | Per kilometer
Daily Meal Allowance | $125.45 | $125.45 | $158.85 | Includes incidentals
Hotel Max | $150 | $140 | $238 | Per night
Taxi/Uber | Actual | Actual | Actual | With receipts
""",
        metadata={
            "id": "doc6",
            "source": "test_complex_table.md",
            "type": "markdown",
            "content_type": "table_markdown"
        }
    )
    
    return [doc1, doc2, doc3, doc4, doc5, doc6]


def test_indexing():
    """Test document indexing."""
    logger.info("=== Testing Document Indexing ===")
    
    # Create indexer
    indexer = CooccurrenceIndexer(
        window_sizes=[5, 10, 20, 50],
        min_token_length=2,
        index_path=Path("test_cooccurrence_index")
    )
    
    # Clear any existing index
    indexer.clear_index()
    
    # Get test documents
    documents = create_test_documents()
    
    # Index documents
    for doc in documents:
        indexer.add_document(doc)
        logger.info(f"Indexed document: {doc.metadata['id']}")
    
    # Save index
    indexer.save_index()
    logger.info("Index saved successfully")
    
    # Print some statistics
    logger.info(f"Total unique tokens: {len(indexer.token_positions)}")
    logger.info(f"Total documents: {len(indexer.document_tokens)}")
    
    # Show some sample co-occurrences
    sample_terms = ["ontario", "kilometric", "rate", "$0.57", "yukon"]
    for term in sample_terms:
        if term in indexer.cooccurrence_graph:
            neighbors = list(indexer.cooccurrence_graph[term].keys())[:5]
            logger.info(f"Term '{term}' co-occurs with: {neighbors}")


def test_queries():
    """Test various query patterns."""
    logger.info("\n=== Testing Query Patterns ===")
    
    # Create retriever
    retriever = CooccurrenceRetriever(
        index_path=Path("test_cooccurrence_index"),
        top_k=5
    )
    
    # Test queries
    test_queries = [
        # Simple queries
        "Ontario kilometric rate",
        "Yukon kilometric rate",
        "Quebec rate kilometer",
        
        # Split term queries (the main issue we're solving)
        "Ontario $0.57",
        "Yukon $0.615",
        "kilometric $0.54",
        
        # Complex queries
        "meal allowance breakfast",
        "northern territories rates",
        "high rate provinces",
        
        # Value-only queries
        "$0.57 per kilometer",
        "$125.45 daily",
        "$0.615 rate"
    ]
    
    for query in test_queries:
        logger.info(f"\nQuery: '{query}'")
        
        # Get results using co-occurrence
        results = retriever._get_relevant_documents(query)
        
        if results:
            logger.info(f"Found {len(results)} results:")
            for i, doc in enumerate(results[:3]):  # Show top 3
                logger.info(f"  Result {i+1}:")
                logger.info(f"    Source: {doc.metadata.get('source', 'unknown')}")
                logger.info(f"    Score: {doc.metadata.get('cooccurrence_score', 'N/A')}")
                logger.info(f"    Matching tokens: {doc.metadata.get('matching_tokens', [])}")
                logger.info(f"    Content preview: {doc.page_content[:100]}...")
        else:
            logger.info("  No results found")


def test_performance():
    """Test retrieval performance with the indexer."""
    logger.info("\n=== Testing Retrieval Performance ===")
    
    # Load indexer to check statistics
    indexer = CooccurrenceIndexer(index_path=Path("test_cooccurrence_index"))
    indexer.load_index()
    
    # Test specific problematic queries
    problematic_queries = [
        ("Ontario kilometric rate", ["ontario", "kilometric", "rate"]),
        ("Ontario $0.57", ["ontario", "$0.57"]),
        ("Yukon rate $0.615", ["yukon", "rate", "$0.615"]),
        ("Quebec $0.54 kilometer", ["quebec", "$0.54", "kilometer"])
    ]
    
    for query, expected_terms in problematic_queries:
        logger.info(f"\nAnalyzing query: '{query}'")
        
        # Find connecting content
        results = indexer.find_connecting_content(expected_terms, top_k=3)
        
        if results:
            logger.info(f"Found {len(results)} documents connecting the terms:")
            for doc_id, score, details in results:
                logger.info(f"  Document {doc_id}:")
                logger.info(f"    Score: {score:.3f}")
                logger.info(f"    Matching tokens: {details['matching_tokens']}")
                logger.info(f"    Proximity scores: {details['proximity_scores']}")
                if details['sample_contexts']:
                    logger.info(f"    Context: {details['sample_contexts'][0]}")
        else:
            logger.info("  No connecting documents found")


def test_comparison():
    """Compare results with different retrieval methods."""
    logger.info("\n=== Comparing Retrieval Methods ===")
    
    # This would compare co-occurrence retrieval with other methods
    # For now, just show how co-occurrence handles the specific table value case
    
    query = "Ontario kilometric rate"
    logger.info(f"Query: '{query}'")
    
    # Create retriever
    retriever = CooccurrenceRetriever(
        index_path=Path("test_cooccurrence_index"),
        top_k=5
    )
    
    # Get results
    results = retriever._get_relevant_documents(query)
    
    logger.info("\nCo-occurrence Retrieval Results:")
    for i, doc in enumerate(results):
        logger.info(f"{i+1}. Source: {doc.metadata.get('source')}, "
                   f"Type: {doc.metadata.get('content_type', doc.metadata.get('type'))}")


def main():
    """Run all tests."""
    # Test 1: Index documents
    test_indexing()
    
    # Test 2: Query patterns
    test_queries()
    
    # Test 3: Performance analysis
    test_performance()
    
    # Test 4: Method comparison
    test_comparison()
    
    logger.info("\n=== Testing Complete ===")


if __name__ == "__main__":
    # Configure logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    main()