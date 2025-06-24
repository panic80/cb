"""
Hybrid Retriever Factory for creating configurable retriever chains.

This factory provides a flexible way to create different retriever configurations
based on requirements and available resources.
"""

import time
from typing import Dict, Any, Optional, List, Union
from enum import Enum
import logging

from langchain_core.retrievers import BaseRetriever
from langchain_core.language_models import BaseLLM
from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import VectorStore
from langchain_community.retrievers import BM25Retriever

from app.components.ensemble_retriever import ContentBoostedEnsembleRetriever
from app.components.multi_query_retriever import MultiQueryRetriever
from app.components.contextual_compressor import TravelContextualCompressor
from app.components.self_query_retriever import TravelSelfQueryRetriever
from app.components.parent_document_retriever import TravelParentDocumentRetriever
from app.components.bm25_retriever import TravelBM25Retriever
from app.components.cooccurrence_retriever import TravelCooccurrenceRetriever
from app.components.authority_reranker import AuthorityReranker, AuthorityRerankingRetriever
from app.core.logging import get_logger

logger = get_logger(__name__)


class RetrieverMode(Enum):
    """Available retriever modes."""
    SIMPLE = "simple"  # Just vector search
    HYBRID = "hybrid"  # Vector + BM25
    ADVANCED = "advanced"  # Full multi-stage pipeline
    CUSTOM = "custom"  # Custom configuration


class RetrieverConfig:
    """Configuration for retriever creation."""
    
    def __init__(
        self,
        mode: RetrieverMode = RetrieverMode.ADVANCED,
        use_bm25: bool = True,
        use_multi_query: bool = True,
        use_self_query: bool = True,
        use_compression: bool = True,
        use_smart_chunking: bool = True,
        use_cooccurrence: bool = True,
        use_reranking: bool = True,
        compression_mode: str = "hybrid",
        ensemble_weights: Optional[Dict[str, float]] = None,
        k: int = 10,
        enable_profiling: bool = True
    ):
        self.mode = mode
        self.use_bm25 = use_bm25
        self.use_multi_query = use_multi_query
        self.use_self_query = use_self_query
        self.use_compression = use_compression
        self.use_smart_chunking = use_smart_chunking
        self.use_cooccurrence = use_cooccurrence
        self.use_reranking = use_reranking
        self.compression_mode = compression_mode
        self.ensemble_weights = ensemble_weights or {
            "vector": 0.4,
            "bm25": 0.3,
            "mmr": 0.2,
            "smart_chunk": 0.1
        }
        self.k = k
        self.enable_profiling = enable_profiling


