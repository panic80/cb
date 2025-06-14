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
    if isinstance(document_store, InMemoryDocumentStore):
        pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    else:
        # Use PgvectorEmbeddingRetriever for pgvector document store
        pipeline.add_component("retriever", PgvectorEmbeddingRetriever(
            document_store=document_store,
            top_k=settings.TOP_K_RETRIEVAL
        ))
    
    # Add prompt builder with generic formatting instructions
    prompt_template = """
You are a helpful AI assistant. Use the following context to answer the user's question accurately and concisely.

FORMATTING GUIDELINES:
- Provide clear, well-structured responses
- Use appropriate line breaks to separate distinct information
- When presenting lists or multiple items, use bullet points or numbered lists
- Separate different categories or sections with clear headings when applicable
- Ensure each piece of information is distinct and not merged with unrelated content
- Use proper spacing between sections for readability

Context:
{% for doc in documents %}
---
{{ doc.content }}
Source: {{ doc.meta.source }}
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
            # Removed stream parameter to avoid conflict with Haystack's built-in streaming
        }
    ))
    
    # Add answer builder to format the response
    pipeline.add_component("answer_builder", AnswerBuilder())
    
    # Connect components
    pipeline.connect("embedder.embedding", "retriever.query_embedding")
    pipeline.connect("retriever.documents", "prompt_builder.documents")
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    pipeline.connect("retriever.documents", "answer_builder.documents")
    
    logger.info("Query pipeline created successfully")
    return pipeline


@component
class AnswerBuilder:
    """Build the final answer with sources."""
    
    @component.output_types(answer=str, sources=List[Dict[str, Any]])
    def run(self, replies: List[str], documents: List[Any]) -> Dict[str, Any]:
        """Format the answer with sources."""
        # Extract answer
        answer = replies[0] if replies else ""
        
        # Extract sources
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
                    "metadata": doc.meta
                })
        
        return {
            "answer": answer,
            "sources": sources
        }