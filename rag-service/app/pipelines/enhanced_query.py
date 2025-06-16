import logging
from typing import List, Dict, Any, Optional

from haystack import Pipeline, component
from haystack.components.embedders import OpenAITextEmbedder
from haystack.components.retrievers import (
    InMemoryEmbeddingRetriever,
    InMemoryBM25Retriever
)
from haystack.components.joiners import DocumentJoiner
from haystack.components.rankers import SentenceTransformersSimilarityRanker
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator
from haystack.utils import Secret
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever

from app.core.config import settings
from app.components.source_aware_retriever import SourceAwareRetriever
from app.components.query_expander import QueryExpander, MultiQueryRetriever

logger = logging.getLogger(__name__)


def create_enhanced_query_pipeline(
    document_store,
    model: str = None,
    provider: str = None,
    enable_query_expansion: bool = True,
    enable_source_filtering: bool = True,
    enable_diversity_ranking: bool = True
) -> Pipeline:
    """
    Create an enhanced query pipeline with advanced features:
    - Query expansion for improved recall
    - Source-aware retrieval and filtering
    - Diversity-aware ranking
    - Per-query configuration support
    """
    llm_model = model if model else settings.LLM_MODEL
    logger.info(f"Creating enhanced query pipeline with model: {llm_model}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add query expansion if enabled
    if enable_query_expansion:
        pipeline.add_component("query_expander", QueryExpander(
            model=llm_model,
            expansion_strategy="comprehensive",
            max_expansions=3
        ))
    
    # Add embedder for queries
    pipeline.add_component("embedder", OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add retrievers based on document store type
    if isinstance(document_store, InMemoryDocumentStore):
        # Add BM25 retriever
        pipeline.add_component("bm25_retriever", InMemoryBM25Retriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL * 3  # Get 3x more for filtering and reranking
        ))
        
        # Add embedding retriever
        pipeline.add_component("embedding_retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL * 3  # Get 3x more for filtering and reranking
        ))
        
        # Add document joiner for hybrid retrieval
        pipeline.add_component("joiner", DocumentJoiner(
            join_mode="reciprocal_rank_fusion",
            top_k=settings.TOP_K_RETRIEVAL * 2,
            weights=[settings.BM25_WEIGHT, settings.EMBEDDING_WEIGHT]
        ))
    else:
        # PgVector + In-Memory BM25 hybrid approach
        from app.components.hybrid_retriever import HybridPgVectorBM25Retriever
        
        # Add hybrid retriever that combines pgvector embeddings with in-memory BM25
        pipeline.add_component("hybrid_retriever", HybridPgVectorBM25Retriever(
            pgvector_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL * 3,
            bm25_weight=settings.BM25_WEIGHT,
            embedding_weight=settings.EMBEDDING_WEIGHT
        ))
    
    # Add source-aware filtering if enabled
    if enable_source_filtering:
        pipeline.add_component("source_filter", SourceAwareRetriever(
            balance_sources=True,
            max_per_source=settings.MAX_SOURCES_PER_QUERY
        ))
    
    # Add similarity ranker
    pipeline.add_component("similarity_ranker", SentenceTransformersSimilarityRanker(
        model=settings.RERANKER_MODEL,
        top_k=settings.TOP_K_RERANKING
    ))

    # Score gating to drop weak matches and cap outgoing docs
    from app.components.score_filter import ScoreFilter
    pipeline.add_component("score_filter", ScoreFilter(threshold=0.05, top_k=settings.TOP_K_RERANKING))
    
    # Add diversity ranker if enabled
    if enable_diversity_ranking:
        pipeline.add_component("diversity_ranker", DiversityRanker(
            diversity_threshold=0.8,
            top_k=settings.TOP_K_RERANKING
        ))
    
    # Add enhanced prompt builder
    prompt_template = """
You are a helpful AI assistant with access to multiple information sources. 
Use the following context to answer the user's question accurately and comprehensively.

IMPORTANT GUIDELINES:
- Focus on answering the specific question asked
- When multiple sources provide information, prioritize the most relevant and credible ones
- If sources contain conflicting information, acknowledge this and provide the most reliable answer
- Use clear structure and formatting for readability
- Only cite sources when making specific factual claims
- If the context doesn't contain enough information to fully answer the question, acknowledge this

CONTEXT INFORMATION:
{% for doc in documents %}
---
Source: {{ doc.meta.source }} (Type: {{ doc.meta.content_type | default('unknown') }})
{% if doc.score %}Relevance: {{ "%.2f"|format(doc.score) }}{% endif %}

{{ doc.content }}
---
{% endfor %}

{% if conversation_history %}
CONVERSATION HISTORY:
{% for message in conversation_history %}
{{ message.role }}: {{ message.content }}
{% endfor %}
{% endif %}

USER QUESTION: {{ question }}

Please provide a focused, accurate answer based on the context above:"""
    
    pipeline.add_component("prompt_builder", PromptBuilder(template=prompt_template))
    
    # Add generator - some models don't support custom temperature
    generation_kwargs = {
        "max_completion_tokens": settings.MAX_TOKENS
    }
    
    # Only add temperature for models that support it
    if not llm_model.startswith(("o1-", "o4-")):
        generation_kwargs["temperature"] = settings.TEMPERATURE
    
    pipeline.add_component("generator", OpenAIGenerator(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=llm_model,
        generation_kwargs=generation_kwargs
    ))
    
    # Add enhanced answer builder
    pipeline.add_component("answer_builder", EnhancedAnswerBuilder())
    
    # Connect components
    if enable_query_expansion:
        # Query expansion flow - use first expanded query for embedding
        pipeline.connect("query_expander.original_query", "embedder.text")
        # Store metadata for prompt
        pipeline.connect("query_expander.expansion_metadata", "answer_builder.query_metadata")
    # For embedder, we always need the text input connected
    
    # Retrieval connections
    if isinstance(document_store, InMemoryDocumentStore):
        pipeline.connect("embedder.embedding", "embedding_retriever.query_embedding")
        # Connect both retrievers to joiner
        pipeline.connect("bm25_retriever.documents", "joiner.documents")
        pipeline.connect("embedding_retriever.documents", "joiner.documents")
        retriever_output = "joiner.documents"
    else:
        # Connect hybrid retriever
        pipeline.connect("embedder.embedding", "hybrid_retriever.query_embedding")
        retriever_output = "hybrid_retriever.documents"
    
    # Filtering and ranking flow
    if enable_source_filtering:
        pipeline.connect(retriever_output, "source_filter.documents")
        pipeline.connect("source_filter.documents", "similarity_ranker.documents")
    else:
        pipeline.connect(retriever_output, "similarity_ranker.documents")
    
    if enable_diversity_ranking:
        pipeline.connect("similarity_ranker.documents", "score_filter.documents")
        pipeline.connect("score_filter.documents", "diversity_ranker.documents")
        pipeline.connect("diversity_ranker.documents", "prompt_builder.documents")
        pipeline.connect("diversity_ranker.documents", "answer_builder.documents")
    else:
        pipeline.connect("similarity_ranker.documents", "score_filter.documents")
        pipeline.connect("score_filter.documents", "prompt_builder.documents")
        pipeline.connect("score_filter.documents", "answer_builder.documents")
    
    # Final connections
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    
    logger.info("Enhanced query pipeline created successfully")
    return pipeline


