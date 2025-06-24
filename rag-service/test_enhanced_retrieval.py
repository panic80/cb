#!/usr/bin/env python3
"""
Test script for enhanced retrieval pipeline.

This script tests:
1. Individual retrievers (Ensemble, Multi-Query, Contextual Compression, Self-Query)
2. Retriever chain performance
3. Comparison with existing implementation
"""

import asyncio
import time
from typing import List, Dict, Any
import logging
from pprint import pprint

from langchain_core.documents import Document
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma

from app.core.config import Settings
from app.core.vectorstore import VectorStoreManager
from app.components.ensemble_retriever import ContentBoostedEnsembleRetriever
from app.components.multi_query_retriever import TravelMultiQueryRetriever
from app.components.contextual_compressor import TravelContextualCompressor
from app.components.self_query_retriever import TravelSelfQueryRetriever
from app.pipelines.improved_retrieval import ImprovedRetrievalPipeline
from app.pipelines.retriever_factory import (
    HybridRetrieverFactory, 
    RetrieverConfig, 
    RetrieverMode
)
from app.components.reranker import RerankerFactory, RerankerType

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class RetrievalTester:
    """Test harness for retrieval components."""
    
    def __init__(self):
        """Initialize test environment."""
        self.settings = Settings()
        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.0,
            openai_api_key=self.settings.OPENAI_API_KEY
        )
        self.embeddings = OpenAIEmbeddings(
            openai_api_key=self.settings.OPENAI_API_KEY
        )
        self.vector_store_manager = None
        self.test_queries = [
            # Value-specific queries
            "What is the meal allowance rate for breakfast in Yukon?",
            "How much is the incidental expense allowance per day?",
            "What are the kilometric rates for PMV?",
            
            # Policy queries
            "When is a member entitled to meal allowances?",
            "What are the rules for private vehicle usage?",
            "How are travel expenses calculated?",
            
            # Structured queries
            "Show me all policies effective after 2023",
            "Find directives about accommodation in Ontario",
            "What meal rates apply in Quebec?",
            
            # Complex queries
            "If I'm traveling to Yukon for 35 days, what are my meal and incidental allowances?",
            "Compare accommodation options for government vs commercial lodging",
            "What documentation is required for expense claims?"
        ]
    
    async def setup(self):
        """Set up test environment."""
        logger.info("Setting up test environment...")
        
        # Initialize vector store
        self.vector_store_manager = VectorStoreManager(
            embeddings=self.embeddings,
            collection_name="test_enhanced_retrieval"
        )
        await self.vector_store_manager.initialize()
        
        # Check if we have documents
        count = await self._get_document_count()
        logger.info(f"Vector store has {count} documents")
        
        if count == 0:
            logger.warning("No documents in vector store. Please run ingestion first.")
            return False
        
        return True
    
    async def _get_document_count(self) -> int:
        """Get document count from vector store."""
        try:
            # For Chroma
            collection = self.vector_store_manager.vector_store._collection
            return collection.count()
        except:
            return 0
    
    async def test_individual_retrievers(self):
        """Test each retriever individually."""
        logger.info("\n=== Testing Individual Retrievers ===\n")
        
        # 1. Test Ensemble Retriever
        logger.info("1. Testing Content-Boosted Ensemble Retriever")
        await self._test_ensemble_retriever()
        
        # 2. Test Multi-Query Retriever
        logger.info("\n2. Testing Travel Multi-Query Retriever")
        await self._test_multi_query_retriever()
        
        # 3. Test Contextual Compression
        logger.info("\n3. Testing Travel Contextual Compressor")
        await self._test_contextual_compressor()
        
        # 4. Test Self-Query Retriever
        logger.info("\n4. Testing Travel Self-Query Retriever")
        await self._test_self_query_retriever()
    
    async def _test_ensemble_retriever(self):
        """Test ensemble retriever with content boosting."""
        # Create base retrievers
        vector_retriever = self.vector_store_manager.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 10}
        )
        
        mmr_retriever = self.vector_store_manager.vector_store.as_retriever(
            search_type="mmr",
            search_kwargs={"k": 10, "lambda_mult": 0.5}
        )
        
        # Create ensemble
        ensemble = ContentBoostedEnsembleRetriever(
            retrievers=[vector_retriever, mmr_retriever],
            weights=[0.6, 0.4],
            k=5
        )
        
        # Test with value query
        query = "What is the meal allowance rate for breakfast in Yukon?"
        docs = await ensemble.aget_relevant_documents(query)
        
        logger.info(f"Query: {query}")
        logger.info(f"Found {len(docs)} documents")
        
        for i, doc in enumerate(docs[:3]):
            logger.info(f"\nDoc {i+1}:")
            logger.info(f"Source: {doc.metadata.get('source', 'Unknown')}")
            logger.info(f"Content preview: {doc.page_content[:200]}...")
            
            # Check if dollar amounts are present
            if "$" in doc.page_content:
                logger.info("✓ Contains dollar amounts")
    
    async def _test_multi_query_retriever(self):
        """Test multi-query retriever."""
        # Create base retriever
        base_retriever = self.vector_store_manager.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 10}
        )
        
        # Create multi-query retriever
        multi_query = TravelMultiQueryRetriever(
            base_retriever=base_retriever,
            llm=self.llm,
            include_original=True
        )
        
        # Test with ambiguous query
        query = "travel expenses"
        docs = await multi_query.aget_relevant_documents(query)
        
        logger.info(f"Query: {query}")
        logger.info(f"Found {len(docs)} documents")
        
        # Show generated queries (if logged)
        logger.info("Multi-query should have generated variations like:")
        logger.info("- What are the travel expense policies?")
        logger.info("- How to claim travel expenses?")
        logger.info("- Travel expense rates and allowances")
    
    async def _test_contextual_compressor(self):
        """Test contextual compression."""
        # Create base retriever
        base_retriever = self.vector_store_manager.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 10}
        )
        
        # Create compressor
        compressor = TravelContextualCompressor(
            llm=self.llm,
            embeddings=self.embeddings,
            compression_mode="hybrid"
        )
        
        # Create compressed retriever
        compressed_retriever = compressor.compress_documents(
            base_retriever=base_retriever
        )
        
        # Test with specific query
        query = "incidental expense allowance 75% reduction"
        docs = await compressed_retriever.aget_relevant_documents(query)
        
        logger.info(f"Query: {query}")
        logger.info(f"Compressed from 10 to {len(docs)} documents")
        
        for i, doc in enumerate(docs):
            logger.info(f"\nDoc {i+1}:")
            logger.info(f"Content: {doc.page_content[:300]}...")
    
    async def _test_self_query_retriever(self):
        """Test self-query retriever."""
        try:
            # Create self-query retriever
            self_query = TravelSelfQueryRetriever(
                vectorstore=self.vector_store_manager.vector_store,
                llm=self.llm,
                document_contents="Canadian Forces travel instructions"
            )
            
            # Test with structured query
            query = "Find all meal allowance policies from 2024 for Ontario"
            docs = await self_query.aget_relevant_documents(query)
            
            logger.info(f"Query: {query}")
            logger.info(f"Found {len(docs)} documents")
            
            for i, doc in enumerate(docs[:3]):
                logger.info(f"\nDoc {i+1}:")
                logger.info(f"Metadata: {doc.metadata}")
                
        except Exception as e:
            logger.warning(f"Self-query test failed: {e}")
            logger.info("This is expected if metadata schema doesn't match")
    
    async def test_retriever_chain(self):
        """Test the full retriever chain."""
        logger.info("\n=== Testing Retriever Chain ===\n")
        
        # Create improved retrieval pipeline
        pipeline = ImprovedRetrievalPipeline(
            vector_store_manager=self.vector_store_manager,
            llm=self.llm,
            use_multi_query=True,
            use_compression=True,
            use_smart_chunking=False,  # Not implemented yet
            use_self_query=True
        )
        
        # Test with various queries
        for query in self.test_queries[:3]:
            logger.info(f"\nQuery: {query}")
            
            start_time = time.time()
            results = await pipeline.retrieve(query, k=5)
            elapsed = time.time() - start_time
            
            logger.info(f"Retrieved {len(results)} documents in {elapsed:.2f}s")
            
            if results:
                doc, score = results[0]
                logger.info(f"Top result:")
                logger.info(f"  Source: {doc.metadata.get('source', 'Unknown')}")
                logger.info(f"  Score: {score:.3f}")
                logger.info(f"  Content: {doc.page_content[:200]}...")
    
    async def test_retriever_factory(self):
        """Test retriever factory patterns."""
        logger.info("\n=== Testing Retriever Factory ===\n")
        
        # Get all documents for BM25
        all_docs = await self._get_all_documents()
        
        # Create factory
        factory = HybridRetrieverFactory(
            vectorstore=self.vector_store_manager.vector_store,
            llm=self.llm,
            embeddings=self.embeddings,
            all_documents=all_docs
        )
        
        # Test different modes
        modes = [
            (RetrieverMode.SIMPLE, "Simple Vector Search"),
            (RetrieverMode.HYBRID, "Hybrid (Vector + BM25)"),
            (RetrieverMode.ADVANCED, "Advanced Multi-Stage")
        ]
        
        query = "What is the meal allowance rate for breakfast?"
        
        for mode, description in modes:
            logger.info(f"\nTesting {description}")
            
            config = RetrieverConfig(mode=mode, k=5)
            retriever = factory.create_retriever(config)
            
            start_time = time.time()
            docs = await retriever.aget_relevant_documents(query)
            elapsed = time.time() - start_time
            
            logger.info(f"Found {len(docs)} documents in {elapsed:.2f}s")
            
            if docs:
                logger.info(f"Top result: {docs[0].page_content[:100]}...")
        
        # Show profiling data
        profiling = factory.get_profiling_data()
        logger.info(f"\nProfiler data: {profiling}")
    
    async def _get_all_documents(self) -> List[Document]:
        """Get all documents from vector store."""
        try:
            # For Chroma
            collection = self.vector_store_manager.vector_store._collection
            results = collection.get(include=["documents", "metadatas"])
            
            documents = []
            if results and results['documents']:
                for i, content in enumerate(results['documents']):
                    metadata = results['metadatas'][i] if results['metadatas'] else {}
                    doc = Document(
                        page_content=content,
                        metadata=metadata
                    )
                    documents.append(doc)
            
            return documents
        except Exception as e:
            logger.error(f"Failed to get all documents: {e}")
            return []
    
    async def test_reranking(self):
        """Test reranking capabilities."""
        logger.info("\n=== Testing Reranking ===\n")
        
        # Create base retriever
        base_retriever = self.vector_store_manager.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 20}  # Get more for reranking
        )
        
        # Test LLM reranker (since it doesn't require additional dependencies)
        try:
            reranking_retriever = RerankerFactory.create_reranking_retriever(
                base_retriever=base_retriever,
                reranker_type=RerankerType.LLM,
                top_k=5,
                llm=self.llm,
                batch_size=5
            )
            
            query = "What is the incidental expense allowance rate?"
            
            # Compare with and without reranking
            logger.info("Without reranking:")
            docs_base = await base_retriever.aget_relevant_documents(query)
            for i, doc in enumerate(docs_base[:5]):
                logger.info(f"{i+1}. {doc.page_content[:100]}...")
            
            logger.info("\nWith LLM reranking:")
            docs_reranked = await reranking_retriever.aget_relevant_documents(query)
            for i, doc in enumerate(docs_reranked):
                logger.info(f"{i+1}. {doc.page_content[:100]}...")
                
        except Exception as e:
            logger.warning(f"Reranking test failed: {e}")
    
    async def compare_with_existing(self):
        """Compare results with existing implementation."""
        logger.info("\n=== Comparing with Existing Implementation ===\n")
        
        # This would compare with the old implementation
        # For now, just show performance metrics
        
        queries_to_test = [
            "What is the meal allowance rate for breakfast in Yukon?",
            "incidental expense allowance per day",
            "kilometric rates for private vehicle"
        ]
        
        pipeline = ImprovedRetrievalPipeline(
            vector_store_manager=self.vector_store_manager,
            llm=self.llm
        )
        
        total_time = 0
        total_docs = 0
        
        for query in queries_to_test:
            start_time = time.time()
            results = await pipeline.retrieve(query, k=5)
            elapsed = time.time() - start_time
            
            total_time += elapsed
            total_docs += len(results)
            
            logger.info(f"Query: {query}")
            logger.info(f"  Time: {elapsed:.2f}s")
            logger.info(f"  Docs: {len(results)}")
            
            # Check if we found relevant values
            if results:
                doc = results[0][0]
                has_values = "$" in doc.page_content or "rate" in doc.page_content.lower()
                logger.info(f"  Contains values: {has_values}")
        
        avg_time = total_time / len(queries_to_test)
        avg_docs = total_docs / len(queries_to_test)
        
        logger.info(f"\nSummary:")
        logger.info(f"  Average query time: {avg_time:.2f}s")
        logger.info(f"  Average docs returned: {avg_docs:.1f}")
    
    async def run_all_tests(self):
        """Run all tests."""
        if not await self.setup():
            logger.error("Setup failed. Exiting.")
            return
        
        try:
            # Test individual components
            await self.test_individual_retrievers()
            
            # Test retriever chain
            await self.test_retriever_chain()
            
            # Test factory patterns
            await self.test_retriever_factory()
            
            # Test reranking
            await self.test_reranking()
            
            # Compare with existing
            await self.compare_with_existing()
            
            logger.info("\n=== All Tests Completed ===")
            
        except Exception as e:
            logger.error(f"Test failed: {e}", exc_info=True)


async def main():
    """Main test runner."""
    tester = RetrievalTester()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())