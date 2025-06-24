"""
Table Query Rewriter component for table-aware retrieval.

This module provides a query rewriter that optimizes queries
for retrieving table-based content in travel documents.
"""

from typing import List, Dict, Any, Optional
import logging
import re

from langchain_core.language_models import BaseLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from app.components.base import BaseComponent
from app.core.logging import get_logger
from app.utils.retry import with_retry_async

logger = get_logger(__name__)


class RewrittenQuery(BaseModel):
    """Model for rewritten query output."""
    
    original_query: str = Field(description="Original user query")
    rewritten_query: str = Field(description="Rewritten query optimized for tables")
    table_keywords: List[str] = Field(description="Keywords to find in tables")
    value_patterns: List[str] = Field(description="Value patterns to search for")
    
    
TABLE_REWRITE_PROMPT = PromptTemplate(
    template="""You are a query rewriter specialized in Canadian Forces travel documents.
Your task is to rewrite queries to better find information in tables.

Original Query: {query}

Consider that travel documents often contain tables with:
- Meal allowances by location
- Kilometric rates by province
- Per diem rates by city
- Accommodation limits
- Travel time calculations

Rewrite the query to:
1. Include table-specific keywords (rate, table, schedule, appendix)
2. Extract specific values or ranges being searched for
3. Add relevant location or category terms
4. Include both singular and plural forms

{format_instructions}

Rewritten Query:""",
    input_variables=["query"],
    partial_variables={}
)