@component
class DiversityRanker:
    """
    Ranks documents to ensure diversity in the results.
    Reduces redundancy by penalizing documents that are too similar to already selected ones.
    """
    
    def __init__(
        self,
        diversity_threshold: float = 0.8,
        top_k: int = 5,
        similarity_model: str = None
    ):
        """
        Initialize the diversity ranker.
        
        Args:
            diversity_threshold: Maximum allowed similarity between selected documents (0-1)
            top_k: Number of diverse documents to return
            similarity_model: Model for computing similarity (if None, uses simple text overlap)
        """
        self.diversity_threshold = diversity_threshold
        self.top_k = top_k
        self.similarity_model = similarity_model
        
        logger.info(f"Initialized DiversityRanker with threshold: {diversity_threshold}")
    
    @component.output_types(documents=List[Any])
    def run(self, documents: List[Any]) -> Dict[str, List[Any]]:
        """
        Select diverse documents from the input list.
        
        Args:
            documents: List of documents to rank for diversity
            
        Returns:
            Dictionary with diverse documents
        """
        if not documents:
            return {"documents": []}
        
        # If we have fewer documents than requested, return all
        if len(documents) <= self.top_k:
            return {"documents": documents}
        
        # Select diverse documents
        selected = []
        selected_contents = []
        
        for doc in documents:
            if len(selected) >= self.top_k:
                break
            
            # Check similarity with already selected documents
            if self._is_diverse(doc.content, selected_contents):
                selected.append(doc)
                selected_contents.append(doc.content)
        
        # If we didn't get enough diverse documents, add the remaining top-scored ones
        if len(selected) < self.top_k:
            for doc in documents:
                if doc not in selected and len(selected) < self.top_k:
                    selected.append(doc)
        
        logger.info(f"Selected {len(selected)} diverse documents from {len(documents)}")
        
        return {"documents": selected}
    
    def _is_diverse(self, content: str, selected_contents: List[str]) -> bool:
        """Check if content is diverse enough from already selected contents."""
        if not selected_contents:
            return True
        
        for selected in selected_contents:
            similarity = self._compute_similarity(content, selected)
            if similarity > self.diversity_threshold:
                return False
        
        return True
    
    def _compute_similarity(self, text1: str, text2: str) -> float:
        """Compute similarity between two texts (simple Jaccard similarity)."""
        # Simple word-based Jaccard similarity
        # In production, you might want to use embeddings or more sophisticated methods
        
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0


