import logging
from typing import List, Dict, Any, Optional
from haystack import component, Document

logger = logging.getLogger(__name__)


@component
class SourceAwareRetriever:
    """
    A retriever component that filters and prioritizes documents based on source metadata.
    Supports source type filtering, source credibility scoring, and cross-source balancing.
    """
    
    def __init__(
        self,
        source_weights: Optional[Dict[str, float]] = None,
        source_types: Optional[List[str]] = None,
        balance_sources: bool = True,
        max_per_source: int = 2,
        credibility_scores: Optional[Dict[str, float]] = None
    ):
        """
        Initialize the source-aware retriever.
        
        Args:
            source_weights: Dictionary mapping source types to weight multipliers
            source_types: List of allowed source types (None means all)
            balance_sources: Whether to balance results across different sources
            max_per_source: Maximum documents per source when balancing
            credibility_scores: Dictionary mapping source patterns to credibility scores
        """
        self.source_weights = source_weights or {}
        self.source_types = source_types
        self.balance_sources = balance_sources
        self.max_per_source = max_per_source
        self.credibility_scores = credibility_scores or {}
        
        # Default source type weights if not specified
        self.default_weights = {
            "pdf": 1.0,
            "docx": 1.0,
            "html": 0.9,
            "markdown": 0.95,
            "csv": 0.8,
            "txt": 0.7,
            "url": 0.85
        }
        
        logger.info(f"Initialized SourceAwareRetriever with balance_sources={balance_sources}")
    
    @component.output_types(documents=List[Document])
    def run(
        self,
        documents: List[Document],
        source_filters: Optional[Dict[str, Any]] = None,
        preferred_sources: Optional[List[str]] = None
    ) -> Dict[str, List[Document]]:
        """
        Filter and rerank documents based on source metadata.
        
        Args:
            documents: List of retrieved documents
            source_filters: Additional filters to apply (e.g., {"source_type": "pdf"})
            preferred_sources: List of preferred source names/patterns
            
        Returns:
            Dictionary with filtered and reranked documents
        """
        if not documents:
            return {"documents": []}
        
        # Apply source type filtering
        filtered_docs = self._filter_by_source_type(documents, source_filters)
        
        # Apply source scoring and weighting
        scored_docs = self._apply_source_scoring(filtered_docs, preferred_sources)
        
        # Balance sources if requested
        if self.balance_sources:
            balanced_docs = self._balance_sources(scored_docs)
        else:
            balanced_docs = scored_docs
        
        # Sort by final score
        balanced_docs.sort(key=lambda d: d.score, reverse=True)
        
        logger.info(f"Source-aware retrieval: {len(documents)} -> {len(balanced_docs)} documents")
        
        return {"documents": balanced_docs}
    
    def _filter_by_source_type(
        self,
        documents: List[Document],
        source_filters: Optional[Dict[str, Any]] = None
    ) -> List[Document]:
        """Filter documents by source type."""
        if not self.source_types and not source_filters:
            return documents
        
        filtered = []
        for doc in documents:
            # Check configured source types
            if self.source_types:
                doc_type = self._get_source_type(doc)
                if doc_type not in self.source_types:
                    continue
            
            # Check additional filters
            if source_filters:
                if not self._matches_filters(doc, source_filters):
                    continue
            
            filtered.append(doc)
        
        return filtered
    
    def _apply_source_scoring(
        self,
        documents: List[Document],
        preferred_sources: Optional[List[str]] = None
    ) -> List[Document]:
        """Apply source-based scoring to documents."""
        scored_docs = []
        
        for doc in documents:
            # Get base score (from retrieval)
            base_score = getattr(doc, 'score', 1.0)
            
            # Apply source type weight
            source_type = self._get_source_type(doc)
            type_weight = self.source_weights.get(
                source_type,
                self.default_weights.get(source_type, 1.0)
            )
            
            # Apply credibility score
            credibility = self._get_credibility_score(doc)
            
            # Apply preference boost
            preference_boost = 1.0
            if preferred_sources:
                source_name = doc.meta.get("source", "")
                if any(pref in source_name for pref in preferred_sources):
                    preference_boost = 1.5
            
            # Calculate final score - handle None base_score
            base_score = base_score if base_score is not None else 0.5
            final_score = base_score * type_weight * credibility * preference_boost
            
            # Create new document with updated score
            scored_doc = Document(
                content=doc.content,
                meta=doc.meta,
                score=final_score
            )
            scored_docs.append(scored_doc)
        
        return scored_docs
    
    def _balance_sources(self, documents: List[Document]) -> List[Document]:
        """Balance documents across different sources."""
        # Group documents by source
        source_groups = {}
        for doc in documents:
            source = doc.meta.get("source", "unknown")
            if source not in source_groups:
                source_groups[source] = []
            source_groups[source].append(doc)
        
        # Select top documents from each source
        balanced = []
        for source, docs in source_groups.items():
            # Sort by score within source
            docs.sort(key=lambda d: d.score, reverse=True)
            # Take up to max_per_source documents
            balanced.extend(docs[:self.max_per_source])
        
        return balanced
    
    def _get_source_type(self, doc: Document) -> str:
        """Extract source type from document metadata."""
        # Check content_type first
        content_type = doc.meta.get("content_type", "")
        if content_type:
            if "pdf" in content_type:
                return "pdf"
            elif "html" in content_type:
                return "html"
            elif "markdown" in content_type:
                return "markdown"
            elif "csv" in content_type:
                return "csv"
            elif "docx" in content_type or "word" in content_type:
                return "docx"
            elif "xlsx" in content_type or "excel" in content_type:
                return "xlsx"
        
        # Check filename/source
        source = doc.meta.get("source", "").lower()
        filename = doc.meta.get("filename", "").lower()
        
        for name in [source, filename]:
            if name.endswith(".pdf"):
                return "pdf"
            elif name.endswith(".html") or name.endswith(".htm"):
                return "html"
            elif name.endswith(".md") or name.endswith(".markdown"):
                return "markdown"
            elif name.endswith(".csv"):
                return "csv"
            elif name.endswith(".docx") or name.endswith(".doc"):
                return "docx"
            elif name.endswith(".xlsx") or name.endswith(".xls"):
                return "xlsx"
            elif name.endswith(".txt"):
                return "txt"
            elif name.startswith("http://") or name.startswith("https://"):
                return "url"
        
        return "unknown"
    
    def _get_credibility_score(self, doc: Document) -> float:
        """Calculate credibility score for a document based on source patterns."""
        source = doc.meta.get("source", "").lower()
        
        # Check credibility patterns
        for pattern, score in self.credibility_scores.items():
            if pattern.lower() in source:
                return score
        
        # Default credibility based on source type
        source_type = self._get_source_type(doc)
        type_credibility = {
            "pdf": 0.95,      # Usually official documents
            "docx": 0.9,      # Formal documents
            "markdown": 0.85, # Technical docs
            "html": 0.8,      # Web content
            "url": 0.8,       # Web content
            "csv": 0.9,       # Structured data
            "txt": 0.7,       # Plain text
            "unknown": 0.5
        }
        
        return type_credibility.get(source_type, 0.7)
    
    def _matches_filters(self, doc: Document, filters: Dict[str, Any]) -> bool:
        """Check if document matches the given filters."""
        for key, value in filters.items():
            doc_value = doc.meta.get(key)
            
            # Handle different filter types
            if isinstance(value, list):
                if doc_value not in value:
                    return False
            elif isinstance(value, dict):
                # Handle complex filters (e.g., range queries)
                if "gte" in value and doc_value < value["gte"]:
                    return False
                if "lte" in value and doc_value > value["lte"]:
                    return False
                if "contains" in value and value["contains"] not in str(doc_value):
                    return False
            else:
                if doc_value != value:
                    return False
        
        return True