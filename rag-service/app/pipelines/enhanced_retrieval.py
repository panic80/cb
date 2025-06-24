"""Enhanced retrieval pipeline using LangGraph for orchestrated workflows."""
import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from enum import Enum

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langgraph.graph import StateGraph, END
from langgraph.graph.state import State
from langchain_community.chat_models import ChatOpenAI

from app.core.logging import logger
from app.core.config import settings
from app.services.cache import CacheService
from app.components.ensemble_retriever import EnsembleRetriever
from app.components.contextual_compressor import ContextualCompressor
from app.components.reranker import Reranker
from app.components.result_processor import ResultProcessor
from app.components.table_query_rewriter import TableQueryRewriter
from app.services.llm_pool import LLMPool


class QueryType(str, Enum):
    """Types of queries for routing."""
    SIMPLE = "simple"
    TABLE = "table"
    COMPLEX = "complex"
    MULTI_HOP = "multi_hop"
    COMPARISON = "comparison"


class RetrievalState(State):
    """State for the retrieval workflow."""
    query: str
    query_type: Optional[QueryType]
    expanded_queries: List[str]
    retrieved_documents: List[Document]
    compressed_documents: List[Document]
    reranked_documents: List[Document]
    synthesized_answer: Optional[str]
    sources: List[Dict[str, Any]]
    conversation_history: List[Dict[str, str]]
    error: Optional[str]
    metadata: Dict[str, Any]


