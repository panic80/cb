import logging
from typing import List, Dict, Any
from bs4 import BeautifulSoup
from haystack import component, Document
from haystack.dataclasses.byte_stream import ByteStream
import chardet

logger = logging.getLogger(__name__)


@component  
class CustomHTMLToDocument:
    """Custom HTML to Document converter that reliably processes HTML content."""
    
    def __init__(self, extract_meta_tags: bool = True):
        """
        Initialize the converter.
        
        Args:
            extract_meta_tags: Whether to extract metadata from HTML meta tags
        """
        self.extract_meta_tags = extract_meta_tags

    @component.output_types(documents=List[Document])
    def run(self, sources: List[ByteStream]) -> Dict[str, Any]:
        """
        Convert HTML ByteStreams to Document objects.
        
        Args:
            sources: List of ByteStream objects containing HTML content
            
        Returns:
            Dictionary containing list of Document objects
        """
        documents = []
        
        for source in sources:
            try:
                # Skip empty or failed sources
                if not source.data or source.meta.get("status") == "failed":
                    logger.warning(f"Skipping empty or failed source: {source.meta.get('url', 'unknown')}")
                    continue
                
                # Detect encoding if not provided
                encoding = source.meta.get("encoding", "utf-8")
                if not encoding or encoding == "None":
                    detected = chardet.detect(source.data)
                    encoding = detected.get("encoding", "utf-8") or "utf-8"
                
                # Decode HTML content
                try:
                    html_content = source.data.decode(encoding)
                except UnicodeDecodeError:
                    # Fallback to utf-8 with error handling
                    html_content = source.data.decode("utf-8", errors="replace")
                    logger.warning(f"Used fallback encoding for {source.meta.get('url', 'unknown')}")
                
                # Parse HTML with BeautifulSoup
                soup = BeautifulSoup(html_content, 'html.parser')
                
                # Extract title
                title_tag = soup.find('title')
                title = title_tag.get_text(strip=True) if title_tag else source.meta.get("url", "Unknown")
                
                # Process tables before text extraction
                self._process_tables_to_text(soup)
                
                # Extract main content
                content = self._extract_content(soup)
                
                if not content.strip():
                    logger.warning(f"No content extracted from {source.meta.get('url', 'unknown')}")
                    continue
                
                # Prepare metadata
                meta = {
                    "url": source.meta.get("url", ""),
                    "title": title,
                    "content_type": "text/html",
                    "encoding": encoding,
                    "size": len(content)
                }
                
                # Extract additional metadata if requested
                if self.extract_meta_tags:
                    meta.update(self._extract_meta_tags(soup))
                
                # Create Document
                document = Document(
                    content=content,
                    meta=meta
                )
                documents.append(document)
                
                logger.info(f"Successfully converted HTML to document: {len(content)} characters from {source.meta.get('url', 'unknown')}")
                
            except Exception as e:
                logger.error(f"Failed to convert HTML source: {e}", exc_info=True)
                continue
        
        logger.info(f"Converted {len(documents)} HTML sources to documents")
        return {"documents": documents}
    
    def _extract_content(self, soup: BeautifulSoup) -> str:
        """
        Extract text content from HTML.
        
        Args:
            soup: BeautifulSoup object
            
        Returns:
            Extracted text content
        """
        # Remove script and style elements
        for element in soup(["script", "style", "nav", "header", "footer"]):
            element.decompose()
        
        # Get text content
        content = soup.get_text()
        
        # Clean up whitespace
        lines = (line.strip() for line in content.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        content = ' '.join(chunk for chunk in chunks if chunk)
        
        return content
    
    def _extract_meta_tags(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """
        Extract metadata from HTML meta tags.
        
        Args:
            soup: BeautifulSoup object
            
        Returns:
            Dictionary of extracted metadata
        """
        meta_data = {}
        
        # Extract common meta tags
        meta_tags = {
            "description": ["description"],
            "keywords": ["keywords"], 
            "author": ["author"],
            "language": ["language", "lang"]
        }
        
        for key, names in meta_tags.items():
            for name in names:
                tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
                if tag and tag.get("content"):
                    meta_data[key] = tag["content"]
                    break
        
        return meta_data
    
    def _process_tables_to_text(self, soup: BeautifulSoup) -> None:
        """
        Convert HTML tables to structured text format in-place.
        
        Args:
            soup: BeautifulSoup object to process
        """
        tables = soup.find_all('table')
        logger.info(f"Processing {len(tables)} tables for structured text conversion")
        
        for i, table in enumerate(tables):
            # Convert table to structured text
            structured_text = self._table_to_structured_text(table)
            
            if structured_text:
                # Create a new div with the structured text
                new_div = soup.new_tag('div', **{'class': 'structured-table-data'})
                new_div.string = structured_text
                
                # Replace the table with the structured text div
                table.replace_with(new_div)
                logger.info(f"Table {i+1} converted to structured text ({len(structured_text)} chars)")
    
    def _table_to_structured_text(self, table) -> str:
        """
        Convert a table element to structured text format.
        
        Args:
            table: BeautifulSoup table element
            
        Returns:
            Structured text representation of the table
        """
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
        
        # Find the header row - look for rows with location names
        headers = None
        header_row_idx = 0
        
        for i, row in enumerate(rows):
            row_text = ' '.join(row).lower()
            # Look for Canadian location indicators
            if any(loc in row_text for loc in ['yukon', 'alaska', 'n.w.t', 'nunavut', 'canada']):
                headers = row
                header_row_idx = i
                logger.info(f"Found header row at index {i}: {headers}")
                break
        
        # Fallback to first row if no location headers found
        if headers is None:
            headers = rows[0]
            header_row_idx = 0
            logger.info(f"Using first row as headers: {headers}")
        
        # Process data rows (skip rows up to and including header row)
        for row_idx, row_data in enumerate(rows[header_row_idx + 1:], header_row_idx + 1):
            # Skip empty rows or rows with insufficient data
            if len(row_data) <= 1:
                continue
                
            # First column contains row labels
            row_label = row_data[0] if row_data else ""
            
            # Skip rows without meaningful labels
            if not row_label or len(row_label) < 3:
                continue
            
            # For each data cell, create explicit associations
            for col_idx, cell_value in enumerate(row_data[1:], 1):
                if col_idx < len(headers) and cell_value and col_idx < len(row_data):
                    column_header = headers[col_idx] if col_idx < len(headers) else ""
                    
                    # Skip empty values or headers
                    if not column_header or not cell_value or cell_value == column_header:
                        continue
                    
                    # Clean up the values
                    row_label_clean = row_label.strip()
                    column_header_clean = column_header.strip()
                    cell_value_clean = cell_value.strip()
                    
                    if row_label_clean and column_header_clean and cell_value_clean:
                        # Generate multiple text patterns for better matching
                        patterns = [
                            f"{row_label_clean} {column_header_clean}: {cell_value_clean}",
                            f"{column_header_clean} {row_label_clean}: {cell_value_clean}",
                            f"{row_label_clean} for {column_header_clean}: {cell_value_clean}",
                            f"{column_header_clean} rate for {row_label_clean}: {cell_value_clean}",
                            f"{row_label_clean} in {column_header_clean}: {cell_value_clean}",
                        ]
                        
                        # Add all patterns to ensure comprehensive matching
                        structured_lines.extend(patterns)
                        
                        # Log important associations for debugging
                        if any(term in row_label_clean.lower() for term in ['lunch', 'dinner', 'breakfast']):
                            logger.info(f"Added meal pattern: {row_label_clean} {column_header_clean}: {cell_value_clean}")
        
        result = "\n".join(structured_lines)
        if structured_lines:
            logger.info(f"Generated {len(structured_lines)} structured text patterns")
        return result