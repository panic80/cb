"""Enhanced table-aware document loader for any website or document type."""

import re
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import pandas as pd
from bs4 import BeautifulSoup, Tag
from langchain_core.documents import Document
from langchain_community.document_loaders import UnstructuredHTMLLoader
import httpx

from app.core.logging import get_logger
from app.models.documents import DocumentType

logger = get_logger(__name__)


class TableAwareWebLoader:
    """Enhanced web loader that preserves table structure for any website."""
    
    def __init__(self, url: str, timeout: int = 30):
        """Initialize table-aware web loader."""
        self.url = url
        self.timeout = timeout
        
    async def load(self) -> List[Document]:
        """Load and parse web content with enhanced table extraction."""
        try:
            # Fetch content
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    self.url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (compatible; TableAwareBot/1.0)",
                        "Accept": "text/html,application/xhtml+xml",
                        "Accept-Language": "en-US,en;q=0.9",
                    }
                )
                response.raise_for_status()
                
            # Parse HTML
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Extract all content including tables
            documents = self._extract_content_with_tables(soup)
            
            # Add metadata to all documents
            for doc in documents:
                doc.metadata.update({
                    "source": self.url,
                    "type": DocumentType.WEB,
                    "scraped_at": datetime.utcnow().isoformat(),
                })
            
            return documents
            
        except Exception as e:
            logger.error(f"Failed to load web content from {self.url}: {e}")
            raise
    
    def _extract_content_with_tables(self, soup: BeautifulSoup) -> List[Document]:
        """Extract content and create separate documents for tables."""
        documents = []
        
        # Remove unwanted elements
        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()
            
        # Find main content area
        content = self._find_main_content(soup)
        if not content:
            content = soup.find("body")
            
        if not content:
            return documents
            
        # Process content
        current_text = []
        current_section = None
        
        for element in content.find_all(["h1", "h2", "h3", "h4", "h5", "p", "li", "table", "dl", "div"]):
            if element.name.startswith("h"):
                # Save previous section if exists
                if current_text:
                    documents.append(self._create_document(
                        "\n".join(current_text), 
                        section=current_section
                    ))
                    current_text = []
                
                # Start new section
                current_section = element.get_text(strip=True)
                current_text.append(f"\n\n{current_section}\n")
                
            elif element.name == "table":
                # Save text before table
                if current_text:
                    documents.append(self._create_document(
                        "\n".join(current_text), 
                        section=current_section
                    ))
                    current_text = []
                
                # Extract table as separate document(s)
                table_docs = self._extract_table_documents(element, current_section)
                documents.extend(table_docs)
                
            elif element.name == "li":
                current_text.append(f"• {element.get_text(strip=True)}")
                
            elif element.name in ["p", "div"]:
                text = element.get_text(strip=True)
                if text and len(text) > 20:  # Skip very short text
                    current_text.append(text)
        
        # Don't forget the last section
        if current_text:
            documents.append(self._create_document(
                "\n".join(current_text), 
                section=current_section
            ))
            
        return documents
    
    def _find_main_content(self, soup: BeautifulSoup) -> Optional[Tag]:
        """Find the main content area of the page."""
        # Common content selectors
        selectors = [
            "main",
            "article", 
            "[role='main']",
            ".content",
            "#content",
            ".main-content",
            ".entry-content",
            ".post-content",
            ".page-content",
            ".article-content",
            ".mw-parser-output",  # Wikipedia
            ".mwsbodytext",       # Canada.ca
            ".gc-cnt-stts",       # Canada.ca content
        ]
        
        for selector in selectors:
            content = soup.select_one(selector)
            if content:
                return content
                
        # Fallback: find largest text container
        return self._find_largest_text_container(soup)
    
    def _find_largest_text_container(self, soup: BeautifulSoup) -> Optional[Tag]:
        """Find the container with the most text content."""
        containers = soup.find_all(["div", "section", "article"])
        if not containers:
            return None
            
        best_container = None
        max_text_length = 0
        
        for container in containers:
            text_length = len(container.get_text(strip=True))
            if text_length > max_text_length:
                max_text_length = text_length
                best_container = container
                
        return best_container
    
    def _extract_table_documents(self, table: Tag, section: Optional[str]) -> List[Document]:
        """Extract table as structured documents."""
        documents = []
        
        # Try to find table caption or title
        caption = table.find("caption")
        table_title = caption.get_text(strip=True) if caption else None
        
        # If no caption, try to find preceding header
        if not table_title:
            prev = table.find_previous_sibling(["h1", "h2", "h3", "h4", "h5", "p"])
            if prev and prev.name.startswith("h"):
                table_title = prev.get_text(strip=True)
        
        # Extract table data
        headers = []
        rows = []
        
        # Extract headers
        header_row = table.find("thead")
        if header_row:
            for th in header_row.find_all("th"):
                headers.append(th.get_text(strip=True))
        else:
            # Try first row
            first_row = table.find("tr")
            if first_row:
                ths = first_row.find_all("th")
                if ths:
                    headers = [th.get_text(strip=True) for th in ths]
                else:
                    # Check if first row looks like headers
                    tds = first_row.find_all("td")
                    if tds and all(td.get_text(strip=True).replace(" ", "").isalpha() for td in tds[:3]):
                        headers = [td.get_text(strip=True) for td in tds]
        
        # Extract data rows
        tbody = table.find("tbody") or table
        for tr in tbody.find_all("tr"):
            cells = []
            for td in tr.find_all(["td", "th"]):
                cells.append(td.get_text(strip=True))
            if cells and len(cells) > 1:  # Skip empty or single-cell rows
                rows.append(cells)
        
        # Remove header row from data if it was included
        if rows and headers and rows[0] == headers:
            rows = rows[1:]
        
        # Create different document formats for better retrieval
        
        # 1. Full table as markdown
        markdown_table = self._create_markdown_table(headers, rows)
        if markdown_table:
            documents.append(Document(
                page_content=markdown_table,
                metadata={
                    "table_title": table_title or "Table",
                    "section": section,
                    "content_type": "table_markdown",
                    "num_rows": len(rows),
                    "num_columns": len(headers) if headers else (len(rows[0]) if rows else 0),
                    "headers": headers,
                }
            ))
        
        # 2. Table as key-value pairs (for specific value lookups)
        if headers and rows:
            kv_content = self._create_key_value_content(headers, rows, table_title)
            if kv_content:
                documents.append(Document(
                    page_content=kv_content,
                    metadata={
                        "table_title": table_title or "Table",
                        "section": section,
                        "content_type": "table_key_value",
                        "headers": headers,
                    }
                ))
        
        # 3. Table as structured JSON (for complex queries)
        if headers and rows:
            json_content = self._create_json_content(headers, rows, table_title)
            documents.append(Document(
                page_content=json_content,
                metadata={
                    "table_title": table_title or "Table",
                    "section": section,
                    "content_type": "table_json",
                    "headers": headers,
                }
            ))
        
        return documents
    
    def _create_markdown_table(self, headers: List[str], rows: List[List[str]]) -> str:
        """Create a markdown representation of the table."""
        if not rows:
            return ""
            
        # Ensure all rows have same number of columns
        num_cols = len(headers) if headers else len(rows[0])
        
        lines = []
        
        # Add headers
        if headers:
            lines.append("| " + " | ".join(headers) + " |")
            lines.append("|" + "|".join(["---"] * len(headers)) + "|")
        
        # Add rows
        for row in rows:
            # Pad row if necessary
            padded_row = row + [""] * (num_cols - len(row))
            lines.append("| " + " | ".join(padded_row[:num_cols]) + " |")
        
        return "\n".join(lines)
    
    def _create_key_value_content(self, headers: List[str], rows: List[List[str]], title: Optional[str]) -> str:
        """Create key-value pairs from table for better retrieval."""
        lines = []
        
        if title:
            lines.append(f"Table: {title}")
            lines.append("")
        
        # For each row, create key-value pairs
        for row in rows:
            if len(row) >= 2:  # Need at least 2 columns
                # First column as key, rest as values
                key = row[0]
                if key:  # Skip empty keys
                    for i, header in enumerate(headers[1:], 1):
                        if i < len(row) and row[i]:
                            lines.append(f"{key} - {header}: {row[i]}")
        
        return "\n".join(lines)
    
    def _create_json_content(self, headers: List[str], rows: List[List[str]], title: Optional[str]) -> str:
        """Create JSON representation of table."""
        data = {
            "table_title": title or "Table",
            "headers": headers,
            "data": []
        }
        
        # Convert rows to list of dicts
        for row in rows:
            row_dict = {}
            for i, header in enumerate(headers):
                if i < len(row):
                    row_dict[header] = row[i]
            data["data"].append(row_dict)
        
        return json.dumps(data, indent=2, ensure_ascii=False)
    
    def _create_document(self, content: str, section: Optional[str] = None) -> Document:
        """Create a document with metadata."""
        # Clean content
        content = re.sub(r'\n{3,}', '\n\n', content)
        content = re.sub(r' {2,}', ' ', content)
        content = content.strip()
        
        if not content:
            return None
            
        metadata = {
            "content_type": "text",
        }
        
        if section:
            metadata["section"] = section
            
        return Document(
            page_content=content,
            metadata=metadata
        )


