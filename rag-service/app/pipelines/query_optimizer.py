"""Query optimization and understanding pipeline."""

import re
from typing import Dict, List, Optional, Tuple, Any
from enum import Enum

from langchain_core.language_models import BaseLLM
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from app.core.logging import get_logger

logger = get_logger(__name__)


class QueryIntent(Enum):
    """Types of query intents."""
    RATE_LOOKUP = "rate_lookup"  # Looking for specific rates/values
    POLICY_QUESTION = "policy_question"  # Asking about policies/procedures
    ELIGIBILITY = "eligibility"  # Checking eligibility for benefits
    PROCESS_INQUIRY = "process_inquiry"  # How to do something
    DEFINITION = "definition"  # What is X?
    COMPARISON = "comparison"  # Comparing options
    CALCULATION = "calculation"  # Need calculation/computation
    GENERAL = "general"  # General inquiry


class QueryClassification(BaseModel):
    """Query classification result."""
    intent: QueryIntent = Field(description="Primary intent of the query")
    entities: List[str] = Field(default_factory=list, description="Key entities mentioned")
    temporal_context: Optional[str] = Field(default=None, description="Time-related context")
    location_context: Optional[str] = Field(default=None, description="Location/jurisdiction context")
    requires_table_lookup: bool = Field(default=False, description="Whether query needs table data")
    confidence: float = Field(default=0.0, description="Classification confidence")


