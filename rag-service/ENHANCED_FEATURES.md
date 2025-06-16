# Enhanced RAG Pipeline Features

This document describes the enhanced features added to the RAG pipeline for improved multi-source handling and retrieval capabilities.

## New Components

### 1. Source-Aware Retriever
**File:** `app/components/source_aware_retriever.py`

A component that filters and prioritizes documents based on source metadata:
- **Source Type Filtering**: Filter by file types (PDF, HTML, Markdown, etc.)
- **Source Credibility Scoring**: Assign credibility scores based on source patterns
- **Cross-Source Balancing**: Ensure diverse results from multiple sources
- **Preferred Source Boosting**: Prioritize specific sources when requested

### 2. Query Expander
**File:** `app/components/query_expander.py`

Expands user queries using LLM to improve recall:
- **Multiple Expansion Strategies**: Comprehensive, focused, broad, technical
- **Contextual Expansion**: Consider additional context when expanding
- **Multi-Query Retrieval**: Aggregate results from multiple expanded queries

### 3. Diversity Ranker
**File:** `app/pipelines/enhanced_query.py`

Reduces redundancy in search results:
- **Similarity Detection**: Identifies overly similar documents
- **Diverse Selection**: Ensures variety in retrieved content
- **Configurable Threshold**: Adjust diversity requirements

### 4. Enhanced Answer Builder
**File:** `app/pipelines/enhanced_query.py`

Provides detailed response metadata:
- **Confidence Scoring**: Overall and per-source confidence scores
- **Diversity Metrics**: Measures result diversity
- **Query Expansion Details**: Shows how queries were expanded

## Enhanced Pipeline

### Create Enhanced Query Pipeline
**File:** `app/pipelines/enhanced_query.py`

A comprehensive pipeline combining all enhanced features:
- Query expansion for improved recall
- Source-aware filtering and prioritization
- Diversity-aware ranking
- Confidence scoring and metadata

## Per-Query Configuration

The system now supports per-query configuration overrides through the `query_config` parameter:

```json
{
  "use_enhanced_pipeline": true,
  "enable_query_expansion": true,
  "enable_source_filtering": true,
  "enable_diversity_ranking": true,
  "source_filters": {
    "content_type": "pdf"
  },
  "preferred_sources": ["official_docs", "technical_specs"]
}
```

### Configuration Options

1. **use_enhanced_pipeline** (bool): Enable the enhanced pipeline
2. **enable_query_expansion** (bool): Use LLM to expand queries
3. **enable_source_filtering** (bool): Apply source-aware filtering
4. **enable_diversity_ranking** (bool): Reduce redundant results
5. **source_filters** (dict): Filter documents by metadata fields
6. **preferred_sources** (list): List of preferred source patterns

## API Updates

### Chat Request
The chat API now accepts additional parameters:
- `query_config`: Per-query configuration overrides
- Returns `confidence_score` and `metadata` in responses

### Example Request
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the key features?",
    "query_config": {
      "use_enhanced_pipeline": true,
      "enable_query_expansion": true,
      "source_filters": {
        "content_type": "pdf"
      }
    }
  }'
```

### Enhanced Response
```json
{
  "response": "The key features are...",
  "sources": [...],
  "confidence_score": 0.85,
  "metadata": {
    "retrieval_count": 10,
    "sources_count": 5,
    "query_expansion_used": true,
    "expansion_details": {
      "strategy": "comprehensive",
      "expansion_count": 3
    },
    "diversity_metrics": {
      "source_types": 3,
      "unique_sources": 5,
      "content_diversity": 0.72
    }
  },
  "conversation_id": "...",
  "model": "gpt-4o-mini"
}
```

## Usage Examples

### 1. Filter by Source Type
```json
{
  "message": "Find technical specifications",
  "query_config": {
    "use_enhanced_pipeline": true,
    "source_filters": {
      "content_type": ["pdf", "docx"]
    }
  }
}
```

### 2. Prefer Specific Sources
```json
{
  "message": "What is the API documentation?",
  "query_config": {
    "use_enhanced_pipeline": true,
    "preferred_sources": ["api_docs", "swagger"]
  }
}
```

### 3. Disable Query Expansion
```json
{
  "message": "Exact search term",
  "query_config": {
    "use_enhanced_pipeline": true,
    "enable_query_expansion": false
  }
}
```

### 4. Maximum Diversity
```json
{
  "message": "Show different perspectives",
  "query_config": {
    "use_enhanced_pipeline": true,
    "enable_diversity_ranking": true,
    "enable_source_filtering": true
  }
}
```

## Benefits

1. **Improved Recall**: Query expansion finds related content that might be missed
2. **Source Control**: Filter and prioritize based on source characteristics
3. **Reduced Redundancy**: Diversity ranking ensures varied perspectives
4. **Confidence Metrics**: Understand the quality of retrieved results
5. **Flexible Configuration**: Adjust behavior per query without code changes

## Performance Considerations

- Query expansion adds LLM calls (cached per model)
- Enhanced pipelines are cached by configuration
- Source filtering happens before expensive reranking
- Diversity checking uses simple text similarity (upgradeable to embeddings)

## Future Enhancements

1. **Temporal Ranking**: Prioritize recent content
2. **Negative Feedback**: Exclude similar content to poor results  
3. **Adaptive Retrieval**: Auto-adjust parameters based on query type
4. **A/B Testing Framework**: Compare pipeline configurations
5. **Fine-grained Source Tracking**: Section/paragraph level attribution