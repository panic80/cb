"""
Minimal test of co-occurrence indexing concept without dependencies.

This demonstrates the core algorithm without requiring LangChain or other libraries.
"""

import re
from collections import defaultdict
from typing import Dict, List, Tuple, Set


class SimpleDocument:
    """Simple document class."""
    def __init__(self, content: str, doc_id: str):
        self.content = content
        self.id = doc_id


class SimpleCooccurrenceIndexer:
    """Simplified co-occurrence indexer for demonstration."""
    
    def __init__(self):
        self.cooccurrence_graph = defaultdict(dict)
        self.document_tokens = {}
        self.token_positions = defaultdict(dict)
        
    def tokenize(self, text: str) -> List[str]:
        """Simple tokenization."""
        tokens = re.findall(r'\b[\w\$\%\.\-]+\b', text.lower())
        return [t for t in tokens if len(t) >= 2]
        
    def add_document(self, doc: SimpleDocument):
        """Add a document to the index."""
        tokens = self.tokenize(doc.content)
        self.document_tokens[doc.id] = tokens
        
        # Store token positions
        for i, token in enumerate(tokens):
            if doc.id not in self.token_positions[token]:
                self.token_positions[token][doc.id] = []
            self.token_positions[token][doc.id].append(i)
        
        # Build co-occurrences within window of 10
        window_size = 10
        for i, token1 in enumerate(tokens):
            for j in range(i + 1, min(i + window_size + 1, len(tokens))):
                token2 = tokens[j]
                if token1 == token2:
                    continue
                    
                distance = j - i
                
                # Add edges
                if token2 not in self.cooccurrence_graph[token1]:
                    self.cooccurrence_graph[token1][token2] = []
                self.cooccurrence_graph[token1][token2].append((doc.id, distance))
                
                if token1 not in self.cooccurrence_graph[token2]:
                    self.cooccurrence_graph[token2][token1] = []
                self.cooccurrence_graph[token2][token1].append((doc.id, distance))
                
    def find_connecting_documents(self, terms: List[str]) -> List[Tuple[str, float]]:
        """Find documents that connect the given terms."""
        query_tokens = []
        for term in terms:
            query_tokens.extend(self.tokenize(term))
        
        # Find documents containing at least one query token
        candidate_docs = set()
        for token in query_tokens:
            if token in self.token_positions:
                candidate_docs.update(self.token_positions[token].keys())
                
        # Score each document
        doc_scores = []
        for doc_id in candidate_docs:
            score = self._score_document(doc_id, query_tokens)
            if score > 0:
                doc_scores.append((doc_id, score))
                
        # Sort by score
        doc_scores.sort(key=lambda x: x[1], reverse=True)
        return doc_scores
        
    def _score_document(self, doc_id: str, query_tokens: List[str]) -> float:
        """Score a document based on query token proximity."""
        present_tokens = []
        token_positions = {}
        
        for token in query_tokens:
            if token in self.token_positions and doc_id in self.token_positions[token]:
                present_tokens.append(token)
                token_positions[token] = self.token_positions[token][doc_id]
                
        if len(present_tokens) <= 1:
            return len(present_tokens)  # Simple frequency score
            
        # Calculate proximity scores
        total_score = 0.0
        for i, token1 in enumerate(present_tokens):
            for j in range(i + 1, len(present_tokens)):
                token2 = present_tokens[j]
                
                # Find minimum distance
                min_distance = float('inf')
                for pos1 in token_positions[token1]:
                    for pos2 in token_positions[token2]:
                        distance = abs(pos2 - pos1)
                        min_distance = min(min_distance, distance)
                        
                # Convert distance to score
                if min_distance < float('inf'):
                    if min_distance <= 5:
                        score = 2.0 - (min_distance * 0.2)
                    else:
                        score = 1.0 / min_distance
                    total_score += score
                    
        return total_score


def test_simple_cooccurrence():
    """Test the simplified co-occurrence indexer."""
    print("=== Simple Co-occurrence Indexing Test ===\n")
    
    # Create test documents
    docs = [
        SimpleDocument(
            "Ontario has a kilometric rate of $0.57 per kilometer effective April 2024",
            "doc1"
        ),
        SimpleDocument(
            "The kilometric rates vary by province. Ontario: $0.57/km, Quebec: $0.54/km, Yukon: $0.615/km",
            "doc2"
        ),
        SimpleDocument(
            """Kilometric Rates Table
            Province | Rate
            Ontario | $0.57
            Quebec | $0.54
            Yukon | $0.615""",
            "doc3"
        )
    ]
    
    # Create indexer and add documents
    indexer = SimpleCooccurrenceIndexer()
    for doc in docs:
        indexer.add_document(doc)
        print(f"Indexed document: {doc.id}")
    
    print(f"\nTotal unique tokens: {len(indexer.token_positions)}")
    print(f"Sample tokens: {list(indexer.token_positions.keys())[:10]}")
    
    # Test queries
    test_queries = [
        ["ontario", "kilometric", "rate"],
        ["ontario", "$0.57"],
        ["yukon", "$0.615"],
        ["quebec", "rate"]
    ]
    
    for query in test_queries:
        print(f"\n\nQuery: {' '.join(query)}")
        results = indexer.find_connecting_documents(query)
        
        if results:
            print(f"Found {len(results)} matching documents:")
            for doc_id, score in results:
                print(f"  - {doc_id}: score = {score:.3f}")
                
                # Show which tokens matched
                doc_tokens = set(indexer.document_tokens[doc_id])
                query_token_set = set(indexer.tokenize(' '.join(query)))
                matching = doc_tokens.intersection(query_token_set)
                print(f"    Matching tokens: {matching}")
        else:
            print("  No results found")
    
    # Demonstrate how it solves the table problem
    print("\n\n=== Solving the Table Value Problem ===")
    print("Traditional search fails for 'Ontario $0.57' in tables because:")
    print("- 'Ontario' appears in header/first column")
    print("- '$0.57' appears in a different cell")
    print("- They're not in the same 'chunk' for embedding")
    
    print("\nCo-occurrence indexing succeeds because:")
    print("- It tracks that 'Ontario' and '$0.57' appear within N tokens")
    print("- Distance-based scoring ranks closer occurrences higher")
    print("- Works uniformly across tables, prose, JSON, etc.")


if __name__ == "__main__":
    test_simple_cooccurrence()