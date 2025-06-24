#!/usr/bin/env python3
"""Test script to verify table value retrieval."""

import asyncio
import logging
from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline
from app.pipelines.ingestion import IngestionPipeline
from app.models.documents import DocumentIngestionRequest, DocumentType

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_table_queries():
    """Test various table-related queries."""
    # Initialize components
    vector_store_manager = VectorStoreManager()
    
    # Initialize retrieval pipeline
    retrieval_pipeline = ImprovedRetrievalPipeline(
        vector_store_manager=vector_store_manager,
        use_multi_query=True,
        use_compression=False,
        use_smart_chunking=True
    )
    
    # Test queries
    test_queries = [
        "what is incidental rate",
        "incidental expense allowance rate",
        "what is the incidental rate for domestic travel",
        "incidental allowance Appendix C",
        "daily incidental expense amount",
        "how much is the incidental allowance",
        "meal allowance rates",
        "what are the meal rates"
    ]
    
    print("\n" + "="*80)
    print("TESTING TABLE VALUE RETRIEVAL")
    print("="*80 + "\n")
    
    for query in test_queries:
        print(f"\nQuery: {query}")
        print("-" * 60)
        
        try:
            results = await retrieval_pipeline.retrieve(
                query=query,
                k=5
            )
            
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
            
            # Check if we found any table content
            found_table = False
            found_value = False
            
            for i, source in enumerate(sources):
                content_type = source.metadata.get("content_type", "")
                if "table" in content_type:
                    found_table = True
                    
                # Check for dollar amounts or specific values
                if "$" in source.text or any(char.isdigit() for char in source.text):
                    found_value = True
                    
                print(f"\nSource {i+1}:")
                print(f"  Type: {content_type}")
                print(f"  Section: {source.section}")
                print(f"  Score: {source.score:.3f}")
                print(f"  Preview: {source.text[:200]}...")
                
            print(f"\nFound table content: {found_table}")
            print(f"Found specific values: {found_value}")
            
        except Exception as e:
            logger.error(f"Error processing query '{query}': {e}")
            print(f"ERROR: {e}")
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")


async def ingest_test_table():
    """Ingest a test table document to verify table extraction."""
    vector_store_manager = VectorStoreManager()
    ingestion_pipeline = IngestionPipeline(
        vector_store_manager=vector_store_manager,
        use_smart_chunking=True
    )
    
    # Create a test HTML document with a table
    test_html = """
    <html>
    <body>
        <h1>Travel Allowances</h1>
        <p>This document describes the various travel allowances.</p>
        
        <h2>Incidental Expense Allowance</h2>
        <p>The incidental expense allowance is paid as a daily flat rate based on location.</p>
        
        <h3>Appendix C - Domestic Rates</h3>
        <table>
            <tr>
                <th>Location</th>
                <th>Daily Rate</th>
                <th>Monthly Rate</th>
            </tr>
            <tr>
                <td>Ottawa</td>
                <td>$17.30</td>
                <td>$519.00</td>
            </tr>
            <tr>
                <td>Toronto</td>
                <td>$17.30</td>
                <td>$519.00</td>
            </tr>
            <tr>
                <td>Vancouver</td>
                <td>$17.30</td>
                <td>$519.00</td>
            </tr>
            <tr>
                <td>Remote Areas</td>
                <td>$21.55</td>
                <td>$646.50</td>
            </tr>
        </table>
        
        <h3>Appendix D - International Rates</h3>
        <table>
            <tr>
                <th>Country</th>
                <th>City</th>
                <th>Daily Rate (USD)</th>
            </tr>
            <tr>
                <td>USA</td>
                <td>Washington DC</td>
                <td>$25.00</td>
            </tr>
            <tr>
                <td>USA</td>
                <td>New York</td>
                <td>$28.00</td>
            </tr>
            <tr>
                <td>UK</td>
                <td>London</td>
                <td>$30.00</td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    # Save to a temporary file
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as f:
        f.write(test_html)
        temp_path = f.name
    
    try:
        # Ingest the test document
        request = DocumentIngestionRequest(
            url=f"file://{temp_path}",
            type=DocumentType.WEB,
            metadata={"test": True}
        )
        
        response = await ingestion_pipeline.ingest_document(request)
        print(f"\nIngested test document: {response.status}")
        print(f"Chunks created: {response.chunks_created}")
        
    finally:
        import os
        os.unlink(temp_path)


async def main():
    """Run all tests."""
    # First ingest a test table
    print("\nIngesting test table document...")
    await ingest_test_table()
    
    # Then test retrieval
    await test_table_queries()


if __name__ == "__main__":
    asyncio.run(main())