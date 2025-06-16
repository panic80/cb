import logging
from typing import List, Dict, Any, Optional
from haystack import component
from app.core.config import settings

logger = logging.getLogger(__name__)

@component
class AnswerBuilder:
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
        """Build enhanced answer with confidence scoring and metadata."""
        answer = replies[0] if replies else ""
        confidence_score = self._calculate_confidence(documents, query_metadata)
        sources = self._format_sources(documents)
        response_metadata = self._build_response_metadata(documents, sources, query_metadata)
        
        return {
            "answer": answer,
            "sources": sources,
            "confidence_score": confidence_score,
            "metadata": response_metadata
        }

    def _format_sources(self, documents: List[Any]) -> List[Dict[str, Any]]:
        sources = []
        seen_sources = set()
        for doc in documents[:5]:
            source_name = doc.meta.get("source", "Unknown")
            if source_name not in seen_sources:
                seen_sources.add(source_name)
                sources.append({
                    "source": source_name,
                    "title": doc.meta.get("title", source_name),
                    "content_preview": doc.content[:200] + "..." if len(doc.content) > 200 else doc.content,
                    "relevance_score": float(getattr(doc, 'score', 0.0) or 0.0),
                    "confidence": float(self._calculate_source_confidence(doc)),
                    "source_type": doc.meta.get("content_type", "unknown"),
                    "metadata": doc.meta
                })
        return sources

    def _build_response_metadata(self, documents, sources, query_metadata) -> Dict[str, Any]:
        return {
            "retrieval_count": len(documents),
            "sources_count": len(sources),
            "query_expansion_used": query_metadata is not None,
            "expansion_details": query_metadata or {},
            "diversity_metrics": self._calculate_diversity_metrics(documents)
        }

    def _calculate_confidence(self, documents: List[Any], query_metadata: Optional[Dict[str, Any]] = None) -> float:
        if not documents:
            return 0.0
        avg_score = sum((getattr(doc, 'score', 0.5) or 0.5) for doc in documents) / len(documents)
        doc_count_factor = min(len(documents) / settings.TOP_K_RETRIEVAL, 1.0)
        unique_sources = len(set(doc.meta.get("source", "") for doc in documents))
        source_diversity = min(unique_sources / 3, 1.0)
        expansion_factor = 0.8 if query_metadata and (query_metadata.get("expansion_count") or 0) > 0 else 0.7
        weights = [0.4, 0.2, 0.2, 0.2]
        confidence = sum(f * w for f, w in zip([avg_score, doc_count_factor, source_diversity, expansion_factor], weights))
        return float(round(confidence, 2))

    def _calculate_source_confidence(self, doc: Any) -> float:
        score = getattr(doc, 'score', 0.5) or 0.5
        credibility = doc.meta.get("credibility_score", 0.7)
        length_factor = min(len(doc.content) / 1000, 1.0)
        return float(round(sum([score, credibility, length_factor]) / 3, 2))

    def _calculate_diversity_metrics(self, documents: List[Any]) -> Dict[str, Any]:
        if not documents:
            return {"source_types": 0, "unique_sources": 0, "content_diversity": 0.0}
        source_types = set(doc.meta.get("content_type", "unknown") for doc in documents)
        unique_sources = set(doc.meta.get("source", "unknown") for doc in documents)
        all_words = set()
        total_words = 0
        for doc in documents[:5]:
            words = set(doc.content.lower().split()[:50])
            all_words.update(words)
            total_words += len(words)
        content_diversity = len(all_words) / total_words if total_words > 0 else 0.0
        return {
            "source_types": len(source_types),
            "unique_sources": len(unique_sources),
            "content_diversity": round(content_diversity, 2)
        }