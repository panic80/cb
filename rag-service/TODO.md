# TODO: Generic Table Value Retrieval Solutions

## Current Issue
The system cannot retrieve specific table values when users query with compound terms (e.g., "Ontario kilometric rate"). While it successfully retrieves other table data (incidental rates, meal rates), it fails when the query terms are split between table headers and cell values.

## Solution Evolution

### Solution 1: Enhanced Table Context Preservation
**Approach**: Include table title and section context in every row extraction
- Create multiple representations: Full Context, Semantic Triple, Query-Optimized formats
- Smart query expansion for table-related queries
- Table-aware retrieval scoring
- Fallback to full table search

**Limitations**: Still assumes specific table structures and domain knowledge

### Solution 2: Contextual Cell Neighborhood Indexing
**Approach**: Index every table cell with its complete context
- Row headers, column headers, table caption, section heading, neighboring cells
- Automatic relationship extraction between cells
- Query decomposition and multi-context matching
- Universal table representation format

**Limitations**: Still assumes tables have a 2D grid structure and that "cells" are meaningful units

### Solution 3: Content Co-occurrence Indexing (Most Generic)
**Core Principle**: Don't treat tables specially. Index ALL content as a graph of co-occurring terms within proximity windows.

**Algorithm**:
1. **Proximity-Based Indexing**
   - Index every term with every other term within N tokens
   - Store the distance between terms
   - No special handling for tables vs. text

2. **Multi-Scale Co-occurrence**
   ```
   For each term T1:
     Store all terms that appear within:
     - Same line (distance 0)
     - Within 5 tokens (distance 1)  
     - Within 20 tokens (distance 2)
     - Within 100 tokens (distance 3)
     - Same section (distance 4)
   ```

3. **Query Resolution**
   - Find content where query terms have minimal combined distance
   - Return the connecting content

**Implementation Concept**:
```python
# Build co-occurrence graph
cooccurrence_graph = {}
for doc in all_documents:
    tokens = tokenize(doc)
    for i, token1 in enumerate(tokens):
        for j, token2 in enumerate(tokens[i+1:i+window_size]):
            distance = j + 1
            add_edge(cooccurrence_graph, token1, token2, distance)

# Query
def search(query_terms):
    # Find content that minimizes total distance between query terms
    candidates = find_common_neighbors(query_terms, cooccurrence_graph)
    return rank_by_proximity_score(candidates)
```

**Why This is Truly Generic**:
- No structure assumptions (works for tables, prose, lists, JSON, any format)
- No layout knowledge needed
- No domain specificity
- Language/format agnostic
- Self-organizing (frequently co-occurring terms naturally cluster)

**Benefits**:
- Works identically for:
  - Tables: `Ontario | $0.57/km | Kilometric Rate`
  - Prose: "The kilometric rate for Ontario is $0.57"
  - JSON: `{"Ontario": {"kilometric_rate": "0.57"}}`
  - Lists: "- Ontario: kilometric rate $0.57"
- Pure information theory approach: things that appear together are related

## Next Steps
1. Implement content co-occurrence indexing as a new retrieval strategy
2. Build proximity-based scoring algorithm
3. Test with various table formats and query patterns
4. Compare performance with current table-aware approaches
5. Consider hybrid approach combining table-awareness with co-occurrence for optimal results