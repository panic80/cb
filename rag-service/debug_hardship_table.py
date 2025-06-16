#!/usr/bin/env python3

"""Debug script specifically for hardship allowance table extraction."""

import logging
import sys
import os
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from app.pipelines.indexing import create_url_indexing_pipeline
from app.pipelines.query import create_query_pipeline
from app.components.table_aware_converter import TableAwareHTMLConverter
from app.core.config import settings

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_hardship_table_extraction():
    """Test hardship allowance table extraction specifically."""
    
    print("=" * 80)
    print("DEBUGGING HARDSHIP ALLOWANCE TABLE EXTRACTION")
    print("=" * 80)
    
    # Create document store
    document_store = InMemoryDocumentStore()
    
    # Create indexing pipeline
    print("\n1. Creating indexing pipeline...")
    indexing_pipeline = create_url_indexing_pipeline(
        document_store=document_store,
        enable_crawling=False  # Start with single page
    )
    
    # Test URLs that might contain hardship allowance tables
    test_urls = [
        # Add URLs here that you know contain hardship allowance tables
        # These would be specific to your domain
    ]
    
    # If no URLs provided, let's test the table extraction component directly
    print("\n2. Testing TableAwareHTMLConverter component...")
    converter = TableAwareHTMLConverter()
    
    # Test with sample HTML containing a table (simulating hardship allowance structure)
    sample_html = """
    <html>
    <body>
        <h2>Hardship Allowance Table</h2>
        <table id="hardship-allowance">
            <tr>
                <th>Level</th>
                <th>Description</th>
                <th>Monthly Rate</th>
            </tr>
            <tr>
                <td>0</td>
                <td>CFB Standard</td>
                <td>$0</td>
            </tr>
            <tr>
                <td>1</td>
                <td>Minor Hardship</td>
                <td>$100</td>
            </tr>
            <tr>
                <td>2</td>
                <td>Low Hardship</td>
                <td>$200</td>
            </tr>
            <tr>
                <td>3</td>
                <td>Moderate Hardship</td>
                <td>$400</td>
            </tr>
            <tr>
                <td>4</td>
                <td>High Hardship</td>
                <td>$600</td>
            </tr>
            <tr>
                <td>5</td>
                <td>Severe Hardship</td>
                <td>$800</td>
            </tr>
            <tr>
                <td>6</td>
                <td>Austere</td>
                <td>$1000</td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    # Test the converter
    result = converter.run(sources=[sample_html])
    documents = result["documents"]
    
    print(f"\n3. Converter extracted {len(documents)} documents")
    
    if documents:
        doc = documents[0]
        print(f"\nDocument content preview:")
        print("-" * 40)
        print(doc.content[:1000])
        print("-" * 40)
        
        # Check if table content is preserved
        if "Level" in doc.content and "Monthly Rate" in doc.content:
            print("✅ Table headers found in extracted content")
        else:
            print("❌ Table headers NOT found in extracted content")
            
        if "$100" in doc.content or "$200" in doc.content:
            print("✅ Table data (monetary values) found in extracted content")
        else:
            print("❌ Table data NOT found in extracted content")
    
    # Now test the full pipeline
    print("\n4. Testing full indexing pipeline...")
    
    try:
        # Index the sample content
        result = indexing_pipeline.run({
            "fetcher": {
                "urls": ["data:text/html;charset=utf-8," + sample_html]
            }
        })
        
        writer_result = result.get("writer", {})
        doc_count = writer_result.get("documents_written", 0)
        print(f"Documents indexed: {doc_count}")
        
        # Test querying
        print("\n5. Testing query pipeline...")
        query_pipeline = create_query_pipeline(document_store)
        
        # Test queries related to hardship allowance
        test_queries = [
            "hardship allowance table",
            "hardship allowance rates",
            "level 3 hardship allowance",
            "austere hardship allowance",
            "monthly hardship allowance amounts"
        ]
        
        for query in test_queries:
            print(f"\nQuery: '{query}'")
            try:
                query_result = query_pipeline.run({
                    "text_embedder": {"text": query},
                    "prompt_builder": {"query": query}
                })
                
                # Check if relevant documents were retrieved
                retriever_result = query_result.get("retriever", {})
                documents = retriever_result.get("documents", [])
                
                print(f"  Retrieved {len(documents)} documents")
                
                if documents:
                    # Check document relevance
                    for i, doc in enumerate(documents[:2]):  # Check top 2
                        score = doc.score if hasattr(doc, 'score') else 'N/A'
                        preview = doc.content[:200].replace('\n', ' ')
                        print(f"  Doc {i+1} (score: {score}): {preview}...")
                        
                        # Check if the document contains table content
                        if any(term in doc.content.lower() for term in ['level', 'hardship', 'allowance', '$']):
                            print(f"    ✅ Contains relevant hardship allowance content")
                        else:
                            print(f"    ❌ Does not contain relevant content")
                else:
                    print("  ❌ No documents retrieved")
                    
            except Exception as e:
                print(f"  Error running query: {e}")
                
    except Exception as e:
        print(f"Error in pipeline test: {e}")
        import traceback
        traceback.print_exc()

def analyze_document_store():
    """Analyze what's currently in the document store."""
    
    print("\n" + "=" * 80)
    print("ANALYZING CURRENT DOCUMENT STORE")
    print("=" * 80)
    
    # This would require connecting to your actual document store
    # For now, let's check if we can find any existing hardship allowance content
    
    try:
        # You would need to provide actual connection details here
        from haystack.document_stores.elasticsearch import ElasticsearchDocumentStore
        
        # Example - you'd need to adjust connection parameters
        # document_store = ElasticsearchDocumentStore(
        #     host="localhost",
        #     port=9200,
        #     index="documents"
        # )
        
        print("Would need actual document store connection to analyze existing content")
        
    except Exception as e:
        print(f"Cannot connect to document store: {e}")

if __name__ == "__main__":
    test_hardship_table_extraction()
    # analyze_document_store()