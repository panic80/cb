"""Query models for structured query handling."""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
from app.processing.query_classifier import QueryClassification


@dataclass
class QueryContext:
    """
    Comprehensive context object for query processing.
    Replaces scattered config dictionaries with structured data.
    """
    # Core query information
    query: str
    conversation_id: Optional[str] = None
    conversation_history: List[Dict[str, str]] = field(default_factory=list)
    
    # Model and provider settings
    model: str = "gpt-4o-mini"
    provider: str = "openai"
    
    # Pipeline configuration
    retrieval_mode: str = "embedding"  # "embedding", "hybrid", "bm25"
    
    # Pipeline feature flags
    use_enhanced_pipeline: bool = False
    use_table_aware_pipeline: bool = False
    enable_query_expansion: bool = True
    enable_source_filtering: bool = False
    enable_diversity_ranking: bool = True
    lower_similarity_threshold: bool = False
    
    # Filtering and ranking parameters
    filters: Optional[Dict[str, Any]] = None
    source_filters: Optional[List[str]] = None
    preferred_sources: Optional[List[str]] = None
    top_k_retrieval: int = 10
    top_k_reranking: int = 5
    
    # Query classification (set after analysis)
    classification: Optional[QueryClassification] = None
    
    # Additional configuration
    custom_config: Dict[str, Any] = field(default_factory=dict)
    
    def apply_classification(self, classification: QueryClassification) -> None:
        """Apply query classification results to update pipeline settings."""
        self.classification = classification
        
        # Update pipeline settings based on classification
        if classification.query_type == "table_query":
            self.use_table_aware_pipeline = True
            self.use_enhanced_pipeline = True
            self.lower_similarity_threshold = True
            self.enable_source_filtering = True
        elif classification.query_type == "analytical_query":
            self.use_enhanced_pipeline = True
            self.enable_query_expansion = True
        elif classification.query_type == "factual_query":
            self.enable_source_filtering = True
            self.top_k_retrieval = 15  # Cast wider net for factual queries
        
        # Adjust based on characteristics
        if classification.characteristics.get("requires_analysis", False):
            self.enable_query_expansion = True
        
        if classification.characteristics.get("is_specific_lookup", False):
            self.enable_source_filtering = True
    
    def get_pipeline_config(self) -> Dict[str, Any]:
        """Get configuration dictionary for pipeline construction."""
        return {
            "use_enhanced_pipeline": self.use_enhanced_pipeline,
            "use_table_aware_pipeline": self.use_table_aware_pipeline,
            "enable_query_expansion": self.enable_query_expansion,
            "enable_source_filtering": self.enable_source_filtering,
            "enable_diversity_ranking": self.enable_diversity_ranking,
            "source_filters": self.source_filters,
            "preferred_sources": self.preferred_sources,
            "lower_similarity_threshold": self.lower_similarity_threshold,
            **self.custom_config
        }
    
    def get_pipeline_inputs(self) -> Dict[str, Any]:
        """Get input dictionary for pipeline execution."""
        inputs = {}
        
        # For table-aware pipeline, question is sent via query_expander
        if self.use_table_aware_pipeline:
            inputs["prompt_builder"] = {
                "conversation_history": self.conversation_history
            }
            inputs["query_expander"] = {"query": self.query}
        else:
            inputs["prompt_builder"] = {
                "question": self.query,
                "conversation_history": self.conversation_history
            }
            
            # Add retrieval inputs based on mode and configuration
            if self.use_enhanced_pipeline and self.enable_query_expansion:
                inputs["query_expander"] = {"query": self.query}
            else:
                inputs["embedder"] = {"text": self.query}
        
        # Add filtering inputs
        if self.filters:
            if "retriever" in inputs:
                inputs["retriever"]["filters"] = self.filters
            else:
                inputs["retriever"] = {"filters": self.filters}
        
        # Add source filtering inputs
        if self.enable_source_filtering and self.source_filters:
            inputs["source_filter"] = {
                "source_filters": self.source_filters,
                "preferred_sources": self.preferred_sources
            }
        
        # Add ranker inputs only for pipelines that have it (but not table-aware)
        if (self.use_enhanced_pipeline or self.retrieval_mode == "hybrid") and not self.use_table_aware_pipeline:
            if "similarity_ranker" not in inputs:
                inputs["similarity_ranker"] = {"query": self.query}
        
        # Add retrieval mode specific inputs
        if self.retrieval_mode == "hybrid":
            inputs["bm25_retriever"] = {"query": self.query}
        elif self.retrieval_mode == "bm25":
            inputs["bm25_retriever"] = {"query": self.query}
        
        return inputs
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "query": self.query,
            "conversation_id": self.conversation_id,
            "model": self.model,
            "provider": self.provider,
            "retrieval_mode": self.retrieval_mode,
            "pipeline_config": self.get_pipeline_config(),
            "classification": {
                "query_type": self.classification.query_type,
                "confidence": self.classification.confidence,
                "characteristics": self.classification.characteristics
            } if self.classification else None
        }


@dataclass
class QueryResult:
    """Structured result from query processing."""
    answer: str
    sources: List[Dict[str, Any]]
    conversation_id: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Performance metrics
    processing_time_ms: Optional[float] = None
    retrieval_count: Optional[int] = None
    token_usage: Optional[Dict[str, int]] = None
    
    # Quality metrics
    confidence_score: Optional[float] = None
    source_relevance_scores: Optional[List[float]] = None


def create_query_context(
    query: str,
    model: str = "gpt-4o-mini",
    retrieval_mode: str = "embedding",
    conversation_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    **kwargs
) -> QueryContext:
    """
    Factory function to create a QueryContext with sensible defaults.
    
    Args:
        query: The query string
        model: LLM model to use
        retrieval_mode: Retrieval strategy
        conversation_id: Optional conversation identifier
        conversation_history: Previous conversation messages
        **kwargs: Additional configuration options
    
    Returns:
        Configured QueryContext instance
    """
    return QueryContext(
        query=query,
        model=model,
        retrieval_mode=retrieval_mode,
        conversation_id=conversation_id,
        conversation_history=conversation_history or [],
        **kwargs
    )