class UnstructuredTableLoader:
    """Use Unstructured library for advanced table extraction."""
    
    def __init__(self):
        """Initialize unstructured loader."""
        try:
            from unstructured.partition.html import partition_html
            from unstructured.partition.pdf import partition_pdf
            from unstructured.documents.elements import Table
            self.partition_html = partition_html
            self.partition_pdf = partition_pdf
            self.Table = Table
        except ImportError:
            logger.warning("Unstructured library not installed. Install with: pip install unstructured")
            self.partition_html = None
            self.partition_pdf = None
            self.Table = None
    
    async def load_html(self, html_content: str, source_url: str) -> List[Document]:
        """Load HTML content using Unstructured."""
        if not self.partition_html:
            # Fallback to basic loader
            return await TableAwareWebLoader(source_url).load()
        
        try:
            # Parse with unstructured
            elements = self.partition_html(text=html_content)
            
            documents = []
            current_section = None
            
            for element in elements:
                if element.category == "Title":
                    current_section = str(element)
                    
                if isinstance(element, self.Table):
                    # Extract table
                    table_text = str(element)
                    table_metadata = element.metadata.to_dict() if hasattr(element, 'metadata') else {}
                    
                    documents.append(Document(
                        page_content=table_text,
                        metadata={
                            "source": source_url,
                            "content_type": "table_unstructured",
                            "section": current_section,
                            **table_metadata
                        }
                    ))
                else:
                    # Regular content
                    documents.append(Document(
                        page_content=str(element),
                        metadata={
                            "source": source_url,
                            "content_type": element.category.lower(),
                            "section": current_section,
                        }
                    ))
            
            return documents
            
        except Exception as e:
            logger.error(f"Unstructured parsing failed: {e}")
            # Fallback to basic loader
            return await TableAwareWebLoader(source_url).load()