class QueryOptimizer:
    """Optimizes queries for better retrieval."""
    
    # Common abbreviations in travel context
    ABBREVIATIONS = {
        "TD": "travel directive",
        "POMV": "privately owned motor vehicle",
        "PMV": "private motor vehicle",
        "HG&E": "household goods and effects",
        "F&E": "furniture and effects",
        "CFRD": "Canadian Forces relocation directive",
        "IRP": "integrated relocation program",
        "CBI": "compensation and benefits instructions",
        "NJC": "national joint council",
        "TBSE": "travel benefits and support element",
        "DCBA": "director compensation and benefits administration",
        "CAF": "Canadian Armed Forces",
        "CF": "Canadian Forces",
        "mbr": "member",
        "approx": "approximately",
        "incl": "including",
        "excl": "excluding",
        "max": "maximum",
        "min": "minimum"
    }
    
    # Query templates for expansion
    EXPANSION_TEMPLATES = {
        QueryIntent.RATE_LOOKUP: [
            "{original} table rates allowance",
            "{original} per day daily amount",
            "{original} current rates Canada"
        ],
        QueryIntent.POLICY_QUESTION: [
            "{original} policy directive regulation",
            "{original} rules requirements conditions"
        ],
        QueryIntent.ELIGIBILITY: [
            "{original} eligible qualify entitlement",
            "{original} requirements conditions criteria"
        ],
        QueryIntent.PROCESS_INQUIRY: [
            "{original} how to process procedure",
            "{original} steps guide instructions"
        ]
    }
    
    def __init__(self, llm: Optional[BaseLLM] = None):
        """Initialize query optimizer."""
        self.llm = llm
        self._setup_classifier()
        
    def _setup_classifier(self):
        """Setup query classifier prompt."""
        if not self.llm:
            return
            
        self.parser = PydanticOutputParser(pydantic_object=QueryClassification)
        
        self.classification_prompt = PromptTemplate(
            template="""Analyze the following query about Canadian Forces travel policies and classify it.

Query: {query}

Consider:
1. What is the user's primary intent?
2. What specific entities (rates, locations, benefits) are mentioned?
3. Is there a time context (dates, periods)?
4. Is there a location/jurisdiction context?
5. Does this require looking up specific values from tables?

{format_instructions}

Provide your classification:""",
            input_variables=["query"],
            partial_variables={"format_instructions": self.parser.get_format_instructions()}
        )
        
    def expand_abbreviations(self, query: str) -> str:
        """Expand known abbreviations in the query."""
        expanded = query
        
        # Sort by length descending to avoid partial replacements
        sorted_abbrevs = sorted(
            self.ABBREVIATIONS.items(),
            key=lambda x: len(x[0]),
            reverse=True
        )
        
        for abbrev, full_form in sorted_abbrevs:
            # Use word boundaries to avoid partial matches
            pattern = r'\b' + re.escape(abbrev) + r'\b'
            
            # Check if abbreviation exists
            if re.search(pattern, expanded, re.IGNORECASE):
                # Add full form in parentheses after abbreviation
                replacement = f"{abbrev} ({full_form})"
                expanded = re.sub(pattern, replacement, expanded, flags=re.IGNORECASE)
                
        if expanded != query:
            logger.info(f"Expanded abbreviations: '{query}' -> '{expanded}'")
            
        return expanded
        
    def simplify_complex_query(self, query: str) -> List[str]:
        """Break down complex queries into simpler sub-queries."""
        # Look for conjunctions that indicate multiple questions
        conjunctions = [" and ", " as well as ", " plus ", " also ", " furthermore "]
        
        # Check if query has multiple parts
        parts = [query]
        for conjunction in conjunctions:
            if conjunction in query.lower():
                # Split on conjunction
                split_parts = query.split(conjunction)
                if len(split_parts) > 1:
                    parts = []
                    for part in split_parts:
                        # Clean and add if substantial
                        cleaned = part.strip().rstrip(".,?")
                        if len(cleaned.split()) > 3:  # At least 4 words
                            parts.append(cleaned + "?")
                    break
                    
        # Also check for multiple question marks
        if parts == [query] and query.count("?") > 1:
            parts = [q.strip() + "?" for q in query.split("?") if q.strip()]
            
        if len(parts) > 1:
            logger.info(f"Simplified complex query into {len(parts)} parts")
            
        return parts
        
    async def classify_query(self, query: str) -> QueryClassification:
        """Classify the query intent and extract entities."""
        if not self.llm:
            # Fallback to rule-based classification
            return self._rule_based_classification(query)
            
        try:
            # Use LLM for classification
            prompt = self.classification_prompt.format(query=query)
            response = await self.llm.ainvoke(prompt)
            
            # Parse response
            classification = self.parser.parse(response.content)
            return classification
            
        except Exception as e:
            logger.warning(f"LLM classification failed: {e}, using rule-based")
            return self._rule_based_classification(query)
            
    def _rule_based_classification(self, query: str) -> QueryClassification:
        """Rule-based query classification fallback."""
        query_lower = query.lower()
        
        # Initialize classification
        classification = QueryClassification(
            intent=QueryIntent.GENERAL,
            entities=[],
            confidence=0.7
        )
        
        # Detect intent based on keywords
        if any(word in query_lower for word in ["rate", "amount", "cost", "price", "$", "dollar", "allowance"]):
            classification.intent = QueryIntent.RATE_LOOKUP
            classification.requires_table_lookup = True
            
        elif any(word in query_lower for word in ["eligible", "qualify", "entitled", "can i", "am i"]):
            classification.intent = QueryIntent.ELIGIBILITY
            
        elif any(word in query_lower for word in ["how to", "how do", "process", "procedure", "steps"]):
            classification.intent = QueryIntent.PROCESS_INQUIRY
            
        elif any(word in query_lower for word in ["policy", "directive", "regulation", "rule"]):
            classification.intent = QueryIntent.POLICY_QUESTION
            
        elif any(word in query_lower for word in ["what is", "what are", "define", "meaning"]):
            classification.intent = QueryIntent.DEFINITION
            
        elif any(word in query_lower for word in ["compare", "difference", "versus", "vs", "better"]):
            classification.intent = QueryIntent.COMPARISON
            
        elif any(word in query_lower for word in ["calculate", "computation", "total", "sum"]):
            classification.intent = QueryIntent.CALCULATION
            classification.requires_table_lookup = True
            
        # Extract entities
        entities = []
        
        # Location entities
        locations = ["canada", "usa", "united states", "ontario", "quebec", "alberta", 
                    "yukon", "nwt", "nunavut", "overseas", "international"]
        for loc in locations:
            if loc in query_lower:
                entities.append(loc)
                classification.location_context = loc
                
        # Benefit/rate types
        rate_types = ["meal", "breakfast", "lunch", "dinner", "incidental", "hotel",
                     "accommodation", "kilometric", "mileage", "relocation", "posting"]
        for rate in rate_types:
            if rate in query_lower:
                entities.append(rate)
                
        # Temporal context
        if any(word in query_lower for word in ["2024", "2025", "current", "latest", "new"]):
            classification.temporal_context = "current"
        elif "retroactive" in query_lower or "previous" in query_lower:
            classification.temporal_context = "historical"
            
        classification.entities = entities
        
        # Check for table indicators
        if any(word in query_lower for word in ["table", "chart", "list", "schedule"]):
            classification.requires_table_lookup = True
            
        return classification
        
    def expand_query(self, query: str, intent: QueryIntent) -> List[str]:
        """Expand query based on intent."""
        expanded_queries = [query]  # Always include original
        
        # Get expansion templates for this intent
        templates = self.EXPANSION_TEMPLATES.get(intent, [])
        
        for template in templates:
            expanded = template.format(original=query)
            if expanded not in expanded_queries:
                expanded_queries.append(expanded)
                
        # Add specific expansions based on content
        query_lower = query.lower()
        
        # Meal-related expansions
        if "meal" in query_lower:
            if "yukon" not in query_lower:
                expanded_queries.append(f"{query} Yukon Alaska NWT Nunavut")
            expanded_queries.append(f"{query} breakfast lunch dinner rates")
            
        # Incidental expansions
        if "incidental" in query_lower:
            expanded_queries.append(f"{query} 17.30 13.00 daily allowance")
            
        # POMV/vehicle expansions
        if any(term in query_lower for term in ["pomv", "vehicle", "kilometric"]):
            expanded_queries.append(f"{query} per kilometer cents privately owned")
            
        logger.info(f"Expanded query to {len(expanded_queries)} variants")
        return expanded_queries[:5]  # Limit to 5 expansions
        
    def detect_language(self, query: str) -> str:
        """Detect query language (basic implementation)."""
        # French indicators
        french_words = ["qu'est", "comment", "pourquoi", "quel", "quelle", 
                       "combien", "est-ce", "puis-je", "allocation", "taux"]
        
        query_lower = query.lower()
        french_count = sum(1 for word in french_words if word in query_lower)
        
        if french_count >= 2:
            return "fr"
        else:
            return "en"
            
    async def optimize_query(self, query: str) -> Dict[str, Any]:
        """Full query optimization pipeline."""
        # Detect language
        language = self.detect_language(query)
        
        # Expand abbreviations
        expanded = self.expand_abbreviations(query)
        
        # Classify query
        classification = await self.classify_query(expanded)
        
        # Simplify if complex
        sub_queries = self.simplify_complex_query(expanded)
        
        # Expand based on intent
        all_expansions = []
        for sub_query in sub_queries:
            expansions = self.expand_query(sub_query, classification.intent)
            all_expansions.extend(expansions)
            
        # Remove duplicates while preserving order
        unique_expansions = []
        seen = set()
        for exp in all_expansions:
            if exp not in seen:
                seen.add(exp)
                unique_expansions.append(exp)
                
        return {
            "original_query": query,
            "language": language,
            "classification": classification.model_dump(),
            "expanded_queries": unique_expansions,
            "requires_translation": language != "en"
        }


