#!/usr/bin/env python3

"""Fix hardship allowance table extraction failures in existing documents."""

import sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup
import pandas as pd
from io import StringIO
import re

# Add the app directory to the Python path
app_dir = Path(__file__).parent / "app"
sys.path.insert(0, str(app_dir))

from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore
from haystack.utils import Secret
from haystack import Document
from app.core.config import settings

def extract_hardship_allowance_table_from_url(url):
    """Extract hardship allowance table directly from source URL."""
    
    print(f"Fetching content from: {url}")
    
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for hardship allowance table specifically
        tables = soup.find_all('table')
        
        print(f"Found {len(tables)} tables on the page")
        
        hardship_table = None
        for i, table in enumerate(tables):
            table_text = table.get_text().lower()
            
            # Check if this table contains hardship allowance data
            if ('hardship' in table_text and 'level' in table_text) or ('ha' in table_text and 'level' in table_text):
                print(f"Found potential hardship allowance table #{i+1}")
                hardship_table = table
                break
        
        if not hardship_table:
            print("No hardship allowance table found on this page")
            return None
        
        # Try pandas extraction
        try:
            table_html = str(hardship_table)
            dfs = pd.read_html(StringIO(table_html))
            
            if dfs:
                df = dfs[0]
                print(f"Successfully extracted table with shape: {df.shape}")
                print(f"Columns: {list(df.columns)}")
                
                # Convert to markdown
                markdown_table = df.to_markdown(index=False, tablefmt="pipe")
                print("Table extracted as markdown:")
                print(markdown_table)
                return markdown_table
            
        except Exception as e:
            print(f"Pandas extraction failed: {e}")
            
            # Fallback to manual extraction
            print("Attempting manual table extraction...")
            return extract_table_manually(hardship_table)
            
    except Exception as e:
        print(f"Error fetching URL {url}: {e}")
        return None

def extract_table_manually(table_tag):
    """Manually extract table data using BeautifulSoup."""
    
    try:
        rows = []
        for tr in table_tag.find_all('tr'):
            cells = []
            for cell in tr.find_all(['td', 'th']):
                cell_text = cell.get_text(strip=True)
                cells.append(cell_text)
            if cells:
                rows.append(cells)
        
        if not rows:
            return "[No table data found]"
        
        # Convert to markdown format
        if len(rows) > 1:
            # Create header separator
            header_sep = ['---'] * len(rows[0])
            markdown_rows = [' | '.join(rows[0]), ' | '.join(header_sep)]
            for row in rows[1:]:
                if len(row) == len(rows[0]):  # Ensure consistent column count
                    markdown_rows.append(' | '.join(row))
            
            return '\n'.join(markdown_rows)
        else:
            return ' | '.join(rows[0])
            
    except Exception as e:
        print(f"Manual extraction failed: {e}")
        return "[Table extraction failed]"

