import logging
import re
from typing import List, Dict, Any, Optional
from io import StringIO
import pandas as pd
from bs4 import BeautifulSoup
import requests

from haystack import component, Document
from haystack.utils import Secret

logger = logging.getLogger(__name__)


@component
class TableAwareHTMLConverter:
    """
    Custom HTML converter that properly handles tables by extracting them
    separately and converting to Markdown format to prevent text corruption.
    """
    
    def __init__(self):
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    
    @component.output_types(documents=List[Document])
    def run(self, sources: List[str] = None, streams: List = None) -> Dict[str, Any]:
        """
        Convert HTML sources to documents with proper table handling.
        
        Args:
            sources: List of HTML content strings or URLs (optional)
            streams: List of ByteStreams from LinkContentFetcher (optional)
            
        Returns:
            Dictionary with 'documents' key containing list of Document objects
        """
        documents = []
        
        # Handle input from either sources or streams
        inputs_to_process = []
        
        if streams:
            # Convert ByteStreams to HTML strings
            for stream in streams:
                try:
                    html_content = stream.data.decode('utf-8', errors='ignore')
                    source_url = getattr(stream, 'meta', {}).get('url', 'unknown_url')
                    inputs_to_process.append((html_content, source_url, False))  # (content, url, is_url)
                except Exception as e:
                    logger.error(f"Error processing stream: {e}")
                    continue
        
        if sources:
            # Handle direct sources (URLs or HTML content)
            for source in sources:
                inputs_to_process.append((source, source, True))  # (content, url, is_url)
        
        for content, source_url, is_source_url in inputs_to_process:
            try:
                # Determine if source is URL or HTML content
                if is_source_url and content.startswith(('http://', 'https://')):
                    html_content = self._fetch_html(content)
                else:
                    html_content = content
                
                if not html_content:
                    logger.warning(f"Failed to get HTML content from {source_url}")
                    continue
                
                # Extract and process content
                processed_content = self._process_html_with_tables(html_content)
                
                if processed_content.strip():
                    doc = Document(
                        content=processed_content,
                        meta={
                            "source": source_url,
                            "content_type": "text",
                            "converter": "TableAwareHTMLConverter"
                        }
                    )
                    documents.append(doc)
                    logger.info(f"Successfully converted HTML from {source_url}")
                else:
                    logger.warning(f"No content extracted from {source_url}")
                    
            except Exception as e:
                logger.error(f"Error processing HTML source {source}: {e}", exc_info=True)
                continue
        
        return {"documents": documents}
    
    def _fetch_html(self, url: str) -> Optional[str]:
        """Fetch HTML content from URL with proper headers."""
        try:
            headers = {"User-Agent": self.user_agent}
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.error(f"Failed to fetch HTML from {url}: {e}")
            return None
    
    def _process_html_with_tables(self, html_content: str) -> str:
        """
        Process HTML content by extracting tables separately and converting
        them to Markdown format, while preserving other content.
        """
        try:
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract tables using pandas
            tables = self._extract_tables_with_pandas(html_content)
            
            # Replace tables in HTML with placeholders
            table_placeholders = {}
            for i, table_tag in enumerate(soup.find_all('table')):
                placeholder = f"__TABLE_PLACEHOLDER_{i}__"
                table_placeholders[placeholder] = i
                table_tag.replace_with(placeholder)
            
            # Get text content without tables
            text_content = soup.get_text(separator=' ', strip=True)
            
            # Clean up text content
            text_content = self._clean_text(text_content)
            
            # Replace table placeholders with Markdown tables
            for placeholder, table_idx in table_placeholders.items():
                if table_idx < len(tables):
                    markdown_table = self._dataframe_to_markdown(tables[table_idx])
                    text_content = text_content.replace(placeholder, f"\n\n{markdown_table}\n\n")
                else:
                    # Fallback: try BeautifulSoup extraction
                    text_content = text_content.replace(placeholder, "\n[Table content could not be extracted]\n")
            
            return text_content.strip()
            
        except Exception as e:
            logger.error(f"Error processing HTML with tables: {e}")
            # Fallback to basic text extraction
            return self._fallback_text_extraction(html_content)
    
    def _extract_tables_with_pandas(self, html_content: str) -> List[pd.DataFrame]:
        """Extract tables using pandas.read_html for robust table parsing."""
        try:
            # Use pandas to extract all tables
            tables = pd.read_html(StringIO(html_content), header=0)
            logger.info(f"Extracted {len(tables)} tables using pandas")
            return tables
        except Exception as e:
            logger.warning(f"Pandas table extraction failed: {e}")
            return []
    
    def _dataframe_to_markdown(self, df: pd.DataFrame) -> str:
        """Convert pandas DataFrame to Markdown table format."""
        try:
            # Clean the DataFrame
            df = df.fillna("")  # Replace NaN with empty string
            df = df.astype(str)  # Convert all to string to avoid formatting issues
            
            # Convert to markdown with proper formatting
            markdown = df.to_markdown(index=False, tablefmt="pipe")
            
            # Additional cleaning for better readability
            lines = markdown.split('\n')
            cleaned_lines = []
            for line in lines:
                if line.strip():  # Skip empty lines
                    # Clean up excessive whitespace while preserving table structure
                    cleaned_line = re.sub(r'\s+', ' ', line.strip())
                    cleaned_lines.append(cleaned_line)
            
            return '\n'.join(cleaned_lines)
            
        except Exception as e:
            logger.error(f"Error converting DataFrame to Markdown: {e}")
            return "[Table conversion failed]"
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text content."""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove multiple consecutive line breaks
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        # Clean up common HTML artifacts
        text = re.sub(r'&nbsp;', ' ', text)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        
        return text.strip()
    
    def _fallback_text_extraction(self, html_content: str) -> str:
        """Fallback text extraction when table processing fails."""
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Try to handle tables with BeautifulSoup as fallback
            for table in soup.find_all('table'):
                table_text = self._extract_table_with_soup(table)
                table.replace_with(f"\n\n{table_text}\n\n")
            
            text = soup.get_text(separator=' ', strip=True)
            return self._clean_text(text)
            
        except Exception as e:
            logger.error(f"Fallback text extraction failed: {e}")
            return "Content extraction failed"
    
    def _extract_table_with_soup(self, table_tag) -> str:
        """Extract table using BeautifulSoup as fallback."""
        try:
            rows = []
            for tr in table_tag.find_all('tr'):
                cells = []
                for td in tr.find_all(['td', 'th']):
                    cell_text = td.get_text(strip=True)
                    cells.append(cell_text)
                if cells:
                    rows.append(' | '.join(cells))
            
            if rows:
                # Add header separator for markdown-like format
                if len(rows) > 1:
                    header_sep = ' | '.join(['---'] * len(rows[0].split(' | ')))
                    rows.insert(1, header_sep)
                
                return '\n'.join(rows)
            else:
                return "[Empty table]"
                
        except Exception as e:
            logger.error(f"BeautifulSoup table extraction failed: {e}")
            return "[Table extraction failed]"