class TableQueryRewriter(BaseComponent):
    """
    Query rewriter optimized for table-based content retrieval.
    
    Enhances queries to better match table structures and content
    in travel documents.
    """
    
    def __init__(
        self,
        llm: Optional[BaseLLM] = None
    ):
        """
        Initialize the table query rewriter.
        
        Args:
            llm: Language model for query rewriting
        """
        super().__init__(component_type="rewriter", component_name="table_query")
        
        self.llm = llm
        self.parser = PydanticOutputParser(pydantic_object=RewrittenQuery)
        
        # Update prompt with format instructions
        self.prompt = TABLE_REWRITE_PROMPT.copy()
        self.prompt.partial_variables["format_instructions"] = self.parser.get_format_instructions()
        
        logger.info("Initialized table query rewriter")
    
    def rewrite_query(self, query: str) -> Dict[str, Any]:
        """
        Rewrite query for better table retrieval.
        
        Args:
            query: Original query
            
        Returns:
            Dictionary with rewritten query and metadata
        """
        # Quick rewrite for common patterns
        quick_rewrite = self._quick_rewrite(query)
        if quick_rewrite:
            return quick_rewrite
        
        # Use LLM for complex queries if available
        if self.llm:
            try:
                return self._llm_rewrite(query)
            except Exception as e:
                logger.warning(f"LLM rewrite failed: {e}, falling back to rule-based")
        
        # Fallback to rule-based rewrite
        return self._rule_based_rewrite(query)
    
    async def arewrite_query(self, query: str) -> Dict[str, Any]:
        """
        Async rewrite query for better table retrieval.
        
        Args:
            query: Original query
            
        Returns:
            Dictionary with rewritten query and metadata
        """
        # Quick rewrite for common patterns
        quick_rewrite = self._quick_rewrite(query)
        if quick_rewrite:
            return quick_rewrite
        
        # Use LLM for complex queries if available
        if self.llm:
            try:
                return await self._llm_rewrite_async(query)
            except Exception as e:
                logger.warning(f"LLM rewrite failed: {e}, falling back to rule-based")
        
        # Fallback to rule-based rewrite
        return self._rule_based_rewrite(query)
    
    def _quick_rewrite(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Quick pattern-based rewrite for common queries.
        
        Args:
            query: Original query
            
        Returns:
            Rewrite result or None
        """
        query_lower = query.lower()
        
        # Common table-related queries
        patterns = {
            r"meal.*(?:rate|allowance).*(\w+)": {
                "keywords": ["meal", "rate", "table", "allowance", "breakfast", "lunch", "dinner"],
                "template": "meal allowance rate table {location}"
            },
            r"(?:kilometric|km|mileage).*rate": {
                "keywords": ["kilometric", "rate", "table", "km", "per", "kilometer"],
                "template": "kilometric rate table schedule mileage"
            },
            r"per diem.*(\w+)": {
                "keywords": ["per diem", "daily", "rate", "allowance", "table"],
                "template": "per diem rate table {location}"
            },
            r"(?:hotel|accommodation).*(?:limit|rate)": {
                "keywords": ["accommodation", "hotel", "limit", "rate", "table", "maximum"],
                "template": "accommodation hotel limit rate table"
            }
        }
        
        for pattern, config in patterns.items():
            match = re.search(pattern, query_lower)
            if match:
                # Extract location if present
                location = match.group(1) if match.lastindex else ""
                
                rewritten = config["template"].format(location=location)
                
                return {
                    "original_query": query,
                    "rewritten_query": rewritten,
                    "table_keywords": config["keywords"],
                    "value_patterns": self._extract_value_patterns(query),
                    "method": "quick_rewrite"
                }
        
        return None
    
    def _llm_rewrite(self, query: str) -> Dict[str, Any]:
        """
        Use LLM to rewrite query.
        
        Args:
            query: Original query
            
        Returns:
            Rewrite result
        """
        # Format prompt
        prompt_text = self.prompt.format(query=query)
        
        # Get LLM response
        response = self.llm.invoke(prompt_text)
        
        # Parse response
        try:
            result = self.parser.parse(response.content)
            return {
                "original_query": result.original_query,
                "rewritten_query": result.rewritten_query,
                "table_keywords": result.table_keywords,
                "value_patterns": result.value_patterns,
                "method": "llm_rewrite"
            }
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise
    
    @with_retry_async
    async def _llm_rewrite_async(self, query: str) -> Dict[str, Any]:
        """
        Async use LLM to rewrite query.
        
        Args:
            query: Original query
            
        Returns:
            Rewrite result
        """
        # Format prompt
        prompt_text = self.prompt.format(query=query)
        
        # Get LLM response
        response = await self.llm.ainvoke(prompt_text)
        
        # Parse response
        try:
            result = self.parser.parse(response.content)
            return {
                "original_query": result.original_query,
                "rewritten_query": result.rewritten_query,
                "table_keywords": result.table_keywords,
                "value_patterns": result.value_patterns,
                "method": "llm_rewrite"
            }
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise
    
    def _rule_based_rewrite(self, query: str) -> Dict[str, Any]:
        """
        Rule-based query rewriting.
        
        Args:
            query: Original query
            
        Returns:
            Rewrite result
        """
        query_lower = query.lower()
        keywords = []
        additions = []
        
        # Add table-related keywords
        if not any(word in query_lower for word in ["table", "schedule", "appendix", "rate"]):
            additions.append("table")
        
        # Detect query intent and add relevant keywords
        if any(word in query_lower for word in ["meal", "breakfast", "lunch", "dinner"]):
            keywords.extend(["meal", "allowance", "rate", "food"])
            additions.append("meal rate table")
            
        if any(word in query_lower for word in ["hotel", "accommodation", "lodging"]):
            keywords.extend(["accommodation", "hotel", "limit", "rate"])
            additions.append("accommodation limit table")
            
        if any(word in query_lower for word in ["km", "kilometer", "mileage", "driving"]):
            keywords.extend(["kilometric", "rate", "km", "mileage"])
            additions.append("kilometric rate table")
            
        if "per diem" in query_lower or "daily" in query_lower:
            keywords.extend(["per diem", "daily", "rate", "allowance"])
            additions.append("per diem rate table")
        
        # Extract locations
        locations = self._extract_locations(query)
        if locations:
            keywords.extend(locations)
        
        # Build rewritten query
        rewritten_parts = [query]
        if additions:
            rewritten_parts.extend(additions)
        
        rewritten_query = " ".join(rewritten_parts)
        
        # Extract value patterns
        value_patterns = self._extract_value_patterns(query)
        
        return {
            "original_query": query,
            "rewritten_query": rewritten_query,
            "table_keywords": list(set(keywords)),
            "value_patterns": value_patterns,
            "method": "rule_based"
        }
    
    def _extract_locations(self, query: str) -> List[str]:
        """
        Extract location names from query.
        
        Args:
            query: Query text
            
        Returns:
            List of locations
        """
        locations = []
        query_lower = query.lower()
        
        # Canadian provinces and territories
        provinces = [
            "ontario", "quebec", "british columbia", "alberta", "manitoba",
            "saskatchewan", "nova scotia", "new brunswick", "newfoundland",
            "prince edward island", "northwest territories", "yukon", "nunavut"
        ]
        
        # Major cities
        cities = [
            "ottawa", "toronto", "montreal", "vancouver", "calgary", "edmonton",
            "winnipeg", "halifax", "quebec city", "victoria", "regina", "saskatoon",
            "st. john's", "charlottetown", "yellowknife", "whitehorse", "iqaluit"
        ]
        
        # Check for provinces
        for province in provinces:
            if province in query_lower:
                locations.append(province)
        
        # Check for cities
        for city in cities:
            if city in query_lower:
                locations.append(city)
        
        # Check for country names
        if "canada" in query_lower:
            locations.append("canada")
        if any(us in query_lower for us in ["united states", "usa", "u.s."]):
            locations.append("united states")
        
        return locations
    
    def _extract_value_patterns(self, query: str) -> List[str]:
        """
        Extract value patterns from query.
        
        Args:
            query: Query text
            
        Returns:
            List of value patterns
        """
        patterns = []
        
        # Dollar amounts
        dollar_matches = re.findall(r'\$[\d,]+(?:\.\d{2})?', query)
        patterns.extend(dollar_matches)
        
        # Percentages
        percent_matches = re.findall(r'\d+(?:\.\d+)?%', query)
        patterns.extend(percent_matches)
        
        # Distances
        km_matches = re.findall(r'\d+\s*(?:km|kilometer|kilometre|miles?)', query)
        patterns.extend(km_matches)
        
        # Time periods
        time_matches = re.findall(r'\d+\s*(?:hours?|days?|weeks?|months?)', query)
        patterns.extend(time_matches)
        
        # Numeric ranges
        range_matches = re.findall(r'\d+\s*(?:to|-)\s*\d+', query)
        patterns.extend(range_matches)
        
        return patterns