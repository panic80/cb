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


@component
class TableAwareRetrieverFilter:
    """Enhanced filter that prioritizes table content and adjusts scoring for table queries."""
    
    def __init__(self, base_threshold: float = 0.01, table_boost: float = 0.2, top_k: int = None):
        """
        Initialize table-aware filter.
        
        Args:
            base_threshold: Base similarity threshold (lower for tables)
            table_boost: Score boost for documents containing tables
            top_k: Maximum documents to return
        """
        self.base_threshold = base_threshold
        self.table_boost = table_boost
        self.top_k = top_k
    
    @component.output_types(documents=List[Any])
    def run(self, documents: List[Any], query: str = "") -> Dict[str, List[Any]]:
        """Filter and boost table-related documents."""
        if not documents:
            return {"documents": []}
        
        # Check if query is table-related
        is_table_query = self._is_table_query(query)
        
        # Apply table-aware scoring
        enhanced_docs = []
        for doc in documents:
            enhanced_doc = doc
            original_score = getattr(doc, 'score', 0.0) or 0.0
            
            # Boost score for table content
            if self._contains_table_content(doc):
                boosted_score = original_score + self.table_boost
                # Create a copy with boosted score
                enhanced_doc = type(doc)(
                    content=doc.content,
                    meta=doc.meta,
                    id=doc.id if hasattr(doc, 'id') else None
                )
                enhanced_doc.score = boosted_score
                
                logger.debug(f"Boosted table document score: {original_score:.3f} -> {boosted_score:.3f}")
            
            enhanced_docs.append(enhanced_doc)
        
        # Sort by enhanced scores
        enhanced_docs.sort(key=lambda d: getattr(d, "score", 0.0) or 0.0, reverse=True)
        
        # Apply threshold (lower for table queries)
        threshold = self.base_threshold if is_table_query else self.base_threshold * 2
        filtered = [doc for doc in enhanced_docs if (getattr(doc, "score", 0.0) or 0.0) >= threshold]
        
        # Ensure we always return at least the best document
        if not filtered and enhanced_docs:
            filtered = [enhanced_docs[0]]
            logger.info(f"No documents above threshold {threshold:.3f}, returning best document with score {getattr(enhanced_docs[0], 'score', 0.0):.3f}")
        
        # Apply top_k limit
        if self.top_k is not None:
            filtered = filtered[:self.top_k]
        
        logger.info(f"Table-aware filter: {len(documents)} -> {len(filtered)} documents (table query: {is_table_query})")
        
        return {"documents": filtered}
    
    def _is_table_query(self, query: str) -> bool:
        """Check if query is asking for table/tabular information."""
        query_lower = query.lower()
        table_keywords = [
            'table', 'rate', 'amount', 'level', 'allowance', 'schedule',
            'list', 'rates', 'amounts', 'levels', 'show me', 'what are'
        ]
        return any(keyword in query_lower for keyword in table_keywords)
    
    def _contains_table_content(self, doc) -> bool:
        """Check if document contains table content based on metadata and content."""
        # Check metadata first
        if hasattr(doc, 'meta') and doc.meta:
            if doc.meta.get('contains_table', False):
                return True
            if doc.meta.get('table_type'):
                return True
        
        # Check content for table indicators
        content = doc.content
        if not content:
            return False
        
        # Look for table structures
        if content.count('|') >= 4:  # Minimum for a simple table
            lines = content.split('\n')
            table_lines = sum(1 for line in lines if '|' in line and len(line.split('|')) >= 3)
            if table_lines >= 2:  # Header + data row
                return True
        
        return False


@component
class TableAwareQueryExpander:
    """Expand queries to better match table content."""
    
    def __init__(self):
        self.table_synonyms = {
            'hardship allowance': ['hardship', 'allowance', 'level', 'rate', 'monthly'],
            'travel allowance': ['travel', 'accommodation', 'meal', 'daily', 'per diem'],
            'rates': ['rate', 'amount', 'cost', 'price', 'fee'],
            'table': ['chart', 'list', 'schedule', 'breakdown']
        }
    
    @component.output_types(expanded_query=str, original_query=str)
    def run(self, query: str) -> Dict[str, str]:
        """Expand query with table-related terms."""
        expanded_terms = [query]
        query_lower = query.lower()
        
        # Add synonyms and related terms
        for concept, synonyms in self.table_synonyms.items():
            if concept in query_lower or any(syn in query_lower for syn in synonyms):
                expanded_terms.extend(synonyms)
        
        # Add generic table terms if query seems table-related
        if any(term in query_lower for term in ['show', 'what', 'list', 'table', 'rate', 'amount']):
            expanded_terms.extend(['table', 'chart', 'list'])
        
        expanded_query = ' OR '.join(set(expanded_terms))
        
        return {
            "expanded_query": expanded_query,
            "original_query": query
        }


