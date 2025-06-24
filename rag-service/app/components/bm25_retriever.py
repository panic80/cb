"""
BM25 Retriever component for keyword-based retrieval.

This module provides a BM25 retriever that extends LangChain's BM25Retriever
with additional features for the travel domain.
"""

from typing import List, Dict, Any, Optional
import logging

from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_community.retrievers import BM25Retriever as LangChainBM25Retriever
from pydantic import Field

from app.components.base import BaseComponent
from app.core.logging import get_logger

logger = get_logger(__name__)


class TravelBM25Retriever(BaseRetriever, BaseComponent):
    """
    BM25 retriever optimized for travel documents.
    
    Extends LangChain's BM25Retriever with:
    - Travel-specific preprocessing
    - Performance monitoring
    - Async support
    """
    
    bm25_retriever: LangChainBM25Retriever = Field(description="Underlying BM25 retriever")
    k: int = Field(default=10, description="Number of documents to retrieve")
    preprocess_query: bool = Field(default=True, description="Whether to preprocess queries")
    
    class Config:
        """Configuration for this pydantic object."""
        arbitrary_types_allowed = True
    
    def __init__(
        self,
        documents: List[Document],
        k: int = 10,
        preprocess_query: bool = True,
        **kwargs
    ):
        """
        Initialize the BM25 retriever.
        
        Args:
            documents: List of documents to index
            k: Number of documents to retrieve
            preprocess_query: Whether to preprocess queries
        """
        # Initialize BaseComponent
        BaseComponent.__init__(self, component_type="retriever", component_name="bm25")
        
        # Create underlying BM25 retriever
        bm25_retriever = LangChainBM25Retriever.from_documents(documents, k=k)
        
        # Initialize BaseRetriever with fields
        super().__init__(
            bm25_retriever=bm25_retriever,
            k=k,
            preprocess_query=preprocess_query,
            **kwargs
        )
        
        logger.info(f"Initialized BM25 retriever with {len(documents)} documents")
    
    def _preprocess_query(self, query: str) -> str:
        """
        Preprocess query for better BM25 matching.
        
        Args:
            query: Original query
            
        Returns:
            Preprocessed query
        """
        # Add travel-specific synonyms and expansions
        query_lower = query.lower()
        
        # Expand abbreviations
        abbreviations = {
            "pmv": "private motor vehicle",
            "td": "temporary duty",
            "tdy": "temporary duty",
            "cf": "canadian forces",
            "caf": "canadian armed forces",
            "per diem": "daily allowance",
            "km": "kilometer kilometre",
            "govt": "government",
            "accom": "accommodation",
            "trans": "transportation"
        }
        
        expanded_query = query
        for abbr, expansion in abbreviations.items():
            if abbr in query_lower:
                expanded_query += f" {expansion}"
        
        # Add keyword variations for common searches
        if "rate" in query_lower or "allowance" in query_lower:
            expanded_query += " table amount dollar per day daily"
        
        if "meal" in query_lower:
            expanded_query += " breakfast lunch dinner food"
        
        if "travel" in query_lower:
            expanded_query += " trip journey transportation"
        
        return expanded_query
    
    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """
        Get relevant documents using BM25.
        
        Args:
            query: Search query
            run_manager: Callback manager
            
        Returns:
            List of relevant documents
        """
        # Preprocess query if enabled
        if self.preprocess_query:
            processed_query = self._preprocess_query(query)
            logger.debug(f"Expanded query: '{query}' -> '{processed_query}'")
        else:
            processed_query = query
        
        # Get documents from underlying BM25 retriever
        docs = self.bm25_retriever.get_relevant_documents(
            processed_query,
            callbacks=run_manager.get_child() if run_manager else None
        )
        
        # Log retrieval
        self._log_event("retrieve", {
            "query": query,
            "processed_query": processed_query,
            "num_results": len(docs),
            "method": "bm25"
        })
        
        return docs[:self.k]
    
    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """
        Async get relevant documents.
        
        BM25 is synchronous, so we just wrap the sync call.
        """
        import asyncio
        return await asyncio.to_thread(
            self._get_relevant_documents,
            query,
            run_manager=run_manager
        )
    
    def update_documents(self, documents: List[Document]):
        """
        Update the BM25 index with new documents.
        
        Args:
            documents: New list of documents
        """
        # Recreate the BM25 retriever with new documents
        self.bm25_retriever = LangChainBM25Retriever.from_documents(
            documents, 
            k=self.k
        )
        
        logger.info(f"Updated BM25 index with {len(documents)} documents")
        
        self._log_event("update_index", {
            "num_documents": len(documents)
        })