"""Query classification utilities for determining query types and characteristics."""

import logging
from typing import Dict, Set
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class QueryClassification:
    """Result of query classification."""
    query_type: str
    confidence: float
    detected_keywords: Set[str]
    characteristics: Dict[str, bool]


class QueryClassifier:
    """Classifies queries to determine appropriate processing pipelines."""
    
    def __init__(self):
        # Enhanced table-related keywords from the original implementation
        self.table_keywords = {
            # Basic table terms
            'table', 'chart', 'list', 'schedule', 'breakdown',
            
            # Data request terms
            'rate', 'rates', 'amount', 'amounts', 'level', 'levels',
            'allowance', 'allowances', 'cost', 'costs', 'price', 'prices',
            
            # Query patterns
            'show me', 'what are', 'list all', 'give me',
            
            # Specific allowance types
            'hardship allowance', 'travel allowance', 'per diem',
            'accommodation', 'meal', 'monthly', 'daily',
            
            # Level indicators
            'level 1', 'level 2', 'level 3', 'level 4', 'level 5', 'level 6',
            'austere',
            
            # Financial terms
            'dollar', 'dollars', '$', 'USD', 'CAD',
            
            # Comparative terms
            'compare', 'comparison', 'versus', 'vs', 'difference'
        }
        
        # Keywords that suggest analytical queries
        self.analytical_keywords = {
            'analyze', 'analysis', 'explain', 'why', 'how',
            'reason', 'cause', 'impact', 'effect', 'trend'
        }
        
        # Keywords that suggest factual/lookup queries
        self.factual_keywords = {
            'what is', 'when is', 'where is', 'who is',
            'define', 'definition', 'meaning'
        }
    
    def classify(self, query: str) -> QueryClassification:
        """
        Classify a query to determine its type and characteristics.
        
        Args:
            query: The query string to classify
            
        Returns:
            QueryClassification object with type and characteristics
        """
        query_lower = query.lower().strip()
        
        # Detect table-related queries
        table_matches = self._find_keyword_matches(query_lower, self.table_keywords)
        analytical_matches = self._find_keyword_matches(query_lower, self.analytical_keywords)
        factual_matches = self._find_keyword_matches(query_lower, self.factual_keywords)
        
        # Determine primary query type
        if table_matches:
            query_type = "table_query"
            confidence = min(0.9, 0.5 + len(table_matches) * 0.1)
        elif analytical_matches:
            query_type = "analytical_query"
            confidence = 0.7
        elif factual_matches:
            query_type = "factual_query"
            confidence = 0.6
        else:
            query_type = "general_query"
            confidence = 0.5
        
        # Determine query characteristics
        characteristics = {
            "requires_tables": bool(table_matches),
            "requires_analysis": bool(analytical_matches),
            "is_factual_lookup": bool(factual_matches),
            "is_comparative": self._is_comparative_query(query_lower),
            "is_numerical": self._is_numerical_query(query_lower),
            "is_specific_lookup": self._is_specific_lookup(query_lower),
        }
        
        all_matches = table_matches | analytical_matches | factual_matches
        
        return QueryClassification(
            query_type=query_type,
            confidence=confidence,
            detected_keywords=all_matches,
            characteristics=characteristics
        )
    
    def is_table_query(self, query: str) -> bool:
        """
        Simple boolean check if query is table-related.
        Maintains compatibility with existing code.
        """
        classification = self.classify(query)
        return classification.query_type == "table_query"
    
    def get_recommended_pipeline_config(self, query: str) -> Dict[str, bool]:
        """
        Get recommended pipeline configuration based on query classification.
        
        Args:
            query: The query string to analyze
            
        Returns:
            Dictionary with recommended pipeline settings
        """
        classification = self.classify(query)
        
        config = {
            "use_table_aware_pipeline": classification.query_type == "table_query",
            "use_enhanced_pipeline": classification.query_type in ["analytical_query", "table_query"],
            "enable_query_expansion": classification.characteristics.get("requires_analysis", False),
            "enable_source_filtering": classification.characteristics.get("is_specific_lookup", False),
            "enable_diversity_ranking": classification.query_type == "general_query",
            "lower_similarity_threshold": classification.characteristics.get("requires_tables", False),
        }
        
        return config
    
    def _find_keyword_matches(self, query: str, keywords: Set[str]) -> Set[str]:
        """Find which keywords from a set are present in the query."""
        matches = set()
        for keyword in keywords:
            if keyword in query:
                matches.add(keyword)
        return matches
    
    def _is_comparative_query(self, query: str) -> bool:
        """Check if query is asking for comparisons."""
        comparative_indicators = [
            'compare', 'comparison', 'versus', 'vs', 'vs.', 
            'difference', 'differences', 'better', 'worse',
            'higher', 'lower', 'more', 'less'
        ]
        return any(indicator in query for indicator in comparative_indicators)
    
    def _is_numerical_query(self, query: str) -> bool:
        """Check if query is asking for numerical data."""
        numerical_indicators = [
            'how much', 'how many', 'amount', 'rate', 'cost',
            'price', 'number', 'count', 'total', 'sum',
            '$', 'dollar', 'percent', '%'
        ]
        return any(indicator in query for indicator in numerical_indicators)
    
    def _is_specific_lookup(self, query: str) -> bool:
        """Check if query is looking for specific information."""
        specific_indicators = [
            'level', 'hardship', 'travel allowance', 'per diem',
            'accommodation', 'meal', 'specific', 'particular'
        ]
        return any(indicator in query for indicator in specific_indicators)


def create_query_classifier() -> QueryClassifier:
    """Factory function to create a configured query classifier."""
    return QueryClassifier()