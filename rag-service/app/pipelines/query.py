import logging
from typing import List, Dict, Any

from haystack import Pipeline, component
from haystack.components.embedders import OpenAITextEmbedder
from haystack.components.retrievers import InMemoryEmbeddingRetriever
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator
from haystack.utils import Secret
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.components.retrievers.pgvector import PgvectorEmbeddingRetriever

from app.components.answer_builder import AnswerBuilder
from app.core.config import settings

logger = logging.getLogger(__name__)


def create_query_pipeline(document_store, model: str = None, provider: str = None) -> Pipeline:
    """Create the query/RAG pipeline."""
    # Use provided model or fall back to settings
    llm_model = model if model else settings.LLM_MODEL
    logger.info(f"Creating query pipeline with model: {llm_model}")
    
    # Create pipeline
    pipeline = Pipeline()
    
    # Add embedder for query
    pipeline.add_component("embedder", OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add retriever based on document store type
    # Fetch a wider first-pass candidate set (3 × TOP_K_RETRIEVAL) so that later
    # filtering / reranking can pick the truly relevant hits.
    initial_top_k = settings.TOP_K_RETRIEVAL * 3

    if isinstance(document_store, InMemoryDocumentStore):
        pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=initial_top_k
        ))
    else:
        # Use PgvectorEmbeddingRetriever for pgvector document store
        pipeline.add_component("retriever", PgvectorEmbeddingRetriever(
            document_store=document_store,
            top_k=initial_top_k
        ))

    # Score-floor filter to remove very low-similarity matches before prompt
    from app.components.score_filter import ScoreFilter  # local import to avoid cycles
    pipeline.add_component("score_filter", ScoreFilter(threshold=0.05, top_k=settings.TOP_K_RERANKING))
    
    # Add prompt builder with focused instructions
    prompt_template = """
You are a helpful AI assistant. Use the following context to answer the user's question accurately and concisely.

GUIDELINES:
- Focus on directly answering the specific question asked
- Be concise but complete in your response
- Use clear formatting when presenting multiple points or items
- If the context doesn't fully answer the question, acknowledge what's missing

Context:
{% for doc in documents %}
---
{{ doc.content }}
Source: {{ doc.meta.source }}
---
{% endfor %}

{% if conversation_history %}
Previous conversation:
{% for message in conversation_history %}
{{ message.role }}: {{ message.content }}
{% endfor %}
{% endif %}

User Question: {{ question }}

Answer:"""
    
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
    
    # Add answer builder to format the response
    pipeline.add_component("answer_builder", AnswerBuilder())
    
    # Connect components
    pipeline.connect("embedder.embedding", "retriever.query_embedding")
    pipeline.connect("retriever.documents", "score_filter.documents")
    pipeline.connect("score_filter.documents", "prompt_builder.documents")
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    pipeline.connect("score_filter.documents", "answer_builder.documents")
    
    logger.info("Query pipeline created successfully")
    return pipeline


# AnswerBuilder component moved to app/components/answer_builder.py