def fix_existing_documents():
    """Fix existing documents with failed table conversions."""
    
    print("Initializing document store...")
    
    # Initialize document store same way as the manager
    if settings.VECTOR_STORE_TYPE == "memory":
        document_store = InMemoryDocumentStore(embedding_similarity_function="cosine")
    elif settings.VECTOR_STORE_TYPE == "pgvector":
        if not settings.DATABASE_URL:
            print("Error: DATABASE_URL required for pgvector")
            return
        
        document_store = PgvectorDocumentStore(
            connection_string=Secret.from_token(settings.DATABASE_URL),
            table_name="documents",
            embedding_dimension=3072,
            vector_function="cosine_similarity",
            recreate_table=False,
            search_strategy="exact_search"
        )
    else:
        print(f"Error: Unknown vector store type: {settings.VECTOR_STORE_TYPE}")
        return
    
    # Find documents with table conversion failures
    print("Finding documents with table conversion failures...")
    all_docs = document_store.filter_documents()
    
    failed_docs = []
    for doc in all_docs:
        if '[Table conversion failed]' in doc.content:
            failed_docs.append(doc)
    
    print(f"Found {len(failed_docs)} documents with table conversion failures")
    
    if not failed_docs:
        print("No documents need fixing")
        return
    
    # Group by source URL to avoid duplicate fetches
    docs_by_source = {}
    for doc in failed_docs:
        source = doc.meta.get('source', 'unknown')
        if source not in docs_by_source:
            docs_by_source[source] = []
        docs_by_source[source].append(doc)
    
    print(f"Documents grouped by {len(docs_by_source)} unique sources")
    
    # Process each source
    for source_url, docs in docs_by_source.items():
        print(f"\n{'='*60}")
        print(f"Processing source: {source_url}")
        print(f"Documents to fix: {len(docs)}")
        
        if not source_url.startswith('http'):
            print(f"Skipping non-HTTP source: {source_url}")
            continue
        
        # Check if this is a hardship allowance related page
        if 'hardship' not in source_url.lower() and 'foreign-service' not in source_url.lower() and 'chapter-10' not in source_url.lower():
            print(f"Skipping non-hardship allowance source: {source_url}")
            continue
        
        # Extract table from source
        extracted_table = extract_hardship_allowance_table_from_url(source_url)
        
        if extracted_table and '[Table conversion failed]' not in extracted_table:
            print(f"Successfully extracted table from {source_url}")
            
            # Update documents
            updated_count = 0
            for doc in docs:
                # Replace the failed table placeholder with the extracted table
                new_content = doc.content.replace('[Table conversion failed]', f'\n\n{extracted_table}\n\n')
                
                if new_content != doc.content:
                    # Create updated document
                    updated_doc = Document(
                        id=doc.id,
                        content=new_content,
                        meta=doc.meta,
                        embedding=doc.embedding
                    )
                    
                    # Update in document store
                    try:
                        # Delete old document
                        document_store.delete_documents([doc.id])
                        
                        # Write updated document
                        document_store.write_documents([updated_doc])
                        updated_count += 1
                        print(f"Updated document {doc.id[:8]}...")
                        
                    except Exception as e:
                        print(f"Error updating document {doc.id}: {e}")
            
            print(f"Updated {updated_count} documents for source {source_url}")
        else:
            print(f"Failed to extract table from {source_url}")
    
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"Total documents with table failures: {len(failed_docs)}")
    print(f"Sources processed: {len(docs_by_source)}")
    print("Table extraction fix complete!")

def show_sample_hardship_content():
    """Show what the hardship allowance content looks like after fixes."""
    
    print("Checking updated content...")
    
    # Initialize document store
    if settings.VECTOR_STORE_TYPE == "pgvector":
        document_store = PgvectorDocumentStore(
            connection_string=Secret.from_token(settings.DATABASE_URL),
            table_name="documents",
            embedding_dimension=3072,
            vector_function="cosine_similarity",
            recreate_table=False,
            search_strategy="exact_search"
        )
    else:
        document_store = InMemoryDocumentStore(embedding_similarity_function="cosine")
    
    # Find hardship allowance documents
    all_docs = document_store.filter_documents()
    hardship_docs = []
    
    for doc in all_docs:
        content_lower = doc.content.lower()
        if 'hardship' in content_lower and 'allowance' in content_lower:
            hardship_docs.append(doc)
    
    print(f"Found {len(hardship_docs)} hardship allowance documents")
    
    for i, doc in enumerate(hardship_docs[:3]):
        print(f"\nHardship Document {i+1}:")
        print(f"Source: {doc.meta.get('source', 'unknown')}")
        
        # Look for table content
        if '|' in doc.content:
            print("✅ Contains table formatting")
            
            # Show table lines
            lines = doc.content.split('\n')
            table_lines = [line for line in lines if '|' in line and line.strip()]
            
            if table_lines:
                print(f"Table content ({len(table_lines)} lines):")
                for line in table_lines[:10]:
                    print(f"  {line}")
                if len(table_lines) > 10:
                    print(f"  ... and {len(table_lines) - 10} more table lines")
        else:
            print("❌ No table formatting found")
            
        # Check for conversion failures
        if '[Table conversion failed]' in doc.content:
            print("❌ Still contains conversion failures")
        else:
            print("✅ No conversion failures")

if __name__ == "__main__":
    print("Hardship Allowance Table Fix Utility")
    print("="*50)
    
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "check":
        show_sample_hardship_content()
    else:
        fix_existing_documents()
        show_sample_hardship_content()