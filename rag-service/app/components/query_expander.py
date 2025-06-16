import logging
from typing import List, Dict, Any, Optional
from haystack import component
from haystack.components.generators import OpenAIGenerator
from haystack.utils import Secret
import json

from app.core.config import settings

logger = logging.getLogger(__name__)


@component
class QueryExpander:
    """
    Expands user queries using LLM to generate related queries for improved recall.
    Supports different expansion strategies: synonyms, subtopics, and related concepts.
    """
    
    def __init__(
        self,
        model: str = None,
        expansion_strategy: str = "comprehensive",
        max_expansions: int = 3,
        api_key: str = None
    ):
        """
        Initialize the query expander.
        
        Args:
            model: LLM model to use for expansion
            expansion_strategy: Strategy for expansion (comprehensive, focused, broad)
            max_expansions: Maximum number of expanded queries to generate
            api_key: OpenAI API key
        """
        self.model = model or settings.LLM_MODEL
        self.expansion_strategy = expansion_strategy
        self.max_expansions = max_expansions
        
        # Initialize generator - some models don't support custom temperature
        generation_kwargs = {
            "max_completion_tokens": 200
        }
        
        # Only add temperature for models that support it
        if not self.model.startswith(("o1-", "o4-")):
            generation_kwargs["temperature"] = 0.7
        
        self.generator = OpenAIGenerator(
            api_key=Secret.from_token(api_key or settings.OPENAI_API_KEY),
            model=self.model,
            generation_kwargs=generation_kwargs
        )
        
        # Define expansion prompts by strategy
        self.expansion_prompts = {
            "comprehensive": """Generate {max_expansions} alternative search queries for the following user query.
Include:
1. Synonymous phrases using different terminology
2. More specific sub-questions
3. Related broader concepts

User query: "{query}"

Return ONLY a JSON array of expanded queries, nothing else.
Example format: ["query 1", "query 2", "query 3"]""",
            
            "focused": """Generate {max_expansions} more specific search queries for the following user query.
Break down the query into focused sub-questions that target specific aspects.

User query: "{query}"

Return ONLY a JSON array of expanded queries, nothing else.""",
            
            "broad": """Generate {max_expansions} broader search queries for the following user query.
Include related concepts and contextual variations.

User query: "{query}"

Return ONLY a JSON array of expanded queries, nothing else.""",
            
            "technical": """Generate {max_expansions} technical variations of the following query.
Include technical terms, acronyms, and domain-specific language.

User query: "{query}"

Return ONLY a JSON array of expanded queries, nothing else."""
        }
        
        logger.info(f"Initialized QueryExpander with strategy: {expansion_strategy}")
    
    @component.output_types(
        queries=List[str],
        original_query=str,
        expansion_metadata=Dict[str, Any]
    )
    def run(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None,
        custom_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Expand the user query into multiple related queries.
        
        Args:
            query: Original user query
            context: Optional context for query expansion
            custom_prompt: Optional custom expansion prompt
            
        Returns:
            Dictionary with expanded queries and metadata
        """
        try:
            # Select or build prompt
            if custom_prompt:
                prompt = custom_prompt.format(query=query, max_expansions=self.max_expansions)
            else:
                prompt_template = self.expansion_prompts.get(
                    self.expansion_strategy,
                    self.expansion_prompts["comprehensive"]
                )
                prompt = prompt_template.format(
                    query=query,
                    max_expansions=self.max_expansions
                )
            
            # Add context if provided
            if context:
                context_str = "\n".join([f"{k}: {v}" for k, v in context.items()])
                prompt += f"\n\nAdditional context:\n{context_str}"
            
            # Generate expansions
            result = self.generator.run(prompt=prompt)
            response = result["replies"][0]
            
            # Parse expanded queries
            expanded_queries = self._parse_expanded_queries(response)
            
            # Add original query if not already included
            if query not in expanded_queries:
                expanded_queries.insert(0, query)
            else:
                # Move original query to first position
                expanded_queries.remove(query)
                expanded_queries.insert(0, query)
            
            # Limit to max_expansions + 1 (original)
            expanded_queries = expanded_queries[:self.max_expansions + 1]
            
            logger.info(f"Expanded query '{query}' into {len(expanded_queries)} queries")
            
            return {
                "queries": expanded_queries,
                "original_query": query,
                "expansion_metadata": {
                    "strategy": self.expansion_strategy,
                    "expansion_count": len(expanded_queries) - 1,
                    "model": self.model
                }
            }
            
        except Exception as e:
            logger.error(f"Error expanding query: {e}", exc_info=True)
            # Return original query on error
            return {
                "queries": [query],
                "original_query": query,
                "expansion_metadata": {
                    "strategy": self.expansion_strategy,
                    "expansion_count": 0,
                    "error": str(e)
                }
            }
    
    def _parse_expanded_queries(self, response: str) -> List[str]:
        """Parse the LLM response to extract expanded queries."""
        try:
            # Try to parse as JSON
            # Clean up response to extract JSON array
            response = response.strip()
            
            # Find JSON array in response
            start_idx = response.find('[')
            end_idx = response.rfind(']')
            
            if start_idx != -1 and end_idx != -1:
                json_str = response[start_idx:end_idx + 1]
                queries = json.loads(json_str)
                
                # Validate and clean queries
                if isinstance(queries, list):
                    cleaned_queries = []
                    for q in queries:
                        if isinstance(q, str) and q.strip():
                            cleaned_queries.append(q.strip())
                    return cleaned_queries
            
            # Fallback: try to split by newlines
            lines = response.split('\n')
            queries = []
            
            for line in lines:
                line = line.strip()
                # Remove common prefixes
                for prefix in ['- ', '* ', '1. ', '2. ', '3. ', '• ']:
                    if line.startswith(prefix):
                        line = line[len(prefix):]
                        break
                
                # Remove quotes
                line = line.strip('"\'')
                
                if line and len(line) > 5:  # Minimum query length
                    queries.append(line)
            
            return queries[:self.max_expansions]
            
        except Exception as e:
            logger.warning(f"Failed to parse expanded queries: {e}")
            return []


@component
class MultiQueryRetriever:
    """
    Performs retrieval using multiple queries and aggregates results.
    Useful for comprehensive search when combined with QueryExpander.
    """
    
    def __init__(
        self,
        aggregation_method: str = "reciprocal_rank_fusion",
        top_k_per_query: int = 5,
        deduplication: bool = True
    ):
        """
        Initialize the multi-query retriever.
        
        Args:
            aggregation_method: Method for aggregating results (reciprocal_rank_fusion, max_score, weighted)
            top_k_per_query: Number of documents to retrieve per query
            deduplication: Whether to deduplicate results across queries
        """
        self.aggregation_method = aggregation_method
        self.top_k_per_query = top_k_per_query
        self.deduplication = deduplication
        
        logger.info(f"Initialized MultiQueryRetriever with method: {aggregation_method}")
    
    @component.output_types(documents=List[Dict[str, Any]])
    def run(
        self,
        queries: List[str],
        retriever_results: List[List[Dict[str, Any]]],
        query_weights: Optional[List[float]] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Aggregate results from multiple queries.
        
        Args:
            queries: List of queries used for retrieval
            retriever_results: List of retrieval results for each query
            query_weights: Optional weights for each query
            
        Returns:
            Dictionary with aggregated documents
        """
        if not retriever_results:
            return {"documents": []}
        
        # Default equal weights if not provided
        if not query_weights:
            query_weights = [1.0] * len(queries)
        
        # Aggregate based on method
        if self.aggregation_method == "reciprocal_rank_fusion":
            aggregated = self._reciprocal_rank_fusion(
                queries, retriever_results, query_weights
            )
        elif self.aggregation_method == "max_score":
            aggregated = self._max_score_aggregation(
                queries, retriever_results, query_weights
            )
        elif self.aggregation_method == "weighted":
            aggregated = self._weighted_aggregation(
                queries, retriever_results, query_weights
            )
        else:
            logger.warning(f"Unknown aggregation method: {self.aggregation_method}")
            aggregated = retriever_results[0] if retriever_results else []
        
        # Deduplicate if requested
        if self.deduplication:
            aggregated = self._deduplicate_documents(aggregated)
        
        return {"documents": aggregated}
    
    def _reciprocal_rank_fusion(
        self,
        queries: List[str],
        results: List[List[Dict[str, Any]]],
        weights: List[float]
    ) -> List[Dict[str, Any]]:
        """Aggregate using reciprocal rank fusion."""
        doc_scores = {}
        doc_objects = {}
        
        k = 60  # Constant for RRF
        
        for query_idx, (query, query_results, weight) in enumerate(zip(queries, results, weights)):
            for rank, doc in enumerate(query_results):
                doc_id = doc.get("id", doc.get("content", "")[:100])  # Use ID or content snippet
                
                # Calculate RRF score
                rrf_score = weight / (k + rank + 1)
                
                if doc_id not in doc_scores:
                    doc_scores[doc_id] = 0
                    doc_objects[doc_id] = doc
                
                doc_scores[doc_id] += rrf_score
                
                # Track which queries retrieved this document
                if "retrieved_by_queries" not in doc_objects[doc_id]:
                    doc_objects[doc_id]["retrieved_by_queries"] = []
                doc_objects[doc_id]["retrieved_by_queries"].append(query_idx)
        
        # Sort by aggregated score
        sorted_docs = sorted(
            doc_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Return documents with aggregated scores
        result_docs = []
        for doc_id, score in sorted_docs:
            doc = doc_objects[doc_id].copy()
            doc["aggregated_score"] = score
            doc["retrieval_count"] = len(doc["retrieved_by_queries"])
            result_docs.append(doc)
        
        return result_docs
    
    def _max_score_aggregation(
        self,
        queries: List[str],
        results: List[List[Dict[str, Any]]],
        weights: List[float]
    ) -> List[Dict[str, Any]]:
        """Aggregate by taking maximum score across queries."""
        doc_scores = {}
        doc_objects = {}
        
        for query_idx, (query, query_results, weight) in enumerate(zip(queries, results, weights)):
            for doc in query_results:
                doc_id = doc.get("id", doc.get("content", "")[:100])
                doc_score = doc.get("score", 1.0) * weight
                
                if doc_id not in doc_scores:
                    doc_scores[doc_id] = doc_score
                    doc_objects[doc_id] = doc
                else:
                    # Take maximum score
                    doc_scores[doc_id] = max(doc_scores[doc_id], doc_score)
        
        # Sort by score
        sorted_docs = sorted(
            doc_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Return documents
        result_docs = []
        for doc_id, score in sorted_docs:
            doc = doc_objects[doc_id].copy()
            doc["aggregated_score"] = score
            result_docs.append(doc)
        
        return result_docs
    
    def _weighted_aggregation(
        self,
        queries: List[str],
        results: List[List[Dict[str, Any]]],
        weights: List[float]
    ) -> List[Dict[str, Any]]:
        """Aggregate using weighted sum of scores."""
        doc_scores = {}
        doc_objects = {}
        
        for query_idx, (query, query_results, weight) in enumerate(zip(queries, results, weights)):
            for doc in query_results:
                doc_id = doc.get("id", doc.get("content", "")[:100])
                doc_score = doc.get("score", 1.0) * weight
                
                if doc_id not in doc_scores:
                    doc_scores[doc_id] = 0
                    doc_objects[doc_id] = doc
                
                doc_scores[doc_id] += doc_score
        
        # Sort by aggregated score
        sorted_docs = sorted(
            doc_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )
        
        # Return documents
        result_docs = []
        for doc_id, score in sorted_docs:
            doc = doc_objects[doc_id].copy()
            doc["aggregated_score"] = score
            result_docs.append(doc)
        
        return result_docs
    
    def _deduplicate_documents(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate documents based on content similarity."""
        if not documents:
            return []
        
        seen_content = set()
        deduplicated = []
        
        for doc in documents:
            # Create content fingerprint (first 200 chars)
            content = doc.get("content", "")[:200].strip().lower()
            
            if content not in seen_content:
                seen_content.add(content)
                deduplicated.append(doc)
        
        return deduplicated