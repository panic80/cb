import logging
from typing import List, Any, Dict
from haystack import component

logger = logging.getLogger(__name__)

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
        self.diversity_threshold = diversity_threshold
        self.top_k = top_k
        self.similarity_model = similarity_model
        logger.info(f"Initialized DiversityRanker with threshold: {diversity_threshold}")
    
    @component.output_types(documents=List[Any])
    def run(self, documents: List[Any]) -> Dict[str, List[Any]]:
        if not documents or len(documents) <= self.top_k:
            return {"documents": documents or []}
        
        selected = []
        selected_contents = []
        
        for doc in documents:
            if len(selected) >= self.top_k:
                break
            if self._is_diverse(doc.content, selected_contents):
                selected.append(doc)
                selected_contents.append(doc.content)
        
        if len(selected) < self.top_k:
            for doc in documents:
                if doc not in selected and len(selected) < self.top_k:
                    selected.append(doc)
        
        logger.info(f"Selected {len(selected)} diverse documents from {len(documents)}")
        return {"documents": selected}
    
    def _is_diverse(self, content: str, selected_contents: List[str]) -> bool:
        if not selected_contents:
            return True
        for selected in selected_contents:
            if self._compute_similarity(content, selected) > self.diversity_threshold:
                return False
        return True
    
    def _compute_similarity(self, text1: str, text2: str) -> float:
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        if not words1 or not words2:
            return 0.0
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        return intersection / union if union > 0 else 0.0