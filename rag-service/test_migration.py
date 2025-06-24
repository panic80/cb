#!/usr/bin/env python
"""
Test script to verify the LangChain migration components work correctly.
"""

import asyncio
from pathlib import Path
import sys

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

from app.pipelines.loaders import LangChainDocumentLoader
from app.pipelines.splitters import LangChainTextSplitter
from app.pipelines.smart_splitters import SmartDocumentSplitter
from app.models.documents import DocumentType
from app.core.logging import get_logger

logger = get_logger(__name__)


async def test_langchain_components():
    """Test all LangChain components."""
    
    print("\n" + "="*50)
    print("TESTING LANGCHAIN COMPONENTS")
    print("="*50)
    
    # Test 1: Document Loader
    print("\n1. Testing LangChainDocumentLoader...")
    try:
        loader = LangChainDocumentLoader()
        
        # Create test file
        test_file = Path("test_data/test_migration.txt")
        test_file.parent.mkdir(exist_ok=True)
        test_file.write_text("""
# Test Document

This is a test document for verifying LangChain migration.

## Section 1

This section contains some important information about travel regulations.

## Section 2

This section contains details about meal allowances and rates.

### Subsection 2.1

- Item 1: $50 per day
- Item 2: $75 per day
- Item 3: $100 per day

## Conclusion

This document demonstrates text splitting capabilities.
        """)
        
        docs = await loader.load_from_file(str(test_file))
        print(f"✓ Loaded {len(docs)} documents")
        if docs:
            print(f"  Document length: {len(docs[0].page_content)} characters")
            print(f"  Metadata: {docs[0].metadata}")
        
    except Exception as e:
        print(f"✗ Loader test failed: {e}")
        return False
        
    # Test 2: Text Splitter
    print("\n2. Testing LangChainTextSplitter...")
    chunks = []  # Initialize chunks
    try:
        splitter = LangChainTextSplitter()
        
        if docs:
            chunks = splitter.split_documents(docs)
            print(f"✓ Created {len(chunks)} chunks")
            
            # Show chunk statistics
            chunk_sizes = [len(chunk.page_content) for chunk in chunks]
            print(f"  Chunk sizes: min={min(chunk_sizes)}, max={max(chunk_sizes)}, avg={sum(chunk_sizes)//len(chunk_sizes)}")
            
            # Show first chunk
            if chunks:
                print(f"  First chunk preview: {chunks[0].page_content[:100]}...")
                
    except Exception as e:
        print(f"✗ Splitter test failed: {e}")
        return False
        
    # Test 3: Smart Splitter
    print("\n3. Testing SmartDocumentSplitter...")
    try:
        smart_splitter = SmartDocumentSplitter()
        
        if docs:
            smart_chunks = smart_splitter.split_by_type(docs, DocumentType.TEXT)
            print(f"✓ Created {len(smart_chunks)} smart chunks")
            
            # Compare with regular splitter
            print(f"  Smart splitting created {len(smart_chunks) - len(chunks)} different chunks than regular splitting")
            
    except Exception as e:
        print(f"✗ Smart splitter test failed: {e}")
        return False
        
    # Test 4: Different file types
    print("\n4. Testing multiple file types...")
    test_files = {
        "markdown": ("test_data/test.md", "# Markdown Test\n\nThis is a **markdown** file."),
        "csv": ("test_data/test.csv", "Location,Rate,Type\nOttawa,50,Meal\nToronto,75,Meal"),
        "text": ("test_data/test.txt", "This is a plain text file for testing.")
    }
    
    for file_type, (file_path, content) in test_files.items():
        try:
            test_path = Path(file_path)
            test_path.parent.mkdir(exist_ok=True)
            test_path.write_text(content)
            
            docs = await loader.load_from_file(str(test_path))
            if docs:
                print(f"✓ {file_type.upper()}: Loaded {len(docs)} documents")
            else:
                print(f"✗ {file_type.upper()}: No documents loaded")
                
        except Exception as e:
            print(f"✗ {file_type.upper()} test failed: {e}")
            
    print("\n" + "="*50)
    print("All tests completed!")
    return True


async def main():
    """Run all tests."""
    success = await test_langchain_components()
    
    if success:
        print("\n✓ All LangChain components are working correctly!")
        print("You can now run the migration script: python migrate_to_langchain.py")
    else:
        print("\n✗ Some tests failed. Please check the errors above.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())