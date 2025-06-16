import logging
import time
import urllib.robotparser
from typing import List, Dict, Any, Set, Optional
from urllib.parse import urljoin, urlparse, urlunparse
from dataclasses import dataclass
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from haystack import component, default_from_dict, default_to_dict
from haystack.lazy_imports import LazyImport
from haystack.dataclasses import ByteStream

logger = logging.getLogger(__name__)

with LazyImport(message="Run 'pip install beautifulsoup4'") as bs4_import:
    from bs4 import BeautifulSoup


@dataclass
class CrawlSettings:
    """Settings for web crawling."""
    max_depth: int = 1
    max_pages: int = 10
    delay: float = 1.0  # Delay between requests in seconds
    respect_robots_txt: bool = True
    allowed_domains: Optional[List[str]] = None
    blocked_domains: Optional[List[str]] = None
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    timeout: int = 30
    follow_external_links: bool = False


@component
class WebCrawler:
    """
    A component for crawling web pages with configurable depth and rules.
    
    This component fetches content from URLs and can follow links to a specified depth.
    It respects robots.txt, implements rate limiting, and handles duplicate URLs.
    """

    def __init__(
        self,
        max_depth: int = 1,
        max_pages: int = 10,
        delay: float = 1.0,
        respect_robots_txt: bool = True,
        allowed_domains: Optional[List[str]] = None,
        blocked_domains: Optional[List[str]] = None,
        max_file_size: int = 10 * 1024 * 1024,
        timeout: int = 30,
        follow_external_links: bool = False,
        user_agent: str = "Haystack WebCrawler/1.0",
    ):
        """
        Initialize the WebCrawler.

        :param max_depth: Maximum depth to crawl (0 = only initial URL, 1 = initial + linked pages)
        :param max_pages: Maximum number of pages to crawl
        :param delay: Delay between requests in seconds
        :param respect_robots_txt: Whether to respect robots.txt rules
        :param allowed_domains: List of allowed domains (if None, allow all)
        :param blocked_domains: List of blocked domains
        :param max_file_size: Maximum file size to download in bytes
        :param timeout: Request timeout in seconds
        :param follow_external_links: Whether to follow links to external domains
        :param user_agent: User agent string for requests
        """
        bs4_import.check()
        
        self.settings = CrawlSettings(
            max_depth=max_depth,
            max_pages=max_pages,
            delay=delay,
            respect_robots_txt=respect_robots_txt,
            allowed_domains=allowed_domains,
            blocked_domains=blocked_domains or [],
            max_file_size=max_file_size,
            timeout=timeout,
            follow_external_links=follow_external_links,
        )
        self.user_agent = user_agent
        
        # Setup session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.session.headers.update({"User-Agent": self.user_agent})
        
        # Cache for robots.txt
        self._robots_cache: Dict[str, urllib.robotparser.RobotFileParser] = {}

    def to_dict(self) -> Dict[str, Any]:
        """Serialize this component to a dictionary."""
        return default_to_dict(
            self,
            max_depth=self.settings.max_depth,
            max_pages=self.settings.max_pages,
            delay=self.settings.delay,
            respect_robots_txt=self.settings.respect_robots_txt,
            allowed_domains=self.settings.allowed_domains,
            blocked_domains=self.settings.blocked_domains,
            max_file_size=self.settings.max_file_size,
            timeout=self.settings.timeout,
            follow_external_links=self.settings.follow_external_links,
            user_agent=self.user_agent,
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WebCrawler":
        """Deserialize this component from a dictionary."""
        return default_from_dict(cls, data)

    def _can_fetch(self, url: str) -> bool:
        """Check if we can fetch the URL according to robots.txt."""
        if not self.settings.respect_robots_txt:
            return True
            
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        if base_url not in self._robots_cache:
            robots_url = urljoin(base_url, "/robots.txt")
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(robots_url)
            try:
                rp.read()
                self._robots_cache[base_url] = rp
            except Exception as e:
                logger.warning(f"Could not read robots.txt for {base_url}: {e}")
                # If we can't read robots.txt, assume we can fetch
                return True
        
        return self._robots_cache[base_url].can_fetch(self.user_agent, url)

    def _is_allowed_domain(self, url: str) -> bool:
        """Check if the URL domain is allowed."""
        domain = urlparse(url).netloc.lower()
        
        # Check blocked domains
        if domain in [d.lower() for d in self.settings.blocked_domains]:
            return False
            
        # Check allowed domains (if specified)
        if self.settings.allowed_domains:
            return domain in [d.lower() for d in self.settings.allowed_domains]
            
        return True

    def _should_follow_url(self, url: str, base_domain: str) -> bool:
        """Determine if we should follow this URL."""
        parsed_url = urlparse(url)
        url_domain = parsed_url.netloc.lower()
        
        # Check if it's an external link
        if url_domain != base_domain and not self.settings.follow_external_links:
            return False
            
        # Check domain restrictions
        if not self._is_allowed_domain(url):
            return False
            
        # Check robots.txt
        if not self._can_fetch(url):
            return False
            
        # Only follow HTTP/HTTPS links
        if parsed_url.scheme not in ['http', 'https']:
            return False
            
        return True

    def _extract_links(self, html_content: str, base_url: str) -> List[str]:
        """Extract links from HTML content."""
        soup = BeautifulSoup(html_content, 'html.parser')
        links = []
        
        for link in soup.find_all('a', href=True):
            href = link['href'].strip()
            if not href or href.startswith('#') or href.startswith('mailto:') or href.startswith('tel:'):
                continue
                
            # Convert relative URLs to absolute
            absolute_url = urljoin(base_url, href)
            
            # Remove fragment
            parsed = urlparse(absolute_url)
            clean_url = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, parsed.query, ''))
            
            links.append(clean_url)
        
        return list(set(links))  # Remove duplicates

    def _fetch_url(self, url: str) -> Optional[ByteStream]:
        """Fetch content from a single URL."""
        try:
            logger.info(f"Fetching URL: {url}")
            
            # Make HEAD request first to check content type and size
            head_response = self.session.head(url, timeout=self.settings.timeout, allow_redirects=True)
            
            # Check content type
            content_type = head_response.headers.get('Content-Type', '').lower()
            if not any(ct in content_type for ct in ['text/html', 'text/plain', 'application/xhtml']):
                logger.warning(f"Skipping {url}: unsupported content type {content_type}")
                return None
                
            # Check file size
            content_length = head_response.headers.get('Content-Length')
            if content_length and int(content_length) > self.settings.max_file_size:
                logger.warning(f"Skipping {url}: file too large ({content_length} bytes)")
                return None
            
            # Fetch the actual content
            response = self.session.get(url, timeout=self.settings.timeout)
            response.raise_for_status()
            
            # Check actual content size
            if len(response.content) > self.settings.max_file_size:
                logger.warning(f"Skipping {url}: content too large ({len(response.content)} bytes)")
                return None
            
            # Create ByteStream
            meta = {
                "url": url,
                "status_code": response.status_code,
                "content_type": response.headers.get('Content-Type', ''),
                "content_length": len(response.content),
            }
            
            return ByteStream(
                data=response.content,
                meta=meta,
            )
            
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    @component.output_types(streams=List[ByteStream])
    def run(self, urls: List[str]) -> Dict[str, List[ByteStream]]:
        """
        Crawl the provided URLs up to the specified depth.

        :param urls: List of URLs to crawl
        :return: Dictionary with 'streams' key containing fetched content
        """
        try:
            logger.info(f"WebCrawler starting with URLs: {urls}")
            logger.info(f"Crawl settings - max_depth: {self.settings.max_depth}, max_pages: {self.settings.max_pages}, follow_external: {self.settings.follow_external_links}")
            
            streams = []
            visited_urls: Set[str] = set()
            urls_to_crawl = [(url, 0) for url in urls]  # (url, depth)
            pages_crawled = 0
            
            while urls_to_crawl and pages_crawled < self.settings.max_pages:
                current_url, depth = urls_to_crawl.pop(0)
                
                logger.info(f"Processing URL: {current_url} at depth {depth}")
                
                # Skip if already visited
                if current_url in visited_urls:
                    logger.info(f"Skipping {current_url} - already visited")
                    continue
                    
                # Skip if depth exceeded
                if depth > self.settings.max_depth:
                    logger.info(f"Skipping {current_url} - depth {depth} exceeds max_depth {self.settings.max_depth}")
                    continue
                    
                visited_urls.add(current_url)
                
                # Fetch the URL
                stream = self._fetch_url(current_url)
                if stream:
                    streams.append(stream)
                    pages_crawled += 1
                    logger.info(f"Successfully fetched page {pages_crawled}/{self.settings.max_pages}: {current_url}")
                    
                    # Extract links if we haven't reached max depth
                    if depth < self.settings.max_depth:
                        try:
                            content = stream.data.decode('utf-8', errors='ignore')
                            base_domain = urlparse(current_url).netloc.lower()
                            links = self._extract_links(content, current_url)
                            
                            logger.info(f"Found {len(links)} links on {current_url}")
                            
                            # Add new links to crawl queue
                            for link in links:
                                if link not in visited_urls and self._should_follow_url(link, base_domain):
                                    urls_to_crawl.append((link, depth + 1))
                                    logger.debug(f"Added to crawl queue: {link} at depth {depth + 1}")
                                    
                        except Exception as e:
                            logger.error(f"Error extracting links from {current_url}: {e}")
                else:
                    logger.warning(f"Failed to fetch {current_url}")
                
                # Rate limiting
                if self.settings.delay > 0:
                    time.sleep(self.settings.delay)
            
            logger.info(f"Crawling completed. Fetched {len(streams)} pages from {len(visited_urls)} URLs visited")
            
            if len(streams) == 0:
                logger.warning("No content was fetched from any URLs!")
                
            return {"streams": streams}
            
        except Exception as e:
            logger.error(f"WebCrawler run failed: {e}", exc_info=True)
            return {"streams": []}