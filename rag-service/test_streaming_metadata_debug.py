"""Debug script to trace metadata through the streaming pipeline."""

import asyncio
import json
from datetime import datetime
from app.core.config import settings
from app.core.vectorstore import VectorStoreManager
from app.core.langchain_config import LangChainConfig
from app.pipelines.parallel_retrieval import create_parallel_pipeline
from app.api.chat import get_llm
from app.models.query import Provider
from app.components.result_processor import StreamingResultProcessor

async def test_metadata_flow():
    """Test metadata preservation through the streaming pipeline."""
    
    # Initialize LangChain configuration first
    LangChainConfig.initialize()
    print("LangChain configuration initialized")
    
    # Initialize components
    print("Initializing components...")
    vector_store_manager = VectorStoreManager()
    
    # Initialize the vector store properly
    await vector_store_manager.initialize()
    print("Vector store initialized")
    
    # Get LLM
    llm_wrapper = get_llm(Provider.OPENAI, "gpt-4o-mini")
    
    # Create retrieval pipeline
    print("\nCreating retrieval pipeline...")
    retrieval_pipeline = create_parallel_pipeline(
        vector_store_manager=vector_store_manager,
        llm=llm_wrapper
    )
    
    # Test query
    query = "What are the meal rates for Yukon?"
    
    # Step 1: Direct retrieval
    print(f"\n1. Testing direct retrieval for: '{query}'")
    results = await retrieval_pipeline.retrieve(
        query=query,
        k=5
    )
    
    print(f"\nRetrieved {len(results)} results")
    for i, (doc, score) in enumerate(results[:3]):
        print(f"\n  Result {i+1}:")
        print(f"    Score: {score}")
        print(f"    Metadata keys: {list(doc.metadata.keys())}")
        print(f"    Source: {doc.metadata.get('source', 'NOT FOUND')}")
        print(f"    Content preview: {doc.page_content[:100]}...")
    
    # Step 2: Test result processor
    print("\n\n2. Testing StreamingResultProcessor...")
    result_processor = StreamingResultProcessor()
    
    # Extract just documents
    documents = [doc for doc, _ in results]
    
    # Process through streaming processor
    processed_docs = []
    async for doc in result_processor.process_results_stream(
        documents=documents,
        query=query
    ):
        processed_docs.append(doc)
    
    print(f"\nProcessed {len(processed_docs)} documents")
    for i, doc in enumerate(processed_docs[:3]):
        print(f"\n  Processed Doc {i+1}:")
        print(f"    Metadata keys: {list(doc.metadata.keys())}")
        print(f"    Source: {doc.metadata.get('source', 'NOT FOUND')}")
        print(f"    Citation: {doc.metadata.get('citation', 'NOT FOUND')}")
    
    # Step 3: Simulate the exact flow in streaming_chat.py
    print("\n\n3. Simulating streaming_chat.py flow...")
    
    # This is what happens in streaming_chat.py
    processed_results = [(doc, doc.metadata.get('score', 0.0)) for doc in processed_docs]
    
    sources = []
    for i, (doc, score) in enumerate(processed_results[:3]):
        # This is the exact code from streaming_chat.py
        url = doc.metadata.get("source") or doc.metadata.get("url") or doc.metadata.get("file_path", "Unknown")
        title = doc.metadata.get("title") or doc.metadata.get("filename") or url
        
        print(f"\n  Building source {i+1}:")
        print(f"    Raw metadata: {doc.metadata}")
        print(f"    Extracted URL: {url}")
        print(f"    Extracted title: {title}")
        
        source = {
            "id": doc.metadata.get("id", f"source_{i}"),
            "text": doc.page_content[:200],
            "title": title,
            "url": url,
            "section": doc.metadata.get("section"),
            "page": doc.metadata.get("page_number"),
            "score": score,
            "metadata": doc.metadata
        }
        sources.append(source)
    
    print("\n\nFinal sources JSON:")
    print(json.dumps(sources, indent=2))

if __name__ == "__main__":
    asyncio.run(test_metadata_flow())