class QueryRewriter:
    """Rewrites queries for specific retrieval strategies."""
    
    def __init__(self, llm: Optional[BaseLLM] = None):
        """Initialize query rewriter."""
        self.llm = llm
        
    def rewrite_for_semantic_search(self, query: str, context: Dict[str, Any]) -> str:
        """Rewrite query optimized for semantic search."""
        # Add context terms for better semantic matching
        rewritten = query
        
        intent = context.get("classification", {}).get("intent")
        if intent == "rate_lookup":
            rewritten = f"specific rates values amounts {query}"
        elif intent == "policy_question":
            rewritten = f"official policy directive regulation {query}"
            
        return rewritten
        
    def rewrite_for_keyword_search(self, query: str, context: Dict[str, Any]) -> str:
        """Rewrite query optimized for keyword/BM25 search."""
        # Extract key terms and remove stop words
        stop_words = {"the", "a", "an", "is", "are", "what", "how", "can", "i", "my"}
        
        words = query.lower().split()
        keywords = [w for w in words if w not in stop_words]
        
        # Add synonyms for important terms
        synonym_map = {
            "rate": ["rate", "amount", "value"],
            "meal": ["meal", "breakfast", "lunch", "dinner", "food"],
            "travel": ["travel", "TD", "trip", "journey"],
            "claim": ["claim", "reimbursement", "expense"]
        }
        
        expanded_keywords = []
        for keyword in keywords:
            expanded_keywords.append(keyword)
            if keyword in synonym_map:
                expanded_keywords.extend(synonym_map[keyword])
                
        return " ".join(expanded_keywords)
        
    async def generate_hypothetical_answer(self, query: str) -> str:
        """Generate a hypothetical answer for HyDE retrieval."""
        if not self.llm:
            return query
            
        prompt = f"""Generate a hypothetical but realistic answer to this question about Canadian Forces travel policies. 
The answer should contain specific details that would be found in official documentation.

Question: {query}

Hypothetical Answer:"""
        
        try:
            response = await self.llm.ainvoke(prompt)
            return response.content
        except Exception as e:
            logger.error(f"Failed to generate hypothetical answer: {e}")
            return query