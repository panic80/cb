from typing import List, Dict, Any

from haystack import component


@component
class ScoreFilter:
    """Filter documents by similarity score and (optionally) cap their number.

    This lightweight component can be dropped anywhere in a Haystack pipeline
    between a retriever and the downstream consumers (ranker / prompt builder),
    removing low-similarity hits that introduce noise once the corpus grows.
    """

    def __init__(self, threshold: float = 0.15, top_k: int | None = None):
        """Create a new ScoreFilter.

        Args:
            threshold:  Minimum `Document.score` a document must have to be kept.
            top_k:      If given, keep at most the *k* best-scored documents *after*
                        threshold filtering (useful when the retriever’s `top_k`
                        is intentionally set high).
        """
        self.threshold = threshold
        self.top_k = top_k

    @component.output_types(documents=List[Any])
    def run(self, documents: List[Any]) -> Dict[str, List[Any]]:  # type: ignore[override]
        if not documents:
            return {"documents": []}

        # 1. Sort by score (desc) first so we can keep highest even if below threshold.
        documents.sort(key=lambda d: getattr(d, "score", 0.0), reverse=True)

        # 2. Apply threshold.
        filtered = [doc for doc in documents if getattr(doc, "score", 0.0) >= self.threshold]

        # 3. Fallback – if nothing passes the threshold, keep the single best doc so
        #    that the pipeline still receives some context.
        if not filtered and documents:
            filtered = [documents[0]]

        # 4. Cap to top_k if requested.
        if self.top_k is not None:
            filtered = filtered[: self.top_k]

        return {"documents": filtered}