class HybridRetrieverFactory:
    """Factory for creating configurable retriever chains."""
    
    def __init__(
        self,
        vectorstore: VectorStore,
        llm: Optional[BaseLLM] = None,
        embeddings: Optional[Embeddings] = None,
        all_documents: Optional[List] = None
    ):
        """
        Initialize the retriever factory.
        
        Args:
            vectorstore: The vector store to use
            llm: Language model for advanced retrievers
            embeddings: Embeddings model for compression
            all_documents: All documents for BM25 index (optional)
        """
        self.vectorstore = vectorstore
        self.llm = llm
        self.embeddings = embeddings
        self.all_documents = all_documents
        self._profiling_data = {}
    
    def create_retriever(
        self,
        config: Optional[Union[RetrieverConfig, Dict[str, Any]]] = None
    ) -> BaseRetriever:
        """
        Create a retriever based on the configuration.
        
        Args:
            config: Retriever configuration (uses defaults if not provided)
                   Can be a RetrieverConfig object or a dict
            
        Returns:
            Configured retriever chain
        """
        # Handle dict configuration
        if isinstance(config, dict):
            return self._create_retriever_from_dict(config)
        
        config = config or RetrieverConfig()
        
        if config.enable_profiling:
            start_time = time.time()
        
        # Create retriever based on mode
        if config.mode == RetrieverMode.SIMPLE:
            retriever = self._create_simple_retriever(config)
        elif config.mode == RetrieverMode.HYBRID:
            retriever = self._create_hybrid_retriever(config)
        elif config.mode == RetrieverMode.ADVANCED:
            retriever = self._create_advanced_retriever(config)
        else:  # CUSTOM
            retriever = self._create_custom_retriever(config)
        
        if config.enable_profiling:
            self._profiling_data["creation_time"] = time.time() - start_time
            logger.info(f"Retriever created in {self._profiling_data['creation_time']:.2f}s")
        
        return retriever
    
    def _create_retriever_from_dict(self, config: Dict[str, Any]) -> BaseRetriever:
        """Create a retriever from a dictionary configuration."""
        retriever_type = config.get("type", "vector")
        k = config.get("k", 10)
        
        if retriever_type == "vector":
            search_type = config.get("search_type", "similarity")
            search_kwargs = {"k": k}
            if search_type == "mmr":
                search_kwargs["lambda_mult"] = config.get("lambda_mult", 0.5)
            return self.vectorstore.as_retriever(
                search_type=search_type,
                search_kwargs=search_kwargs
            )
        
        elif retriever_type == "bm25":
            if self.all_documents:
                return TravelBM25Retriever(
                    documents=self.all_documents,
                    k=k
                )
            else:
                logger.warning("BM25 retriever requested but no documents provided")
                # Fallback to vector retriever
                return self.vectorstore.as_retriever(
                    search_type="similarity",
                    search_kwargs={"k": k}
                )
        
        elif retriever_type == "multi_query":
            base_retriever_config = config.get("base_retriever", "vector_similarity")
            if isinstance(base_retriever_config, str):
                # Create base retriever from string reference
                base_config = {"type": "vector", "search_type": "similarity", "k": k}
                base_retriever = self._create_retriever_from_dict(base_config)
            else:
                base_retriever = self._create_retriever_from_dict(base_retriever_config)
            
            llm = config.get("llm", self.llm)
            if not llm:
                logger.warning("Multi-query retriever requested but no LLM provided")
                return base_retriever
                
            return MultiQueryRetriever(
                retriever=base_retriever,
                llm=llm,
                include_original=True
            )
        
        else:
            logger.warning(f"Unknown retriever type: {retriever_type}, using vector similarity")
            return self.vectorstore.as_retriever(
                search_type="similarity",
                search_kwargs={"k": k}
            )
    
    def _create_simple_retriever(self, config: RetrieverConfig) -> BaseRetriever:
        """Create a simple vector search retriever."""
        logger.info("Creating simple vector retriever")
        
        retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": config.k}
        )
        
        # Add compression if requested
        if config.use_compression and self.llm and self.embeddings:
            retriever = self._add_compression(retriever, config)
        
        return retriever
    
    def _create_hybrid_retriever(self, config: RetrieverConfig) -> BaseRetriever:
        """Create a hybrid retriever with vector + BM25."""
        logger.info("Creating hybrid retriever")
        
        retrievers = []
        weights = []
        
        # Vector retriever
        vector_retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": config.k}
        )
        retrievers.append(vector_retriever)
        weights.append(config.ensemble_weights.get("vector", 0.5))
        
        # BM25 retriever
        if config.use_bm25 and self.all_documents:
            try:
                bm25_retriever = TravelBM25Retriever(
                    documents=self.all_documents,
                    k=config.k
                )
                retrievers.append(bm25_retriever)
                weights.append(config.ensemble_weights.get("bm25", 0.5))
            except Exception as e:
                logger.warning(f"Failed to create BM25 retriever: {e}")
        
        # Normalize weights
        total_weight = sum(weights)
        weights = [w / total_weight for w in weights]
        
        # Create ensemble
        ensemble = ContentBoostedEnsembleRetriever(
            retrievers=retrievers,
            weights=weights,
            k=config.k
        )
        
        # Add compression if requested
        if config.use_compression and self.llm and self.embeddings:
            ensemble = self._add_compression(ensemble, config)
        
        return ensemble
    
    def _create_advanced_retriever(self, config: RetrieverConfig) -> BaseRetriever:
        """Create an advanced multi-stage retriever pipeline."""
        logger.info("Creating advanced retriever pipeline")
        
        # Stage 1: Create base retrievers
        base_retrievers = self._create_base_retrievers(config)
        
        # Stage 2: Create ensemble
        ensemble = self._create_ensemble(base_retrievers, config)
        
        # Stage 3: Add advanced features
        retriever = ensemble
        
        # Add co-occurrence retrieval
        if config.use_cooccurrence and self.all_documents:
            try:
                # Co-occurrence retriever needs documents, not a base retriever
                # We'll add it to the ensemble instead of wrapping
                cooccurrence_retriever = TravelCooccurrenceRetriever(
                    documents=self.all_documents,
                    k=config.k
                )
                # Create a new ensemble with the co-occurrence retriever
                retrievers = [retriever, cooccurrence_retriever]
                weights = [0.7, 0.3]  # Give more weight to the existing retriever
                retriever = ContentBoostedEnsembleRetriever(
                    retrievers=retrievers,
                    weights=weights,
                    k=config.k
                )
            except Exception as e:
                logger.warning(f"Failed to add co-occurrence retriever: {e}")
        
        # Add multi-query
        if config.use_multi_query and self.llm:
            try:
                multi_query = MultiQueryRetriever(
                    retriever=retriever,  # Correct parameter name
                    llm=self.llm,
                    include_original=True
                )
                retriever = multi_query
            except Exception as e:
                logger.warning(f"Failed to add multi-query retriever: {e}")
        
        # Add compression
        if config.use_compression and self.llm and self.embeddings:
            retriever = self._add_compression(retriever, config)
        
        # Add reranking
        if config.use_reranking:
            try:
                retriever = AuthorityRerankingRetriever(
                    base_retriever=retriever,
                    boost_factor=2.0
                )
            except Exception as e:
                logger.warning(f"Failed to add reranking: {e}")
        
        return retriever
    
    def _create_custom_retriever(self, config: RetrieverConfig) -> BaseRetriever:
        """Create a custom retriever based on specific configuration."""
        logger.info("Creating custom retriever")
        
        # Start with base retrievers
        base_retrievers = self._create_base_retrievers(config)
        
        # Create ensemble if multiple retrievers
        if len(base_retrievers) > 1:
            retriever = self._create_ensemble(base_retrievers, config)
        else:
            retriever = list(base_retrievers.values())[0]
        
        # Add components based on configuration
        if config.use_multi_query and self.llm:
            retriever = MultiQueryRetriever(
                retriever=retriever,  # Correct parameter name
                llm=self.llm,
                include_original=True
            )
        
        if config.use_compression and self.llm and self.embeddings:
            retriever = self._add_compression(retriever, config)
        
        return retriever
    
    def _create_base_retrievers(self, config: RetrieverConfig) -> Dict[str, BaseRetriever]:
        """Create base retrievers for ensemble."""
        retrievers = {}
        
        # Vector retriever
        retrievers["vector"] = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": config.k}
        )
        
        # MMR retriever
        retrievers["mmr"] = self.vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={"k": config.k, "lambda_mult": 0.5}
        )
        
        # BM25 retriever
        if config.use_bm25 and self.all_documents:
            try:
                retrievers["bm25"] = TravelBM25Retriever(
                    documents=self.all_documents,
                    k=config.k
                )
            except Exception as e:
                logger.warning(f"Failed to create BM25 retriever: {e}")
        
        # Smart chunk retriever (parent document retriever)
        if config.use_smart_chunking:
            try:
                # Create child retriever for finding chunks
                child_retriever = self.vectorstore.as_retriever(
                    search_type="similarity",
                    search_kwargs={"k": config.k // 2}
                )
                
                retrievers["smart_chunk"] = TravelParentDocumentRetriever(
                    child_retriever=child_retriever,
                    k=config.k
                )
            except Exception as e:
                logger.warning(f"Failed to create smart chunk retriever: {e}")
        
        # Self-query retriever
        if config.use_self_query and self.llm:
            try:
                retrievers["self_query"] = TravelSelfQueryRetriever(
                    vectorstore=self.vectorstore,
                    llm=self.llm,
                    document_contents="Canadian Forces travel instructions",
                    search_kwargs={"k": config.k}
                )
            except Exception as e:
                logger.warning(f"Failed to create self-query retriever: {e}")
        
        return retrievers
    
    def _create_ensemble(
        self,
        base_retrievers: Dict[str, BaseRetriever],
        config: RetrieverConfig
    ) -> BaseRetriever:
        """Create ensemble from base retrievers."""
        retrievers = []
        weights = []
        
        for name, retriever in base_retrievers.items():
            retrievers.append(retriever)
            weights.append(config.ensemble_weights.get(name, 0.2))
        
        # Normalize weights
        total_weight = sum(weights)
        weights = [w / total_weight for w in weights]
        
        return ContentBoostedEnsembleRetriever(
            retrievers=retrievers,
            weights=weights,
            k=config.k
        )
    
    def _add_compression(
        self,
        retriever: BaseRetriever,
        config: RetrieverConfig
    ) -> BaseRetriever:
        """Add compression to a retriever."""
        try:
            compressor = TravelContextualCompressor(
                base_retriever=retriever,
                llm=self.llm,
                embeddings=self.embeddings
            )
            
            return compressor
        except Exception as e:
            logger.warning(f"Failed to add compression: {e}")
            return retriever
    
    def get_profiling_data(self) -> Dict[str, Any]:
        """Get profiling data from the last retriever creation."""
        return self._profiling_data
    
    @classmethod
    def create_from_vector_store_manager(
        cls,
        vector_store_manager,
        llm: Optional[BaseLLM] = None
    ) -> "HybridRetrieverFactory":
        """
        Convenience method to create factory from VectorStoreManager.
        
        Args:
            vector_store_manager: VectorStoreManager instance
            llm: Language model
            
        Returns:
            HybridRetrieverFactory instance
        """
        return cls(
            vectorstore=vector_store_manager.vector_store,
            llm=llm,
            embeddings=vector_store_manager.embeddings,
            all_documents=None  # Will be loaded lazily if needed
        )


# Example usage functions
def create_simple_retriever(vectorstore: VectorStore) -> BaseRetriever:
    """Create a simple vector search retriever."""
    factory = HybridRetrieverFactory(vectorstore)
    config = RetrieverConfig(mode=RetrieverMode.SIMPLE)
    return factory.create_retriever(config)


def create_hybrid_retriever(
    vectorstore: VectorStore,
    all_documents: List,
    llm: Optional[BaseLLM] = None
) -> BaseRetriever:
    """Create a hybrid vector + BM25 retriever."""
    factory = HybridRetrieverFactory(
        vectorstore=vectorstore,
        llm=llm,
        all_documents=all_documents
    )
    config = RetrieverConfig(mode=RetrieverMode.HYBRID)
    return factory.create_retriever(config)


def create_advanced_retriever(
    vectorstore: VectorStore,
    llm: BaseLLM,
    embeddings: Embeddings,
    all_documents: Optional[List] = None
) -> BaseRetriever:
    """Create an advanced multi-stage retriever."""
    factory = HybridRetrieverFactory(
        vectorstore=vectorstore,
        llm=llm,
        embeddings=embeddings,
        all_documents=all_documents
    )
    config = RetrieverConfig(mode=RetrieverMode.ADVANCED)
    return factory.create_retriever(config)