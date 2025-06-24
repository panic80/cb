# Content Co-occurrence Indexing Solution

## Overview

This implementation provides a truly generic solution for retrieving specific values from documents, regardless of their structure (tables, prose, JSON, lists, etc.). It solves the problem where traditional retrieval methods fail when query terms are split between different parts of a document (e.g., "Ontario" in a table header and "$0.57" in a cell value).

## How It Works

### Core Principle
The co-occurrence indexer treats all content uniformly as a graph of co-occurring terms within proximity windows. It doesn't make assumptions about document structure - instead, it indexes relationships between terms based on how close they appear to each other.

### Key Components

1. **CooccurrenceIndexer** (`app/components/cooccurrence_indexer.py`)
   - Builds a graph where nodes are terms and edges represent co-occurrences
   - Tracks multiple proximity windows (5, 10, 20, 50, 100 tokens)
   - Stores context samples and document references
   - Uses weighted scoring based on term distances

2. **CooccurrenceRetriever** (`app/components/cooccurrence_retriever.py`)
   - LangChain-compatible retriever using the co-occurrence index
   - Supports hybrid retrieval combining co-occurrence with vector search
   - Handles exact phrase matching and boosting

3. **Integration** 
   - Integrated into ingestion pipeline (`app/pipelines/ingestion.py`)
   - Integrated into retrieval pipeline (`app/pipelines/retrieval.py`)
   - Automatically indexes new documents during ingestion
   - Used for value-based queries alongside table retrieval

## Usage

### Building the Index

1. **During Document Ingestion**: The index is automatically updated when new documents are ingested.

2. **Rebuild from Existing Documents**:
   ```bash
   cd rag-service
   python rebuild_cooccurrence_index.py
   ```

### Testing

Run the comprehensive test suite:
```bash
cd rag-service
python test_cooccurrence_retrieval.py
```

This tests various document formats:
- Markdown tables
- Prose text
- JSON structures
- Key-value pairs
- Lists

### Query Examples

The solution handles these previously problematic queries:
- "Ontario kilometric rate" → Finds documents where "Ontario" and "kilometric rate" appear near each other
- "Ontario $0.57" → Connects province name with its rate value
- "Yukon $0.615" → Finds the specific rate for Yukon
- "$0.54 Quebec" → Works even with reversed term order

## Algorithm Details

### Proximity Scoring
```python
distance_weights = {
    0: 1.0,    # Same position (exact match)
    1: 0.9,    # Adjacent terms
    2: 0.8,    # Very close
    3: 0.7,    # Close
    4: 0.6,    # Near
    5: 0.5,    # Somewhat near
    # Decay for larger distances
}
```

### Multi-Scale Indexing
- **Line level**: Terms on the same line (tables, lists)
- **Sentence level**: Within ~5 tokens
- **Paragraph level**: Within ~20 tokens  
- **Section level**: Within ~100 tokens
- **Document level**: Same document

## Benefits

1. **Structure Agnostic**: Works identically for tables, prose, JSON, lists, etc.
2. **No Domain Knowledge**: Doesn't require understanding of specific table formats
3. **Language Agnostic**: Works for any language that can be tokenized
4. **Self-Organizing**: Frequently co-occurring terms naturally cluster
5. **Scalable**: Graph structure allows efficient lookups

## Performance Considerations

- **Index Size**: Grows with vocabulary size and document count
- **Build Time**: O(n*w) where n is total tokens and w is window size
- **Query Time**: O(k*m) where k is query terms and m is average edges per term
- **Memory**: Stores edges, positions, and context samples

## Future Enhancements

1. **Compression**: Implement edge pruning for rarely co-occurring terms
2. **Distributed**: Support distributed graph storage for large corpora
3. **Learning**: Use query logs to adjust proximity weights
4. **Caching**: Cache frequently queried term combinations
5. **Visualization**: Add tools to visualize the co-occurrence graph