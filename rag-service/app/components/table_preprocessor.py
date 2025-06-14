import logging
from typing import List
from haystack import component, Document
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)


@component
class TableAwareHTMLPreprocessor:
    """Preprocessor that converts HTML tables to structured text format."""
    
    @component.output_types(documents=List[Document])
    def run(self, documents: List[Document]) -> dict:
        """Process HTML documents to better preserve table structure."""
        logger.info(f"TableAwareHTMLPreprocessor processing {len(documents)} documents")
        processed_docs = []
        
        for doc in documents:
            if doc.meta.get("content_type") == "text/html":
                logger.info("Processing HTML document for table structure")
                processed_content = self._process_html_tables(doc.content)
                logger.info(f"Processed content length: {len(processed_content)}")
                processed_doc = Document(
                    content=processed_content,
                    meta=doc.meta.copy()
                )
                processed_docs.append(processed_doc)
            else:
                processed_docs.append(doc)
        
        return {"documents": processed_docs}
    
    def _process_html_tables(self, html_content: str) -> str:
        """Convert HTML tables to structured text format."""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Find all tables
        tables = soup.find_all('table')
        logger.info(f"Found {len(tables)} tables in HTML")
        
        for i, table in enumerate(tables):
            # Convert table to structured text
            structured_text = self._table_to_structured_text(table)
            logger.info(f"Table {i+1} converted to {len(structured_text)} characters")
            
            # Replace the table with structured text
            table.replace_with(structured_text)
        
        return str(soup)
    
    def _table_to_structured_text(self, table) -> str:
        """Convert a table element to structured text format."""
        structured_lines = []
        
        # Extract all rows as 2D array
        rows = []
        for row in table.find_all('tr'):
            cells = []
            for cell in row.find_all(['td', 'th']):
                cell_text = cell.get_text(strip=True)
                cells.append(cell_text)
            if cells:  # Only add non-empty rows
                rows.append(cells)
        
        if not rows:
            return ""
        
        # Assume first row contains column headers
        headers = rows[0] if rows else []
        
        # Process data rows (skip header row)
        for row_idx, row_data in enumerate(rows[1:], 1):
            # Assume first column contains row labels
            row_label = row_data[0] if row_data else ""
            
            # For each data cell, create explicit associations
            for col_idx, cell_value in enumerate(row_data[1:], 1):
                if col_idx < len(headers) and cell_value:
                    column_header = headers[col_idx]
                    
                    if column_header and row_label:
                        # Generate multiple text patterns for better matching
                        patterns = [
                            f"{row_label} {column_header}: {cell_value}",
                            f"{column_header} {row_label}: {cell_value}",
                            f"{row_label} for {column_header}: {cell_value}",
                            f"{column_header} rate for {row_label}: {cell_value}",
                            f"{row_label} in {column_header}: {cell_value}",
                        ]
                        
                        # Add all patterns to ensure comprehensive matching
                        structured_lines.extend(patterns)
        
        return "\n".join(structured_lines) + "\n"