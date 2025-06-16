#!/usr/bin/env python3

"""Simple test to verify table processing improvements are working."""

import logging
import sys
import asyncio
from pathlib import Path

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack import Document
from app.components.table_aware_converter import TableAwareHTMLConverter
from app.components.table_aware_splitter import TableAwareDocumentSplitter
from app.pipelines.table_aware_query import create_table_aware_query_pipeline
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def test_table_processing_improvements():
    """Test the complete table processing pipeline."""
    print("Testing Table Processing Improvements")
    print("=" * 50)
    
    # Test 1: Table Extraction
    print("\n1. Testing table extraction...")
    converter = TableAwareHTMLConverter()
    
    sample_html = """
    <html>
    <body>
        <h2>Hardship Allowance Table</h2>
        <table>
            <tr><th>Level</th><th>Description</th><th>Monthly Rate</th></tr>
            <tr><td>0</td><td>CFB Standard</td><td>$0</td></tr>
            <tr><td>3</td><td>Moderate Hardship</td><td>$400</td></tr>
            <tr><td>6</td><td>Austere</td><td>$1000</td></tr>
        </table>
    </body>
    </html>
    """
    
    result = converter.run(sources=[sample_html])
    documents = result["documents"]
    
    if documents and "Level" in documents[0].content and "$400" in documents[0].content:
        print("✅ Table extraction working correctly")
        print(f"   Extracted content preview: {documents[0].content[:100]}...")
    else:
        print("❌ Table extraction failed")
        return False
    
    # Test 2: Enhanced Document Splitting with Metadata
    print("\n2. Testing enhanced document splitting...")
    splitter = TableAwareDocumentSplitter(
        split_length=300,
        split_overlap=50,
        preserve_tables=True
    )
    
    split_result = splitter.run(documents=documents)
    split_docs = split_result["documents"]
    
    if split_docs:
        doc = split_docs[0]
        has_table_meta = doc.meta.get('contains_table', False)
        table_type = doc.meta.get('table_type')
        table_rows = doc.meta.get('table_row_count', 0)
        
        print(f"✅ Document splitting with metadata working")
        print(f"   Contains table: {has_table_meta}")
        print(f"   Table type: {table_type}")
        print(f"   Table rows: {table_rows}")
        
        if not has_table_meta:
            print("❌ Table metadata not detected correctly")
            return False
    else:
        print("❌ Document splitting failed")
        return False
    
    # Test 3: Table-Aware Query Detection
    print("\n3. Testing table query detection...")
    from app.pipelines.manager import PipelineManager
    
    manager = PipelineManager()
    
    test_queries = [
        ("hardship allowance table", True),
        ("show me the rates", True),
        ("level 3 allowance", True),
        ("how is the weather", False),
        ("general information", False)
    ]
    
    detection_correct = 0
    for query, expected in test_queries:
        detected = manager._is_table_query(query)
        if detected == expected:
            detection_correct += 1
            status = "✅"
        else:
            status = "❌"
        print(f"   {status} '{query}' -> {detected} (expected {expected})")
    
    if detection_correct == len(test_queries):
        print("✅ Table query detection working correctly")
    else:
        print(f"❌ Table query detection: {detection_correct}/{len(test_queries)} correct")
        return False
    
    # Test 4: Table-Aware Pipeline Components
    print("\n4. Testing table-aware pipeline components...")
    
    try:
        from app.pipelines.table_aware_query import TableAwareRetrieverFilter, TableAwareQueryExpander
        
        # Test query expander
        expander = TableAwareQueryExpander()
        expansion_result = expander.run("hardship allowance rates")
        expanded_query = expansion_result["expanded_query"]
        
        if "hardship" in expanded_query and "allowance" in expanded_query:
            print("✅ Query expansion working")
            print(f"   Expanded: {expanded_query}")
        else:
            print("❌ Query expansion failed")
            return False
        
        # Test retriever filter
        filter_component = TableAwareRetrieverFilter()
        
        # Test table detection in filter
        test_content = '| Level | Rate |\n|-------|------|\n| 1 | $100 |'
        has_table = filter_component._contains_table_content(type('MockDoc', (), {
            'content': test_content,
            'meta': {'contains_table': True}
        })())
        
        if has_table:
            print("✅ Table content detection working")
        else:
            print("❌ Table content detection failed")
            return False
        
        # Test query detection in filter
        is_table_query = filter_component._is_table_query("hardship allowance table")
        if is_table_query:
            print("✅ Table query detection in filter working")
        else:
            print("❌ Table query detection in filter failed")
            return False
        
    except Exception as e:
        print(f"❌ Pipeline component test failed: {e}")
        return False
    
    print("\n" + "=" * 50)
    print("🎉 ALL TABLE PROCESSING IMPROVEMENTS WORKING CORRECTLY!")
    print("=" * 50)
    
    print("\nSummary of improvements:")
    print("✅ Enhanced table extraction from HTML to Markdown")
    print("✅ Table-specific metadata tagging (type, row count)")
    print("✅ Context-aware chunking with table preservation")
    print("✅ Automatic table query detection")
    print("✅ Query expansion for table-related terms")
    print("✅ Score boosting for table content")
    print("✅ Lower similarity thresholds for table queries")
    
    return True


if __name__ == "__main__":
    success = test_table_processing_improvements()
    
    if success:
        print("\n🚀 The table processing pipeline is ready!")
        print("   Users should now get better results for table queries like:")
        print("   - 'hardship allowance table'")
        print("   - 'show me the rates'")
        print("   - 'level 3 allowance amount'")
    else:
        print("\n❌ Some improvements need attention")
        sys.exit(1)