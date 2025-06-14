import logging
import httpx
from bs4 import BeautifulSoup
from typing import Optional

logger = logging.getLogger(__name__)


def fetch_url_content(url: str, timeout: int = 30) -> str:
    """Fetch content from a URL and extract text."""
    try:
        logger.info(f"Fetching content from: {url}")
        
        # Fetch the URL
        with httpx.Client(timeout=timeout) as client:
            response = client.get(url, follow_redirects=True)
            response.raise_for_status()
        
        # Extract text based on content type
        content_type = response.headers.get("content-type", "").lower()
        
        if "text/html" in content_type:
            # Parse HTML
            soup = BeautifulSoup(response.text, "html.parser")
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Get text
            text = soup.get_text()
            
            # Clean up text
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)
            
            return text
        else:
            # Return raw text for non-HTML content
            return response.text
            
    except httpx.HTTPError as e:
        logger.error(f"HTTP error fetching {url}: {e}")
        raise ValueError(f"Failed to fetch URL: {e}")
    except Exception as e:
        logger.error(f"Error fetching {url}: {e}")
        raise ValueError(f"Failed to process URL: {e}")