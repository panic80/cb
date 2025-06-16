import logging
from typing import List, Dict, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor

from haystack import component, Document
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.retrievers import InMemoryBM25Retriever
from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever
from haystack.components.joiners import DocumentJoiner

logger = logging.getLogger(__name__)


@component
class HybridPgVectorBM25Retriever:
    """
    A hybrid retriever that combines PgVector embedding search with in-memory BM25 search.
    Maintains an in-memory BM25 index that is synchronized with the PgVector store.
    """
    
    def __init__(
        self,
        pgvector_store,
        top_k: int = 10,
        bm25_weight: float = 0.3,
        embedding_weight: float = 0.7,
        refresh_interval: int = 3600  # Refresh BM25 index every hour
    ):
        """
        Initialize the hybrid retriever.
        
        Args:
            pgvector_store: The PgVector document store
            top_k: Number of documents to retrieve
            bm25_weight: Weight for BM25 scores in fusion
            embedding_weight: Weight for embedding scores in fusion
            refresh_interval: How often to refresh the BM25 index (seconds)
        """
        self.pgvector_store = pgvector_store
        self.top_k = top_k
        self.bm25_weight = bm25_weight
        self.embedding_weight = embedding_weight
        self.refresh_interval = refresh_interval
        
        # Initialize in-memory store for BM25
        self.bm25_store = InMemoryDocumentStore()
        self.bm25_retriever = None
        self.pgvector_retriever = PgvectorEmbeddingRetriever(
            document_store=pgvector_store,
            top_k=top_k * 2  # Get more for fusion
        )
        self.joiner = DocumentJoiner(
            join_mode="reciprocal_rank_fusion",
            top_k=top_k,
            weights=[bm25_weight, embedding_weight]
        )
        
        # Initialize BM25 index
        self._initialize_bm25_index()
        
        logger.info(f"Initialized HybridPgVectorBM25Retriever with weights BM25:{bm25_weight}, Embedding:{embedding_weight}")
    
    def _initialize_bm25_index(self):
        """Initialize or refresh the BM25 index from PgVector store."""
        try:
            # Get all documents from PgVector store
            all_docs = self._get_all_pgvector_documents()
            
            if all_docs:
                # Clear existing BM25 store and add all documents
                self.bm25_store.delete_documents(self.bm25_store.filter_documents())
                self.bm25_store.write_documents(all_docs)
                
                # Create BM25 retriever
                self.bm25_retriever = InMemoryBM25Retriever(
                    document_store=self.bm25_store,
                    top_k=self.top_k * 2  # Get more for fusion
                )
                
                logger.info(f"BM25 index initialized with {len(all_docs)} documents")
            else:
                logger.warning("No documents found in PgVector store for BM25 indexing")
                self.bm25_retriever = None
                
        except Exception as e:
            logger.error(f"Failed to initialize BM25 index: {e}")
            self.bm25_retriever = None
    
    def _get_all_pgvector_documents(self) -> List[Document]:
        """Retrieve all documents from PgVector store."""
        try:
            # Use the filter_documents method to get all documents
            documents = self.pgvector_store.filter_documents()
            logger.debug(f"Retrieved {len(documents)} documents from PgVector")
            return documents
            
        except Exception as e:
            logger.error(f"Failed to retrieve documents from PgVector: {e}")
            return []
    
    @component.output_types(documents=List[Document])
    def run(
        self,
        query: str,
        query_embedding: List[float],
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, List[Document]]:
        """
        Retrieve documents using hybrid BM25 + embedding search.
        
        Args:
            query: The search query text
            query_embedding: The query embedding vector
            filters: Optional filters for retrieval
            
        Returns:
            Dictionary with retrieved documents
        """
        try:
            documents = []
            
            # 1. Get embedding-based results from PgVector
            embedding_docs = []
            try:
                embedding_result = self.pgvector_retriever.run(
                    query_embedding=query_embedding,
                    filters=filters
                )
                embedding_docs = embedding_result.get("documents", [])
                logger.debug(f"PgVector retrieval found {len(embedding_docs)} documents")
            except Exception as e:
                logger.error(f"PgVector retrieval failed: {e}")
            
            # 2. Get BM25 results if available
            bm25_docs = []
            if self.bm25_retriever:
                try:
                    bm25_result = self.bm25_retriever.run(query=query)
                    bm25_docs = bm25_result.get("documents", [])
                    logger.debug(f"BM25 retrieval found {len(bm25_docs)} documents")
                except Exception as e:
                    logger.error(f"BM25 retrieval failed: {e}")
            
            # 3. Combine results using document joiner
            if embedding_docs and bm25_docs:
                # Use joiner for fusion
                joined_result = self.joiner.run(documents=[bm25_docs, embedding_docs])
                documents = joined_result.get("documents", [])
                logger.debug(f"Hybrid fusion produced {len(documents)} documents")
            elif embedding_docs:
                # Fall back to embedding-only results
                documents = embedding_docs[:self.top_k]
                logger.debug(f"Using embedding-only results: {len(documents)} documents")
            elif bm25_docs:
                # Fall back to BM25-only results
                documents = bm25_docs[:self.top_k]
                logger.debug(f"Using BM25-only results: {len(documents)} documents")
            
            return {"documents": documents}
            
        except Exception as e:
            logger.error(f"Hybrid retrieval failed: {e}")
            return {"documents": []}
    
    def refresh_bm25_index(self):
        """Manually refresh the BM25 index."""
        logger.info("Refreshing BM25 index...")
        self._initialize_bm25_index()