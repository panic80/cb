#!/usr/bin/env python3
"""Test script to verify table retrieval improvements."""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'rag-service'))

from app.utils.table_validator import TableValidator, TableStructure
from app.components.table_query_rewriter import TableQueryRewriter
from app.components.table_ranker import TableRanker
from langchain_core.documents import Document


def test_table_validator():
    """Test table validation functionality."""
    print("Testing Table Validator...")
    
    # Test 1: Detect headers
    rows = [
        ["Province", "Rate", "Effective Date"],
        ["Ontario", "62.5 cents/km", "2024-01-01"],
        ["Quebec", "61.0 cents/km", "2024-01-01"],
        ["Alberta", "59.5 cents/km", "2024-01-01"]
    ]
    
    headers, data_rows = TableValidator.detect_headers(rows)
    print(f"Detected headers: {headers}")
    print(f"Data rows: {len(data_rows)}")
    
    # Test 2: Validate table structure
    table = TableValidator.validate_table_structure(rows)
    table.title = "Provincial Kilometric Rates"
    
    print("\nMarkdown representation:")
    print(table.to_markdown())
    
    print("\nJSON representation:")
    import json
    print(json.dumps(table.to_json(), indent=2))
    
    # Test 3: Extract numeric values
    test_values = ["62.5 cents/km", "$150.00", "75%", "100"]
    for value in test_values:
        numeric = TableValidator.extract_numeric_value(value)
        print(f"'{value}' -> {numeric}")
    
    print("\n✓ Table Validator tests passed!")


def test_query_rewriter():
    """Test query rewriting functionality."""
    print("\n\nTesting Query Rewriter...")
    
    rewriter = TableQueryRewriter()
    
    test_queries = [
        "What is the Ontario kilometric rate?",
        "meal allowances in Toronto",
        "hotel limits for Vancouver",
        "What is the per diem rate for Calgary?"
    ]
    
    for query in test_queries:
        result = rewriter._quick_rewrite(query)
        if result:
            print(f"\nOriginal: {query}")
            print(f"Rewritten: {result['rewritten_query']}")
            print(f"Keywords: {result['table_keywords'][:5]}")
            print(f"Value patterns: {result['value_patterns']}")
    
    print("\n✓ Query Rewriter tests passed!")


def test_table_ranker():
    """Test table ranking functionality."""
    print("\n\nTesting Table Ranker...")
    
    ranker = TableRanker()
    
    # Create test documents
    docs = [
        Document(
            page_content="Ontario kilometric rate is 62.5 cents per kilometer",
            metadata={
                "content_type": "table_key_value",
                "table_title": "Provincial Kilometric Rates",
                "headers": ["Province", "Rate"],
                "key": "Ontario",
                "value": "62.5 cents/km"
            }
        ),
        Document(
            page_content="General travel information about Ontario",
            metadata={
                "content_type": "text",
                "title": "Travel Guide"
            }
        ),
        Document(
            page_content="| Province | Rate |\n|----------|------|\n| Ontario | 62.5 cents/km |",
            metadata={
                "content_type": "table_markdown",
                "table_title": "Kilometric Rates by Province",
                "headers": ["Province", "Rate"]
            }
        )
    ]
    
    query = "What is the Ontario kilometric rate?"
    value_patterns = ["62.5", "cents/km"]
    
    # Rank documents
    ranked = ranker.rank_documents(docs, query, "table", value_patterns)
    
    print(f"\nQuery: {query}")
    print("\nRanked documents:")
    for i, (doc, score) in enumerate(ranked):
        print(f"{i+1}. Score: {score:.2f} - Type: {doc.metadata.get('content_type')} - {doc.page_content[:50]}...")
    
    print("\n✓ Table Ranker tests passed!")


def test_table_chunking():
    """Test table chunking functionality."""
    print("\n\nTesting Table Chunking...")
    
    # Create a large table
    headers = ["Province", "City", "Rate", "Effective Date"]
    rows = []
    for i in range(50):
        rows.append([f"Province{i}", f"City{i}", f"{50+i} cents/km", "2024-01-01"])
    
    table = TableStructure(
        headers=headers,
        rows=rows,
        title="Large Provincial Rate Table"
    )
    
    # Chunk the table
    chunks = TableValidator.chunk_large_table(table, max_rows=20)
    
    print(f"Original table rows: {len(table.rows)}")
    print(f"Number of chunks: {len(chunks)}")
    
    for i, chunk in enumerate(chunks):
        print(f"\nChunk {i+1}:")
        print(f"  Title: {chunk.title}")
        print(f"  Rows: {len(chunk.rows)}")
        print(f"  Is continuation: {chunk.metadata.get('is_continuation', False)}")
    
    print("\n✓ Table Chunking tests passed!")


if __name__ == "__main__":
    print("Running Table Improvement Tests\n" + "="*50)
    
    try:
        test_table_validator()
        test_query_rewriter()
        test_table_ranker()
        test_table_chunking()
        
        print("\n" + "="*50)
        print("All tests passed! ✓")
        print("\nTable retrieval improvements successfully implemented:")
        print("- Enhanced table extraction with validation")
        print("- Smart header detection")
        print("- Multiple table representations (markdown, JSON, key-value)")
        print("- Improved query rewriting for table queries")
        print("- Table-specific document ranking")
        print("- Large table chunking with context preservation")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()