def create_table_aware_query_pipeline(document_store, model: str = None) -> Pipeline:
    """Create an enhanced query pipeline optimized for table retrieval."""
    llm_model = model if model else settings.LLM_MODEL
    logger.info(f"Creating table-aware query pipeline with model: {llm_model}")
    
    pipeline = Pipeline()
    
    # Add query expander
    pipeline.add_component("query_expander", TableAwareQueryExpander())
    
    # Add embedder for query
    pipeline.add_component("embedder", OpenAITextEmbedder(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=settings.EMBEDDING_MODEL
    ))
    
    # Add retriever with higher top_k for better recall
    initial_top_k = settings.TOP_K_RETRIEVAL * 4  # Cast wider net
    
    if isinstance(document_store, InMemoryDocumentStore):
        pipeline.add_component("retriever", InMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=initial_top_k
        ))
    else:
        pipeline.add_component("retriever", PgvectorEmbeddingRetriever(
            document_store=document_store,
            top_k=initial_top_k
        ))
    
    # Add table-aware filter (more lenient than standard ScoreFilter)
    pipeline.add_component("table_filter", TableAwareRetrieverFilter(
        base_threshold=0.01,  # Much lower threshold
        table_boost=0.3,      # Significant boost for table content
        top_k=settings.TOP_K_RERANKING
    ))
    
    # Enhanced prompt template for table content
    prompt_template = """
You are a helpful AI assistant specializing in retrieving and presenting information from policy documents and tables.

GUIDELINES:
- When presenting table information, preserve the structure and format clearly
- For table queries, present data in an organized, readable format
- Include all relevant details from tables (rates, levels, descriptions, etc.)
- Be precise with numbers, dates, and categorical information
- If asked about specific table entries, provide complete context

Context Documents:
{% for doc in documents %}
---
Document Type: {{ doc.meta.table_type if doc.meta.contains_table else "Text" }}
{% if doc.meta.contains_table %}Table Rows: {{ doc.meta.table_row_count }}{% endif %}
Source: {{ doc.meta.source }}

{{ doc.content }}
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
    
    # Add generator
    generation_kwargs = {
        "max_completion_tokens": settings.MAX_TOKENS
    }
    
    if not llm_model.startswith(("o1-", "o4-")):
        generation_kwargs["temperature"] = 0.3  # Lower temperature for factual table data
    
    pipeline.add_component("generator", OpenAIGenerator(
        api_key=Secret.from_token(settings.OPENAI_API_KEY),
        model=llm_model,
        generation_kwargs=generation_kwargs
    ))
    
    # Enhanced answer builder
    pipeline.add_component("answer_builder", TableAwareAnswerBuilder())
    
    # Connect components
    pipeline.connect("query_expander.original_query", "embedder.text")
    pipeline.connect("embedder.embedding", "retriever.query_embedding")
    pipeline.connect("retriever.documents", "table_filter.documents")
    pipeline.connect("query_expander.original_query", "table_filter.query")
    pipeline.connect("table_filter.documents", "prompt_builder.documents")
    pipeline.connect("query_expander.original_query", "prompt_builder.question")
    pipeline.connect("prompt_builder.prompt", "generator.prompt")
    pipeline.connect("generator.replies", "answer_builder.replies")
    pipeline.connect("table_filter.documents", "answer_builder.documents")
    
    logger.info("Table-aware query pipeline created successfully")
    return pipeline


@component
class TableAwareAnswerBuilder:
    """Enhanced answer builder that highlights table content in sources."""
    
    @component.output_types(
        answer=str,
        sources=List[Dict[str, Any]],
        confidence_score=float,
        metadata=Dict[str, Any]
    )
    def run(self, replies: List[str], documents: List[Any]) -> Dict[str, Any]:
        """Format the answer with enhanced source information for tables."""
        answer = replies[0] if replies else ""
        
        sources = []
        seen_sources = set()
        
        for doc in documents[:8]:  # More sources for table content
            source = doc.meta.get("source", "Unknown")
            if source not in seen_sources:
                seen_sources.add(source)
                
                # Enhanced preview for table content
                content_preview = doc.content[:300]
                if doc.meta.get('contains_table', False):
                    # Try to show table structure in preview
                    lines = doc.content.split('\n')
                    table_lines = [line for line in lines if '|' in line][:3]  # First 3 table lines
                    if table_lines:
                        content_preview = '\n'.join(table_lines)
                        if len(content_preview) > 300:
                            content_preview = content_preview[:300] + "..."
                
                source_info = {
                    "source": source,
                    "title": doc.meta.get("title", source),
                    "content_preview": content_preview,
                    "metadata": doc.meta,
                    "is_table": doc.meta.get('contains_table', False),
                    "table_type": doc.meta.get('table_type'),
                    "table_rows": doc.meta.get('table_row_count', 0),
                    "relevance_score": float(getattr(doc, 'score', 0.0) or 0.0)
                }
                sources.append(source_info)
        
        # Calculate confidence for table queries
        table_sources = sum(1 for s in sources if s.get('is_table', False))
        confidence_score = min(0.9, 0.7 + (table_sources * 0.1)) if table_sources > 0 else 0.6
        
        # Build metadata
        metadata = {
            "retrieval_count": len(documents),
            "sources_count": len(sources),
            "table_sources_count": table_sources,
            "query_type": "table_query"
        }
        
        return {
            "answer": answer,
            "sources": sources,
            "confidence_score": confidence_score,
            "metadata": metadata
        }