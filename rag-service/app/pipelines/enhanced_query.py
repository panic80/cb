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
from app.components.answer_builder import AnswerBuilder
from app.components.diversity_ranker import DiversityRanker
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
    pipeline.add_component("answer_builder", AnswerBuilder())
    
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


# DiversityRanker component moved to app/components/diversity_ranker.py


# EnhancedAnswerBuilder component moved to app/components/answer_builder.py as AnswerBuilder