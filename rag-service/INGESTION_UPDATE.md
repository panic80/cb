# RAG Service Ingestion Pipeline Update

## Overview
Updated the ingestion pipeline to use Haystack's built-in converters instead of custom implementations.

## Changes Made

### 1. File Type Support
Now supports the following file types using Haystack's built-in converters:
- **Text files** (.txt, .text) - `TextFileToDocument`
- **PDF files** (.pdf) - `PyPDFToDocument`
- **HTML files** (.html, .htm) - `HTMLToDocument`
- **Markdown files** (.md, .markdown) - `MarkdownToDocument`
- **CSV files** (.csv) - `CSVToDocument`
- **Word documents** (.docx, .doc) - `DOCXToDocument`
- **Excel files** (.xlsx, .xls) - `XLSXToDocument`
- **JSON files** (.json, .jsonl) - Currently handled as text files

### 2. Pipeline Manager Updates
- Modified `PipelineManager` to dynamically create pipelines based on file type
- Added `_create_file_indexing_pipeline()` method that selects the appropriate converter
- Removed dependency on pre-created static pipelines

### 3. File Utils Updates
- Updated `SUPPORTED_FILE_TYPES` to include all new MIME types
- Added proper MIME type to file extension mappings

### 4. URL Ingestion
- URL ingestion already uses Haystack's `LinkContentFetcher` component correctly

## Benefits
1. **No custom code** - Using Haystack's battle-tested converters
2. **Better compatibility** - Supports more file types out of the box
3. **Easier maintenance** - No need to maintain custom converters
4. **Better error handling** - Haystack's converters handle edge cases

## Testing
To test the updated ingestion:

```bash
# Text file
curl -X POST "http://localhost:8000/api/v1/ingest/file" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.txt", "content": "base64_encoded_content", "content_type": "text/plain"}'

# PDF file
curl -X POST "http://localhost:8000/api/v1/ingest/file" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.pdf", "content": "base64_encoded_content", "content_type": "application/pdf"}'

# CSV file
curl -X POST "http://localhost:8000/api/v1/ingest/file" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.csv", "content": "base64_encoded_content", "content_type": "text/csv"}'
```