@component
class EnhancedAnswerBuilder:
    """
    Enhanced answer builder that includes metadata and confidence scoring.
    """
    
    @component.output_types(
        answer=str,
        sources=List[Dict[str, Any]],
        confidence_score=float,
        metadata=Dict[str, Any]
    )
    def run(
        self,
        replies: List[str],
        documents: List[Any],
        query_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Build enhanced answer with confidence scoring and metadata.
        
        Args:
            replies: Generated answers
            documents: Retrieved documents
            query_metadata: Metadata from query expansion
            
        Returns:
            Dictionary with answer, sources, confidence, and metadata
        """
        # Extract answer
        answer = replies[0] if replies else ""
        
        # Calculate confidence score based on various factors
        confidence_score = self._calculate_confidence(documents, query_metadata)
        
        # Extract and enhance sources
        sources = []
        seen_sources = set()
        
        for doc in documents[:5]:  # Top 5 sources
            source = doc.meta.get("source", "Unknown")
            if source not in seen_sources:
                seen_sources.add(source)
                
                # Calculate source-specific confidence
                source_confidence = self._calculate_source_confidence(doc)
                
                sources.append({
                    "source": source,
                    "title": doc.meta.get("title", source),
                    "content_preview": doc.content[:200] + "..." if len(doc.content) > 200 else doc.content,
                    "relevance_score": float(getattr(doc, 'score', 0.0)),
                    "confidence": float(source_confidence),
                    "source_type": doc.meta.get("content_type", "unknown"),
                    "metadata": doc.meta
                })
        
        # Build response metadata
        response_metadata = {
            "retrieval_count": len(documents),
            "sources_count": len(sources),
            "query_expansion_used": query_metadata is not None,
            "expansion_details": query_metadata if query_metadata else {},
            "diversity_metrics": self._calculate_diversity_metrics(documents)
        }
        
        return {
            "answer": answer,
            "sources": sources,
            "confidence_score": confidence_score,
            "metadata": response_metadata
        }
    
    def _calculate_confidence(
        self,
        documents: List[Any],
        query_metadata: Optional[Dict[str, Any]] = None
    ) -> float:
        """Calculate overall confidence score for the answer."""
        if not documents:
            return 0.0
        
        # Factors for confidence calculation
        factors = []
        
        # 1. Average document relevance score
        avg_score = sum(getattr(doc, 'score', 0.5) for doc in documents) / len(documents)
        factors.append(avg_score)
        
        # 2. Number of retrieved documents (normalized)
        doc_count_factor = min(len(documents) / settings.TOP_K_RETRIEVAL, 1.0)
        factors.append(doc_count_factor)
        
        # 3. Source diversity (multiple sources = higher confidence)
        unique_sources = len(set(doc.meta.get("source", "") for doc in documents))
        source_diversity = min(unique_sources / 3, 1.0)  # Normalize to max 3 sources
        factors.append(source_diversity)
        
        # 4. Query expansion success (if used)
        if query_metadata and query_metadata.get("expansion_count", 0) > 0:
            expansion_factor = 0.8  # Slight boost for successful expansion
        else:
            expansion_factor = 0.7
        factors.append(expansion_factor)
        
        # Calculate weighted average
        weights = [0.4, 0.2, 0.2, 0.2]  # Relevance is most important
        confidence = sum(f * w for f, w in zip(factors, weights))
        
        return float(round(confidence, 2))
    
    def _calculate_source_confidence(self, doc: Any) -> float:
        """Calculate confidence for a specific source."""
        factors = []
        
        # Document relevance score
        factors.append(getattr(doc, 'score', 0.5))
        
        # Source credibility (from metadata if available)
        credibility = doc.meta.get("credibility_score", 0.7)
        factors.append(credibility)
        
        # Content length factor (longer = potentially more comprehensive)
        content_length = len(doc.content)
        length_factor = min(content_length / 1000, 1.0)  # Normalize to 1000 chars
        factors.append(length_factor)
        
        return float(round(sum(factors) / len(factors), 2))
    
    def _calculate_diversity_metrics(self, documents: List[Any]) -> Dict[str, Any]:
        """Calculate diversity metrics for the retrieved documents."""
        if not documents:
            return {"source_types": 0, "unique_sources": 0, "content_diversity": 0.0}
        
        # Source type diversity
        source_types = set()
        unique_sources = set()
        
        for doc in documents:
            source_types.add(doc.meta.get("content_type", "unknown"))
            unique_sources.add(doc.meta.get("source", "unknown"))
        
        # Simple content diversity (based on unique words ratio)
        all_words = set()
        total_words = 0
        
        for doc in documents[:5]:  # Sample first 5 docs
            words = set(doc.content.lower().split()[:50])  # First 50 words
            all_words.update(words)
            total_words += len(words)
        
        content_diversity = len(all_words) / total_words if total_words > 0 else 0.0
        
        return {
            "source_types": len(source_types),
            "unique_sources": len(unique_sources),
            "content_diversity": round(content_diversity, 2)
        }