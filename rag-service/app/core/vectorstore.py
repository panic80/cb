"""Vector store management for RAG service."""

import os
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor

from langchain_core.documents import Document as LangchainDocument
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_community.vectorstores import VectorStore
from langchain_core.retrievers import BaseRetriever
from langchain_community.vectorstores.utils import filter_complex_metadata

from app.core.config import settings
from app.core.logging import get_logger
from app.models.documents import Document, DocumentMetadata

logger = get_logger(__name__)


class VectorStoreManager:
    """Manages vector store operations."""
    
    def __init__(self):
        """Initialize vector store manager."""
        self.embeddings: Optional[Embeddings] = None
        self.vector_store: Optional[VectorStore] = None
        self.executor = ThreadPoolExecutor(max_workers=settings.parallel_embedding_workers)
        
    async def initialize(self) -> None:
        """Initialize embeddings and vector store."""
        try:
            # Initialize embeddings
            self.embeddings = self._create_embeddings()
            logger.info("Embeddings initialized")
            
            # Initialize vector store
            self.vector_store = self._create_vector_store()
            logger.info(f"Vector store initialized: {settings.vector_store_type}")
            
        except Exception as e:
            logger.error(f"Failed to initialize vector store: {e}")
            raise
            
    def _create_embeddings(self) -> Embeddings:
        """Create embeddings instance based on configuration."""
        if settings.openai_api_key:
            logger.info(f"Using OpenAI embeddings: {settings.openai_embedding_model} with {settings.openai_embedding_dimensions} dimensions")
            return OpenAIEmbeddings(
                api_key=settings.openai_api_key,
                model=settings.openai_embedding_model,
                dimensions=settings.openai_embedding_dimensions,
            )
        elif settings.google_api_key:
            logger.info(f"Using Google embeddings: {settings.google_embedding_model}")
            return GoogleGenerativeAIEmbeddings(
                google_api_key=settings.google_api_key,
                model=settings.google_embedding_model,
            )
        else:
            raise ValueError("No embedding API key configured")
            
    def _create_vector_store(self) -> VectorStore:
        """Create vector store instance."""
        if settings.vector_store_type == "chroma":
            # Ensure persist directory exists
            os.makedirs(settings.chroma_persist_directory, exist_ok=True)
            
            return Chroma(
                collection_name=settings.chroma_collection_name,
                embedding_function=self.embeddings,
                persist_directory=settings.chroma_persist_directory,
                collection_metadata={"hnsw:space": "cosine"},
            )
        else:
            raise ValueError(f"Unsupported vector store type: {settings.vector_store_type}")
            
    async def add_documents(
        self,
        documents: List[Document],
        batch_size: Optional[int] = None
    ) -> List[str]:
        """Add documents to vector store."""
        try:
            # Convert to LangChain documents
            langchain_docs = []
            for doc in documents:
                metadata = doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                metadata["id"] = doc.id
                metadata["created_at"] = doc.created_at.isoformat()
                
                # Filter out complex metadata types (lists, dicts, etc.)
                filtered_metadata = {}
                for key, value in metadata.items():
                    if isinstance(value, (str, int, float, bool)) or value is None:
                        filtered_metadata[key] = value
                    elif isinstance(value, list) and key == "tags":
                        # Convert tags list to comma-separated string
                        filtered_metadata[key] = ", ".join(str(v) for v in value)
                    else:
                        # Skip complex types or convert to string
                        logger.debug(f"Skipping complex metadata field: {key}")
                
                langchain_doc = LangchainDocument(
                    page_content=doc.content,
                    metadata=filtered_metadata
                )
                langchain_docs.append(langchain_doc)
                
            # Add documents in batches
            all_ids = []
            actual_batch_size = batch_size or settings.vector_store_batch_size
            for i in range(0, len(langchain_docs), actual_batch_size):
                batch = langchain_docs[i:i + actual_batch_size]
                
                # Run in thread pool to avoid blocking
                loop = asyncio.get_event_loop()
                ids = await loop.run_in_executor(
                    self.executor,
                    self.vector_store.add_documents,
                    batch
                )
                all_ids.extend(ids)
                
                logger.info(f"Added batch {i//batch_size + 1}: {len(batch)} documents")
                
            return all_ids
            
        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            raise
            
    async def search(
        self,
        query: str,
        k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
        search_type: str = "similarity"
    ) -> List[Tuple[LangchainDocument, float]]:
        """Search for similar documents."""
        try:
            loop = asyncio.get_event_loop()
            
            if search_type == "mmr":
                # Maximum Marginal Relevance search
                docs = await loop.run_in_executor(
                    self.executor,
                    lambda: self.vector_store.max_marginal_relevance_search_with_score(
                        query,
                        k=k,
                        filter=filter_dict,
                        fetch_k=settings.retrieval_fetch_k,
                        lambda_mult=settings.retrieval_lambda_mult,
                    )
                )
            else:
                # Similarity search
                docs = await loop.run_in_executor(
                    self.executor,
                    lambda: self.vector_store.similarity_search_with_score(
                        query,
                        k=k,
                        filter=filter_dict
                    )
                )
                
            return docs
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise
            
    async def delete_documents(
        self,
        ids: Optional[List[str]] = None,
        filter_dict: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Delete documents from vector store."""
        try:
            if ids:
                # Delete by IDs
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    self.executor,
                    self.vector_store.delete,
                    ids
                )
                logger.info(f"Deleted {len(ids)} documents")
            elif filter_dict:
                # Delete by filter - implementation depends on vector store
                logger.warning("Delete by filter not implemented for all vector stores")
                
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete documents: {e}")
            return False
            
    def get_retriever(
        self,
        search_kwargs: Optional[Dict[str, Any]] = None
    ) -> BaseRetriever:
        """Get a retriever instance."""
        default_kwargs = {
            "k": settings.retrieval_k,
            "search_type": settings.retrieval_search_type,
        }
        
        if settings.retrieval_search_type == "mmr":
            default_kwargs.update({
                "fetch_k": settings.retrieval_fetch_k,
                "lambda_mult": settings.retrieval_lambda_mult,
            })
            
        if search_kwargs:
            default_kwargs.update(search_kwargs)
            
        return self.vector_store.as_retriever(**default_kwargs)
        
    async def get_collection_stats(self) -> Dict[str, Any]:
        """Get vector store statistics."""
        try:
            # Get collection info for Chroma
            if hasattr(self.vector_store, '_collection'):
                count = self.vector_store._collection.count()
                return {
                    "type": settings.vector_store_type,
                    "collection": settings.chroma_collection_name,
                    "document_count": count,
                    "persist_directory": settings.chroma_persist_directory,
                }
            else:
                return {
                    "type": settings.vector_store_type,
                    "status": "operational",
                }
                
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return {
                "type": settings.vector_store_type,
                "status": "error",
                "error": str(e),
            }
            
    async def close(self) -> None:
        """Close vector store connections."""
        try:
            # Persist Chroma data
            if hasattr(self.vector_store, 'persist'):
                self.vector_store.persist()
                
            # Shutdown executor
            self.executor.shutdown(wait=True)
            logger.info("Vector store closed")
            
        except Exception as e:
            logger.error(f"Error closing vector store: {e}")