class EnhancedRetrievalPipeline:
    """Advanced retrieval pipeline with LangGraph orchestration."""
    
    def __init__(
        self,
        retriever: EnsembleRetriever,
        compressor: ContextualCompressor,
        reranker: Reranker,
        processor: ResultProcessor,
        table_rewriter: TableQueryRewriter,
        cache_service: Optional[CacheService] = None,
        llm_pool: Optional[LLMPool] = None
    ):
        self.retriever = retriever
        self.compressor = compressor
        self.reranker = reranker
        self.processor = processor
        self.table_rewriter = table_rewriter
        self.cache_service = cache_service
        self.llm_pool = llm_pool or LLMPool()
        
        # Build the workflow graph
        self.workflow = self._build_workflow()
        
        # Query classifier
        self.query_classifier = self._create_query_classifier()
        
        # Query expander for multi-hop queries
        self.query_expander = self._create_query_expander()
        
        # Answer synthesizer
        self.answer_synthesizer = self._create_answer_synthesizer()
    
    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow."""
        workflow = StateGraph(RetrievalState)
        
        # Add nodes
        workflow.add_node("understand_query", self._understand_query)
        workflow.add_node("expand_query", self._expand_query)
        workflow.add_node("retrieve_documents", self._retrieve_documents)
        workflow.add_node("compress_documents", self._compress_documents)
        workflow.add_node("rerank_documents", self._rerank_documents)
        workflow.add_node("synthesize_answer", self._synthesize_answer)
        workflow.add_node("fallback_retrieval", self._fallback_retrieval)
        workflow.add_node("handle_error", self._handle_error)
        
        # Add edges with conditional routing
        workflow.add_edge("understand_query", self._route_by_query_type)
        workflow.add_edge("expand_query", "retrieve_documents")
        workflow.add_edge("retrieve_documents", self._check_retrieval_quality)
        workflow.add_edge("compress_documents", "rerank_documents")
        workflow.add_edge("rerank_documents", "synthesize_answer")
        workflow.add_edge("fallback_retrieval", "compress_documents")
        workflow.add_edge("synthesize_answer", END)
        workflow.add_edge("handle_error", END)
        
        # Set entry point
        workflow.set_entry_point("understand_query")
        
        return workflow.compile()
    
    def _create_query_classifier(self) -> ChatPromptTemplate:
        """Create query classification prompt."""
        return ChatPromptTemplate.from_messages([
            ("system", """Classify the user query into one of these types:
            - simple: Basic factual questions
            - table: Questions about rates, allowances, or tabular data
            - complex: Questions requiring multiple sources
            - multi_hop: Questions requiring reasoning across documents
            - comparison: Questions comparing different scenarios
            
            Return JSON: {"type": "<type>", "reasoning": "<brief explanation>"}"""),
            ("human", "{query}")
        ])
    
    def _create_query_expander(self) -> ChatPromptTemplate:
        """Create query expansion prompt."""
        return ChatPromptTemplate.from_messages([
            ("system", """Break down this complex query into simpler sub-queries.
            Each sub-query should target specific information needed.
            
            Return JSON: {"sub_queries": ["query1", "query2", ...]}"""),
            ("human", "Query: {query}\nType: {query_type}")
        ])
    
    def _create_answer_synthesizer(self) -> ChatPromptTemplate:
        """Create answer synthesis prompt."""
        return ChatPromptTemplate.from_messages([
            ("system", """Synthesize a comprehensive answer from the retrieved documents.
            Be precise and cite sources using [Source: filename] format.
            
            Context documents:
            {context}"""),
            ("human", "Query: {query}")
        ])
    
    async def _understand_query(self, state: RetrievalState) -> RetrievalState:
        """Understand and classify the query."""
        try:
            llm = await self.llm_pool.acquire_llm("openai", "gpt-4o-mini")
            chain = self.query_classifier | llm | JsonOutputParser()
            
            result = await chain.ainvoke({"query": state.query})
            
            state.query_type = QueryType(result["type"])
            state.metadata["classification"] = result
            
            logger.info(f"Query classified as: {state.query_type}")
            
        except Exception as e:
            logger.error(f"Query classification failed: {e}")
            state.query_type = QueryType.SIMPLE
            
        return state
    
    async def _expand_query(self, state: RetrievalState) -> RetrievalState:
        """Expand complex queries into sub-queries."""
        try:
            if state.query_type in [QueryType.MULTI_HOP, QueryType.COMPLEX]:
                llm = await self.llm_pool.acquire_llm("openai", "gpt-4o-mini")
                chain = self.query_expander | llm | JsonOutputParser()
                
                result = await chain.ainvoke({
                    "query": state.query,
                    "query_type": state.query_type
                })
                
                state.expanded_queries = result["sub_queries"]
                logger.info(f"Expanded query into {len(state.expanded_queries)} sub-queries")
            else:
                state.expanded_queries = [state.query]
                
        except Exception as e:
            logger.error(f"Query expansion failed: {e}")
            state.expanded_queries = [state.query]
            
        return state
    
    async def _retrieve_documents(self, state: RetrievalState) -> RetrievalState:
        """Retrieve documents for all queries."""
        try:
            all_docs = []
            
            # Handle table queries specially
            if state.query_type == QueryType.TABLE:
                rewritten = await self.table_rewriter.rewrite_query(state.query)
                if rewritten != state.query:
                    state.expanded_queries.append(rewritten)
            
            # Retrieve for each query
            for query in state.expanded_queries:
                # Check cache first
                if self.cache_service:
                    cached = await self.cache_service.get(f"retrieval:{query}")
                    if cached:
                        all_docs.extend(cached)
                        continue
                
                # Retrieve documents
                docs = await self.retriever.aretrieve(query)
                all_docs.extend(docs)
                
                # Cache results
                if self.cache_service and docs:
                    await self.cache_service.set(
                        f"retrieval:{query}", 
                        docs, 
                        ttl=300
                    )
            
            # Deduplicate
            seen = set()
            unique_docs = []
            for doc in all_docs:
                doc_id = doc.metadata.get("source", "") + doc.page_content[:100]
                if doc_id not in seen:
                    seen.add(doc_id)
                    unique_docs.append(doc)
            
            state.retrieved_documents = unique_docs
            logger.info(f"Retrieved {len(unique_docs)} unique documents")
            
        except Exception as e:
            logger.error(f"Document retrieval failed: {e}")
            state.error = str(e)
            
        return state
    
    async def _compress_documents(self, state: RetrievalState) -> RetrievalState:
        """Compress documents to relevant passages."""
        try:
            compressed = await self.compressor.compress_documents(
                state.retrieved_documents,
                state.query
            )
            
            state.compressed_documents = compressed
            logger.info(f"Compressed to {len(compressed)} documents")
            
        except Exception as e:
            logger.error(f"Document compression failed: {e}")
            state.compressed_documents = state.retrieved_documents
            
        return state
    
    async def _rerank_documents(self, state: RetrievalState) -> RetrievalState:
        """Rerank documents for relevance."""
        try:
            reranked = await self.reranker.rerank_documents(
                state.compressed_documents,
                state.query
            )
            
            # Keep top documents based on query type
            max_docs = {
                QueryType.SIMPLE: 3,
                QueryType.TABLE: 5,
                QueryType.COMPLEX: 7,
                QueryType.MULTI_HOP: 10,
                QueryType.COMPARISON: 8
            }
            
            limit = max_docs.get(state.query_type, 5)
            state.reranked_documents = reranked[:limit]
            
            logger.info(f"Reranked to top {len(state.reranked_documents)} documents")
            
        except Exception as e:
            logger.error(f"Document reranking failed: {e}")
            state.reranked_documents = state.compressed_documents[:5]
            
        return state
    
    async def _synthesize_answer(self, state: RetrievalState) -> RetrievalState:
        """Synthesize final answer from documents."""
        try:
            # Format context
            context = "\n\n".join([
                f"[Source: {doc.metadata.get('source', 'Unknown')}]\n{doc.page_content}"
                for doc in state.reranked_documents
            ])
            
            # Get appropriate LLM based on query complexity
            model = "gpt-4o" if state.query_type in [QueryType.COMPLEX, QueryType.MULTI_HOP] else "gpt-4o-mini"
            llm = await self.llm_pool.acquire_llm("openai", model)
            
            chain = self.answer_synthesizer | llm
            
            response = await chain.ainvoke({
                "context": context,
                "query": state.query
            })
            
            state.synthesized_answer = response.content
            
            # Extract sources
            state.sources = [
                {
                    "source": doc.metadata.get("source", "Unknown"),
                    "title": doc.metadata.get("title", ""),
                    "page": doc.metadata.get("page", 0),
                    "relevance_score": doc.metadata.get("relevance_score", 0.0)
                }
                for doc in state.reranked_documents
            ]
            
            logger.info("Answer synthesized successfully")
            
        except Exception as e:
            logger.error(f"Answer synthesis failed: {e}")
            state.error = str(e)
            
        return state
    
    async def _fallback_retrieval(self, state: RetrievalState) -> RetrievalState:
        """Fallback retrieval strategy for poor results."""
        try:
            logger.info("Attempting fallback retrieval")
            
            # Try broader search
            broader_query = f"{state.query} travel instructions policy"
            docs = await self.retriever.aretrieve(broader_query)
            
            # Combine with original results
            all_docs = state.retrieved_documents + docs
            
            # Deduplicate
            seen = set()
            unique_docs = []
            for doc in all_docs:
                doc_id = doc.metadata.get("source", "") + doc.page_content[:100]
                if doc_id not in seen:
                    seen.add(doc_id)
                    unique_docs.append(doc)
            
            state.retrieved_documents = unique_docs
            logger.info(f"Fallback retrieval added {len(docs)} documents")
            
        except Exception as e:
            logger.error(f"Fallback retrieval failed: {e}")
            
        return state
    
    async def _handle_error(self, state: RetrievalState) -> RetrievalState:
        """Handle errors gracefully."""
        logger.error(f"Workflow error: {state.error}")
        
        if not state.synthesized_answer:
            state.synthesized_answer = (
                "I apologize, but I encountered an error while processing your query. "
                "Please try rephrasing your question or contact support if the issue persists."
            )
        
        return state
    
    def _route_by_query_type(self, state: RetrievalState) -> str:
        """Route based on query type."""
        if state.query_type in [QueryType.MULTI_HOP, QueryType.COMPLEX]:
            return "expand_query"
        return "retrieve_documents"
    
    def _check_retrieval_quality(self, state: RetrievalState) -> str:
        """Check retrieval quality and route accordingly."""
        if state.error:
            return "handle_error"
        
        if not state.retrieved_documents:
            return "fallback_retrieval"
        
        # Check quality threshold
        min_docs = {
            QueryType.SIMPLE: 1,
            QueryType.TABLE: 2,
            QueryType.COMPLEX: 3,
            QueryType.MULTI_HOP: 5,
            QueryType.COMPARISON: 4
        }
        
        required = min_docs.get(state.query_type, 2)
        if len(state.retrieved_documents) < required:
            return "fallback_retrieval"
        
        return "compress_documents"
    
    async def retrieve(
        self, 
        query: str,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """Execute the enhanced retrieval workflow."""
        start_time = time.time()
        
        # Initialize state
        initial_state = RetrievalState(
            query=query,
            query_type=None,
            expanded_queries=[],
            retrieved_documents=[],
            compressed_documents=[],
            reranked_documents=[],
            synthesized_answer=None,
            sources=[],
            conversation_history=conversation_history or [],
            error=None,
            metadata={}
        )
        
        try:
            # Run workflow
            final_state = await self.workflow.ainvoke(initial_state)
            
            # Process results
            result = {
                "answer": final_state.synthesized_answer,
                "sources": final_state.sources,
                "query_type": final_state.query_type.value if final_state.query_type else "unknown",
                "metadata": {
                    **final_state.metadata,
                    "retrieval_time": time.time() - start_time,
                    "num_documents": len(final_state.reranked_documents),
                    "expanded_queries": final_state.expanded_queries
                }
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Enhanced retrieval failed: {e}", exc_info=True)
            return {
                "answer": "I apologize, but I couldn't process your query. Please try again.",
                "sources": [],
                "error": str(e),
                "metadata": {
                    "retrieval_time": time.time() - start_time,
                    "error_type": type(e).__name__
                }
            }