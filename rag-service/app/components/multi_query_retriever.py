"""
Multi-query retriever using LangChain's native implementation.

This retriever generates multiple queries from a user input to improve
retrieval coverage, especially for specific value queries.
"""

from typing import List, Optional, Set, Any
import logging
from functools import lru_cache

from langchain_core.language_models import BaseLLM
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain.retrievers.multi_query import MultiQueryRetriever as LangChainMultiQueryRetriever
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import BaseOutputParser
from pydantic import Field

from app.services.cache import cache_result
from app.core.logging import get_logger

logger = get_logger(__name__)


class LineListOutputParser(BaseOutputParser[List[str]]):
    """Parse output as a list of lines."""
    
    def parse(self, text: str) -> List[str]:
        """Parse output text into a list of queries."""
        lines = text.strip().split("\n")
        # Filter out empty lines and clean up
        queries = []
        for line in lines:
            cleaned = line.strip()
            # Remove list markers like "1.", "2.", "-", "*"
            cleaned = cleaned.lstrip("0123456789.-*) ")
            if cleaned:
                queries.append(cleaned)
        return queries
    
    @property
    def _type(self) -> str:
        """Return the type of parser."""
        return "line_list"


# Domain-specific prompt for travel instruction queries
TRAVEL_QUERY_PROMPT = PromptTemplate(
    input_variables=["question"],
    template="""You are an AI assistant helping to search Canadian Forces travel instructions.
Your task is to generate different versions of the given user question to retrieve relevant 
documents from a vector database. Focus on travel-specific terminology and values.

Original question: {question}

Generate 5 different versions of the question that:
1. Focus on specific values, rates, or amounts mentioned
2. Use alternative travel terminology (e.g., per diem, allowance, reimbursement)
3. Include relevant context (domestic, international, military)
4. Break down compound questions into focused parts
5. Consider both general policies and specific rates

Generate one query per line:"""
)


class MultiQueryRetriever(LangChainMultiQueryRetriever):
    """
    Enhanced multi-query retriever with caching and travel-specific prompts.
    
    Extends LangChain's MultiQueryRetriever with:
    - Query caching to avoid regenerating queries
    - Domain-specific prompt templates
    - Performance monitoring
    - Deduplication improvements
    """
    
    # Cache configuration (not as Pydantic fields to avoid conflicts)
    _use_query_cache: bool = True
    _cache_ttl: int = 3600
    
    def __init__(
        self,
        retriever,
        llm: BaseLLM,
        parser_key: Optional[str] = None,
        include_original: bool = True,
        use_query_cache: bool = True,
        cache_ttl: int = 3600,
        **kwargs
    ):
        """Initialize with travel-specific configuration."""
        # Set up parser
        if "parser" not in kwargs:
            kwargs["parser"] = LineListOutputParser()
        
        # Use travel-specific prompt if not provided
        if "prompt" not in kwargs:
            kwargs["prompt"] = TRAVEL_QUERY_PROMPT
        
        # Initialize parent MultiQueryRetriever
        super().__init__(
            retriever=retriever,
            llm=llm,
            parser_key=parser_key,
            include_original=include_original,
            **kwargs
        )
        
        # Set cache configuration as instance attributes
        self._use_query_cache = use_query_cache
        self._cache_ttl = cache_ttl
    
    @cache_result(ttl=3600, key_prefix="multi_query")
    async def _generate_queries_cached(self, question: str) -> List[str]:
        """Generate queries with caching."""
        # Use parent's query generation
        queries = await self.agenerate_queries(question)
        
        # Log generated queries
        logger.info(f"Generated {len(queries)} queries for: {question[:50]}...")
        logger.debug(f"Generated queries: {queries[:3]}")
        
        return queries
    
    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """
        Async retrieval with query caching and deduplication.
        """
        # Generate queries (with caching if enabled)
        if self._use_query_cache:
            queries = await self._generate_queries_cached(query)
        else:
            queries = await self.agenerate_queries(query)
        
        # Include original if configured
        if self.include_original and query not in queries:
            queries = [query] + queries
        
        # Retrieve documents for all queries
        all_docs = []
        seen_content = set()
        seen_ids = set()
        
        for q in queries:
            try:
                # Get documents for this query
                docs = await self.retriever.aget_relevant_documents(
                    q, 
                    callbacks=run_manager.get_child() if run_manager else None
                )
                
                # Deduplicate by content hash and ID
                for doc in docs:
                    # Check document ID
                    doc_id = doc.metadata.get("id")
                    if doc_id and doc_id in seen_ids:
                        continue
                    
                    # Check content hash for exact duplicates
                    content_hash = hash(doc.page_content)
                    if content_hash in seen_content:
                        continue
                    
                    # Add to results
                    seen_content.add(content_hash)
                    if doc_id:
                        seen_ids.add(doc_id)
                    
                    # Add query info to metadata
                    doc.metadata["multi_query_source"] = q
                    all_docs.append(doc)
                    
            except Exception as e:
                logger.error(f"Failed to retrieve for query '{q}': {e}")
                continue
        
        # Log retrieval summary
        logger.info(
            f"Multi-query retrieval completed - "
            f"Queries: {len(queries)}, Docs: {len(all_docs)}"
        )
        
        return all_docs
    
    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """
        Sync retrieval with query caching and deduplication.
        """
        # For sync version, use parent's implementation but add our deduplication
        queries = self.generate_queries(query)
        
        if self.include_original and query not in queries:
            queries = [query] + queries
        
        # Retrieve and deduplicate
        all_docs = []
        seen_content = set()
        seen_ids = set()
        
        for q in queries:
            try:
                docs = self.retriever.get_relevant_documents(
                    q,
                    callbacks=run_manager.get_child() if run_manager else None
                )
                
                for doc in docs:
                    # Deduplication logic
                    doc_id = doc.metadata.get("id")
                    if doc_id and doc_id in seen_ids:
                        continue
                    
                    content_hash = hash(doc.page_content)
                    if content_hash in seen_content:
                        continue
                    
                    seen_content.add(content_hash)
                    if doc_id:
                        seen_ids.add(doc_id)
                    
                    doc.metadata["multi_query_source"] = q
                    all_docs.append(doc)
                    
            except Exception as e:
                logger.error(f"Failed to retrieve for query '{q}': {e}")
                continue
        
        return all_docs


def create_travel_multi_query_retriever(
    base_retriever,
    llm: BaseLLM,
    include_original: bool = True,
    **kwargs
) -> MultiQueryRetriever:
    """
    Factory function to create a travel-optimized multi-query retriever.
    
    Args:
        base_retriever: The base retriever to use
        llm: Language model for query generation
        include_original: Whether to include the original query
        **kwargs: Additional configuration
        
    Returns:
        Configured MultiQueryRetriever
    """
    return MultiQueryRetriever(
        retriever=base_retriever,
        llm=llm,
        prompt=TRAVEL_QUERY_PROMPT,
        parser=LineListOutputParser(),
        include_original=include_original,
        **kwargs
    )