import logging
from typing import List, Dict, Any
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from haystack import component
from haystack.dataclasses.byte_stream import ByteStream

logger = logging.getLogger(__name__)


@component
class CustomURLFetcher:
    """Custom URL fetcher that reliably fetches HTML content from URLs."""
    
    def __init__(self, timeout: int = 30, max_retries: int = 3):
        """
        Initialize the fetcher.
        
        Args:
            timeout: Request timeout in seconds
            max_retries: Number of retry attempts
        """
        self.timeout = timeout
        self.max_retries = max_retries
        
        # Configure session with retries
        self.session = requests.Session()
        retry_strategy = Retry(
            total=max_retries,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Set user agent to avoid blocking
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; RAG Service/1.0)'
        })

    @component.output_types(streams=List[ByteStream])
    def run(self, urls: List[str]) -> Dict[str, Any]:
        """
        Fetch content from URLs.
        
        Args:
            urls: List of URLs to fetch
            
        Returns:
            Dictionary containing list of ByteStream objects
        """
        streams = []
        
        for url in urls:
            try:
                logger.info(f"Fetching URL: {url}")
                
                response = self.session.get(url, timeout=self.timeout)
                response.raise_for_status()
                
                # Create ByteStream with metadata
                stream = ByteStream(
                    data=response.content,
                    meta={
                        "url": url,
                        "status_code": response.status_code,
                        "content_type": response.headers.get("content-type", ""),
                        "encoding": response.encoding or "utf-8",
                        "size": len(response.content)
                    }
                )
                streams.append(stream)
                
                logger.info(f"Successfully fetched {len(response.content)} bytes from {url}")
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to fetch {url}: {e}")
                # Create empty stream to maintain pipeline flow
                streams.append(ByteStream(
                    data=b"",
                    meta={
                        "url": url,
                        "error": str(e),
                        "status": "failed"
                    }
                ))
            except Exception as e:
                logger.error(f"Unexpected error fetching {url}: {e}")
                streams.append(ByteStream(
                    data=b"",
                    meta={
                        "url": url,
                        "error": str(e),
                        "status": "failed"
                    }
                ))
        
        return {"streams": streams}