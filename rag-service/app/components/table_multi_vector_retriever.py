"""
Multi-vector retriever specifically optimized for table data.

This retriever stores table summaries for semantic search while maintaining
full table data for accurate value retrieval.
"""

from typing import List, Optional, Dict, Any, Tuple
import logging
import json
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain.storage import InMemoryStore
from langchain_core.language_models import BaseLLM
from langchain_core.prompts import ChatPromptTemplate
from pydantic import Field

logger = logging.getLogger(__name__)


class TableMultiVectorRetriever(BaseRetriever):
    """
    Specialized retriever for tables that:
    1. Stores table summaries in vector store for semantic search
    2. Stores full table data in docstore for accurate retrieval
    3. Creates multiple search representations per table
    """
    
    vectorstore: Any = Field(
        description="Vector store for table summaries and search representations"
    )
    docstore: Any = Field(
        default_factory=InMemoryStore,
        description="Document store for full table data"
    )
    llm: Optional[BaseLLM] = Field(
        default=None,
        description="LLM for generating table summaries"
    )
    search_kwargs: Dict[str, Any] = Field(
        default_factory=lambda: {"k": 10},
        description="Keyword arguments for search"
    )
    id_key: str = Field(
        default="doc_id",
        description="Key in metadata for document ID"
    )
    
    def create_table_summary(self, table_doc: Document) -> str:
        """Create a semantic summary of a table for better retrieval."""
        if not self.llm:
            # Simple fallback without LLM
            content = table_doc.page_content
            section = table_doc.metadata.get("section", "Unknown section")
            return f"Table in section '{section}' containing data with values and rates"
        
        # Use LLM to generate rich summary
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert at summarizing tables for search. Create a natural language summary that describes what information this table contains, what values it provides, and what questions it can answer."),
            ("human", "Table content:\n{table_content}\n\nSection: {section}\n\nCreate a search-optimized summary:")
        ])
        
        try:
            messages = prompt.format_messages(
                table_content=table_doc.page_content[:1000],  # Limit for context
                section=table_doc.metadata.get("section", "Unknown")
            )
            response = self.llm.invoke(messages)
            return response.content
        except Exception as e:
            logger.warning(f"Failed to generate LLM summary: {e}")
            return f"Table in section '{table_doc.metadata.get('section', 'Unknown')}' containing data"
    
    def add_tables(self, table_documents: List[Document]) -> List[str]:
        """Add table documents with multi-vector approach."""
        doc_ids = []
        
        for table_doc in table_documents:
            # Generate unique ID for the table
            table_id = table_doc.metadata.get("id", f"table_{len(doc_ids)}")
            doc_ids.append(table_id)
            
            # Store full table in docstore
            self.docstore.mset([(table_id, table_doc)])
            
            # Create multiple search representations
            search_docs = []
            
            # 1. Table summary for semantic search
            summary = self.create_table_summary(table_doc)
            search_docs.append(Document(
                page_content=summary,
                metadata={
                    **table_doc.metadata,
                    self.id_key: table_id,
                    "search_type": "summary"
                }
            ))
            
            # 2. If it's a key-value representation, add that too
            if table_doc.metadata.get("content_type") == "table_key_value":
                search_docs.append(Document(
                    page_content=table_doc.page_content,
                    metadata={
                        **table_doc.metadata,
                        self.id_key: table_id,
                        "search_type": "key_value"
                    }
                ))
            
            # 3. Add section + table type for navigation queries
            section = table_doc.metadata.get("section", "")
            if section:
                nav_content = f"{section} - Table containing rates, values, and allowances"
                search_docs.append(Document(
                    page_content=nav_content,
                    metadata={
                        **table_doc.metadata,
                        self.id_key: table_id,
                        "search_type": "navigation"
                    }
                ))
            
            # Add all search representations to vector store
            self.vectorstore.add_documents(search_docs)
            
        logger.info(f"Added {len(table_documents)} tables with multi-vector representations")
        return doc_ids
    
    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """Get relevant tables by searching summaries then retrieving full data."""
        # Search for relevant table summaries
        search_results = self.vectorstore.similarity_search(
            query,
            **self.search_kwargs
        )
        
        # Extract unique table IDs
        table_ids = []
        seen_ids = set()
        
        for doc in search_results:
            table_id = doc.metadata.get(self.id_key)
            if table_id and table_id not in seen_ids:
                seen_ids.add(table_id)
                table_ids.append(table_id)
        
        # Retrieve full table documents from docstore
        full_tables = []
        for table_id in table_ids:
            table_docs = self.docstore.mget([table_id])
            if table_docs and table_docs[0]:
                full_tables.append(table_docs[0])
        
        # Sort by relevance score if available
        # For now, maintain order from search results
        
        logger.info(f"Retrieved {len(full_tables)} full tables for query: {query}")
        
        return full_tables
    
    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: Optional[CallbackManagerForRetrieverRun] = None,
    ) -> List[Document]:
        """Async version of document retrieval."""
        # For now, fall back to sync version
        return self._get_relevant_documents(query, run_manager=run_manager)


def detect_value_query(query: str) -> bool:
    """Detect if a query is asking for specific values."""
    value_indicators = [
        "rate", "amount", "cost", "price", "value", "how much",
        "what is", "allowance", "per diem", "reimbursement",
        "$", "dollar", "percent", "%", "fee", "charge"
    ]
    
    query_lower = query.lower()
    return any(indicator in query_lower for indicator in value_indicators)


def enhance_query_for_tables(query: str) -> List[str]:
    """Enhance query with table-specific terms for better retrieval."""
    enhanced_queries = [query]  # Always include original
    
    query_lower = query.lower()
    
    # Add context about tables and appendices
    if "incidental" in query_lower:
        enhanced_queries.extend([
            f"{query} Appendix C domestic",
            f"{query} Appendix D international",
            f"{query} daily flat rate table"
        ])
    
    if "meal" in query_lower or "breakfast" in query_lower or "lunch" in query_lower or "dinner" in query_lower:
        enhanced_queries.extend([
            f"{query} meal allowance table",
            f"{query} per meal rates"
        ])
    
    if any(term in query_lower for term in ["rate", "amount", "allowance"]):
        enhanced_queries.append(f"{query} table values dollar amounts")
    
    # Remove duplicates while preserving order
    seen = set()
    unique_queries = []
    for q in enhanced_queries:
        if q not in seen:
            seen.add(q)
            unique_queries.append(q)
    
    return unique_queries