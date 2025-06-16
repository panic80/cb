import logging
from typing import List, Dict, Any, Optional

from haystack import Pipeline, component
from haystack.components.embedders import OpenAITextEmbedder
from haystack.components.retrievers import (
    InMemoryEmbeddingRetriever,
    InMemoryBM25Retriever,
    FilterRetriever
)
from haystack.components.joiners import DocumentJoiner
from haystack.components.rankers import (
    SentenceTransformersSimilarityRanker,
    MetaFieldRanker
)
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator
from haystack.utils import Secret
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever

from app.core.config import settings

logger = logging.getLogger(__name__)


def create_hybrid_query_pipeline(document_store, model: str = None, provider: str = None) -> Pipeline:
    """Create a hybrid query pipeline with both BM25 and embedding retrieval."""
    # Use provided model or fall back to settings
    llm_model = model if model else settings.LLM_MODEL
    logger.info(f"Creating hybrid query pipeline with model: {llm_model}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add embedder for query
    pipeline.add_component("embedder", OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add retrievers based on document store type
    if isinstance(document_store, InMemoryDocumentStore):
        # Add BM25 retriever for keyword search
        pipeline.add_component("bm25_retriever", InMemoryBM25Retriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
        
        # Add embedding retriever for semantic search
        pipeline.add_component("embedding_retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    else:
        # For pgvector, we only have embedding retrieval
        # BM25 would require full-text search in PostgreSQL
        pipeline.add_component("embedding_retriever", PgvectorEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    
    # Add document joiner to combine results
    pipeline.add_component("joiner", DocumentJoiner(
        join_mode="reciprocal_rank_fusion",
        top_k=settings.TOP_K_RETRIEVAL,
        weights=[settings.BM25_WEIGHT, settings.EMBEDDING_WEIGHT]
    ))

    # Optional score gate after join to filter weak hits and cap docs
    from app.components.score_filter import ScoreFilter
    pipeline.add_component("score_filter", ScoreFilter(threshold=0.05, top_k=settings.TOP_K_RERANKING))
    
    # Add ranker for reranking
    pipeline.add_component("ranker", SentenceTransformersSimilarityRanker(
        model=settings.RERANKER_MODEL,
        top_k=settings.TOP_K_RERANKING
    ))
    
    # Add prompt builder
    prompt_template = """
You are a helpful AI assistant. Use the following context to answer the user's question accurately and concisely.

FORMATTING GUIDELINES:
- Provide clear, well-structured responses
- Use appropriate line breaks to separate distinct information
- When presenting lists or multiple items, use bullet points or numbered lists
- Separate different categories or sections with clear headings when applicable
- Ensure each piece of information is distinct and not merged with unrelated content
- Use proper spacing between sections for readability
- Preserve table structure and formatting when present in the source data

Context:
{% for doc in documents %}
---
{{ doc.content }}
Source: {{ doc.meta.source }}
Score: {{ doc.score }}
---
{% endfor %}

{% if conversation_history %}
Conversation History:
{% for message in conversation_history %}
{{ message.role }}: {{ message.content }}
{% endfor %}
{% endif %}

User Question: {{ question }}

Answer:"""
    
    pipeline.add_component("prompt_builder", PromptBuilder(template=prompt_template))
    
    # Add generator
    pipeline.add_component("generator", OpenAIGenerator(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=llm_model,
        generation_kwargs={
            "temperature": settings.TEMPERATURE,
            "max_tokens": settings.MAX_TOKENS
        }
    ))
    
    # Add answer builder to format the response
    pipeline.add_component("answer_builder", AnswerBuilder())
    
    # Connect components
    if isinstance(document_store, InMemoryDocumentStore):
        # Connect for hybrid retrieval
        pipeline.connect("embedder.embedding", "embedding_retriever.query_embedding")
        pipeline.connect("bm25_retriever.documents", "joiner.documents")
        pipeline.connect("embedding_retriever.documents", "joiner.documents")
        pipeline.connect("joiner.documents", "score_filter.documents")
        pipeline.connect("score_filter.documents", "ranker.documents")
    else:
        # Connect for embedding-only retrieval
        pipeline.connect("embedder.embedding", "embedding_retriever.query_embedding")
        pipeline.connect("embedding_retriever.documents", "score_filter.documents")
        pipeline.connect("score_filter.documents", "ranker.documents")
    
    # Connect ranker to prompt builder
    pipeline.connect("ranker.documents", "prompt_builder.documents")
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    pipeline.connect("ranker.documents", "answer_builder.documents")
    
    logger.info("Hybrid query pipeline created successfully")
    return pipeline


def create_filtered_query_pipeline(document_store, model: str = None, provider: str = None) -> Pipeline:
    """Create a query pipeline with filtering support."""
    # Use provided model or fall back to settings
    llm_model = model if model else settings.LLM_MODEL
    logger.info(f"Creating filtered query pipeline with model: {llm_model}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add embedder for query
    pipeline.add_component("embedder", OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add embedding retriever with filtering support
    if isinstance(document_store, InMemoryDocumentStore):
        pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    else:
        pipeline.add_component("retriever", PgvectorEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    
    # Add metadata ranker
    if settings.ENABLE_METADATA_RANKING:
        pipeline.add_component("meta_ranker", MetaFieldRanker(
            meta_field="indexed_at",
            ranking_mode="linear_score",
            weight=settings.METADATA_RANKING_WEIGHT,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    
    # Add similarity ranker
    pipeline.add_component("similarity_ranker", SentenceTransformersSimilarityRanker(
        model=settings.RERANKER_MODEL,
        top_k=settings.TOP_K_RETRIEVAL
    ))
    
    # Rest of the pipeline (prompt builder, generator, answer builder)
    prompt_template = """
You are a helpful AI assistant. Use the following context to answer the user's question accurately and concisely.

FORMATTING GUIDELINES:
- Provide clear, well-structured responses
- Use appropriate line breaks to separate distinct information
- When presenting lists or multiple items, use bullet points or numbered lists
- Separate different categories or sections with clear headings when applicable
- Ensure each piece of information is distinct and not merged with unrelated content
- Use proper spacing between sections for readability
- Preserve table structure and formatting when present in the source data

Context:
{% for doc in documents %}
---
{{ doc.content }}
Source: {{ doc.meta.source }}
{% if doc.meta.indexed_at %}Date: {{ doc.meta.indexed_at }}{% endif %}
---
{% endfor %}

{% if conversation_history %}
Conversation History:
{% for message in conversation_history %}
{{ message.role }}: {{ message.content }}
{% endfor %}
{% endif %}

User Question: {{ question }}

Answer:"""
    
    pipeline.add_component("prompt_builder", PromptBuilder(template=prompt_template))
    
    pipeline.add_component("generator", OpenAIGenerator(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=llm_model,
        generation_kwargs={
            "temperature": settings.TEMPERATURE,
            "max_tokens": settings.MAX_TOKENS
        }
    ))
    
    pipeline.add_component("answer_builder", AnswerBuilder())
    
    # Connect components
    pipeline.connect("embedder.embedding", "retriever.query_embedding")
    
    if settings.ENABLE_METADATA_RANKING:
        pipeline.connect("retriever.documents", "meta_ranker.documents")
        pipeline.connect("meta_ranker.documents", "similarity_ranker.documents")
    else:
        pipeline.connect("retriever.documents", "similarity_ranker.documents")
    
    pipeline.connect("similarity_ranker.documents", "prompt_builder.documents")
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    pipeline.connect("similarity_ranker.documents", "answer_builder.documents")
    
    logger.info("Filtered query pipeline created successfully")
    return pipeline


@component
class AnswerBuilder:
    """Build the final answer with sources."""
    
    @component.output_types(answer=str, sources=List[Dict[str, Any]])
    def run(self, replies: List[str], documents: List[Any]) -> Dict[str, Any]:
        """Format the answer with sources."""
        # Extract answer
        answer = replies[0] if replies else ""
        
        # Extract sources with scores
        sources = []
        seen_sources = set()
        
        for doc in documents[:5]:  # Limit to top 5 sources
            source = doc.meta.get("source", "Unknown")
            if source not in seen_sources:
                seen_sources.add(source)
                sources.append({
                    "source": source,
                    "title": doc.meta.get("title", source),
                    "content_preview": doc.content[:200] + "..." if len(doc.content) > 200 else doc.content,
                    "score": doc.score,
                    "metadata": doc.meta
                })
        
        return {
            "answer": answer,
            "sources": sources
        }