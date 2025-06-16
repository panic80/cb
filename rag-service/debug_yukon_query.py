#!/usr/bin/env python3

"""Debug script to test query pipeline retrieval of Yukon lunch data."""

import asyncio
import logging
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from app.core.config import settings
from app.pipelines.query import create_query_pipeline
from app.pipelines.enhanced_query import create_enhanced_query_pipeline
from app.pipelines.hybrid_query import create_hybrid_query_pipeline

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def test_yukon_retrieval():
    """Test retrieval of Yukon lunch data."""
    
    print("Testing Yukon data retrieval...")
    
    # Create pgvector document store
    document_store = PgvectorDocumentStore(
        connection_string=Secret.from_token(settings.DATABASE_URL),
        table_name="documents",
        embedding_dimension=3072,
        vector_function="cosine_similarity",
        recreate_table=False,
        search_strategy="exact_search"
    )
    
    # Test queries
    test_queries = [
        "What is the lunch rate in Yukon?",
        "Yukon lunch rate",
        "lunch rate Yukon",
        "$37.00 lunch",
        "meal rates Yukon"
    ]
    
    print(f"\nDocument count in store: {document_store.count_documents()}")
    
    # Test 1: Direct document search
    print("\n=== TEST 1: Direct Document Search ===")
    # PgVector doesn't support content filtering, let's get all docs and filter manually
    all_docs = document_store.filter_documents()
    yukon_docs = [doc for doc in all_docs if "Yukon" in doc.content or "yukon" in doc.content.lower()]
    print(f"Found {len(yukon_docs)} documents containing 'Yukon' out of {len(all_docs)} total")
    
    for i, doc in enumerate(yukon_docs[:5]):
        print(f"\nDocument {i+1}:")
        print(f"Content preview: {doc.content[:200]}...")
        print(f"Score: {getattr(doc, 'score', 'N/A')}")
        print(f"Meta: {doc.meta}")
    
    # Test 2: Query pipeline with different configurations
    print("\n=== TEST 2: Query Pipeline Tests ===")
    
    # Create different pipeline configurations
    pipelines = {
        "standard": create_query_pipeline(document_store),
        "enhanced": create_enhanced_query_pipeline(
            document_store,
            enable_query_expansion=True,
            enable_source_filtering=False,  # Disable source filtering
            enable_diversity_ranking=False  # Disable diversity ranking
        ),
        "hybrid": create_hybrid_query_pipeline(document_store)
    }
    
    for query in test_queries:
        print(f"\n--- Testing query: '{query}' ---")
        
        for pipeline_name, pipeline in pipelines.items():
            print(f"\n{pipeline_name.upper()} Pipeline:")
            
            try:
                # Prepare inputs based on pipeline type
                if pipeline_name == "standard":
                    inputs = {
                        "embedder": {"text": query},
                        "prompt_builder": {
                            "question": query,
                            "conversation_history": []
                        }
                    }
                elif pipeline_name == "enhanced":
                    inputs = {
                        "query_expander": {"query": query},
                        "prompt_builder": {
                            "question": query,
                            "conversation_history": []
                        }
                    }
                else:  # hybrid
                    inputs = {
                        "embedder": {"text": query},
                        "prompt_builder": {
                            "question": query,
                            "conversation_history": []
                        }
                    }
                
                # Run pipeline
                result = pipeline.run(inputs)
                
                # Check retrieved documents
                # Find where documents are in the pipeline result
                retrieved_docs = None
                
                # Try different component outputs
                for component in ["retriever", "score_filter", "similarity_ranker", "diversity_ranker"]:
                    if component in result and "documents" in result[component]:
                        retrieved_docs = result[component]["documents"]
                        print(f"Found documents in {component}: {len(retrieved_docs)} docs")
                        break
                
                if retrieved_docs:
                    print(f"Retrieved {len(retrieved_docs)} documents")
                    
                    # Check if any contain Yukon data
                    yukon_found = False
                    for doc in retrieved_docs[:10]:  # Check top 10
                        if "Yukon" in doc.content or "yukon" in doc.content.lower():
                            yukon_found = True
                            print(f"✓ Found Yukon content! Score: {getattr(doc, 'score', 'N/A')}")
                            print(f"  Preview: {doc.content[:150]}...")
                            break
                    
                    if not yukon_found:
                        print("✗ No Yukon content in retrieved documents")
                        # Show what was retrieved instead
                        print("Top 3 retrieved documents:")
                        for i, doc in enumerate(retrieved_docs[:3]):
                            print(f"  {i+1}. Score: {getattr(doc, 'score', 'N/A')}")
                            print(f"     Content: {doc.content[:100]}...")
                else:
                    print("✗ No documents found in pipeline result")
                
                # Check final answer
                answer = result.get("answer_builder", {}).get("answer", "")
                if "Yukon" in answer or "$37" in answer or "$27.75" in answer or "$18.50" in answer:
                    print(f"✓ Answer contains Yukon data!")
                else:
                    print(f"✗ Answer doesn't mention Yukon rates")
                print(f"Answer preview: {answer[:200]}...")
                
            except Exception as e:
                print(f"Error: {e}")
                import traceback
                traceback.print_exc()
    
    # Test 3: Check retrieval parameters
    print("\n=== TEST 3: Configuration Analysis ===")
    print(f"TOP_K_RETRIEVAL: {settings.TOP_K_RETRIEVAL}")
    print(f"TOP_K_RERANKING: {settings.TOP_K_RERANKING}")
    print(f"Score filter threshold: 0.05")
    print(f"Initial retrieval multiplier: 3x (retrieves {settings.TOP_K_RETRIEVAL * 3} docs)")
    
    # Test 4: Direct embedding retrieval
    print("\n=== TEST 4: Direct Embedding Search ===")
    from haystack.components.embedders import OpenAITextEmbedder
    
    embedder = OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    )
    
    # Get embedding for test query
    embedding_result = embedder.run(text="What is the lunch rate in Yukon?")
    query_embedding = embedding_result["embedding"]
    
    # Direct similarity search
    from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever
    retriever = PgvectorEmbeddingRetriever(
        document_store=document_store,
        top_k=50  # Get more results to analyze
    )
    
    retrieval_result = retriever.run(query_embedding=query_embedding)
    docs = retrieval_result["documents"]
    
    print(f"Direct retrieval got {len(docs)} documents")
    
    # Analyze scores and content
    yukon_positions = []
    for i, doc in enumerate(docs):
        if "Yukon" in doc.content or "yukon" in doc.content.lower():
            yukon_positions.append(i+1)
            print(f"Yukon content at position {i+1} with score {doc.score}")
            print(f"Content preview: {doc.content[:150]}...")
    
    if yukon_positions:
        print(f"\nYukon data found at positions: {yukon_positions}")
    else:
        print("\nNo Yukon data found in top 50 results!")

if __name__ == "__main__":
    asyncio.run(test_yukon_retrieval())