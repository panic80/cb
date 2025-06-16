#!/usr/bin/env python3
"""
Simple test script to debug URL ingestion in the RAG service.
This script tests the URL ingestion pipeline end-to-end.
"""

import asyncio
import json
import logging
import sys
import time
from pathlib import Path
import requests
from typing import Dict, Any, Optional

# Add the app directory to the Python path
sys.path.insert(0, str(Path(__file__).parent / "app"))

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test URLs of varying complexity
TEST_URLS = [
    {
        "url": "https://httpbin.org/html",
        "description": "Simple HTML test page",
        "expected_success": True
    },
    {
        "url": "https://example.com",
        "description": "Basic example.com page",
        "expected_success": True
    },
    {
        "url": "https://www.canada.ca/en.html",
        "description": "Government site (from logs)",
        "expected_success": True
    },
    {
        "url": "https://invalid-url-that-should-fail.nonexistent",
        "description": "Invalid URL to test error handling",
        "expected_success": False
    }
]

class URLIngestionTester:
    """Test class for URL ingestion debugging."""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()
        
    def check_service_health(self) -> bool:
        """Check if the RAG service is running."""
        try:
            response = self.session.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                logger.info("✅ RAG service is running")
                return True
            else:
                logger.error(f"❌ RAG service returned status {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Cannot connect to RAG service: {e}")
            return False
    
    def test_url_ingestion(self, url: str, description: str, enable_crawling: bool = False) -> Dict[str, Any]:
        """Test URL ingestion via API."""
        logger.info(f"🔍 Testing: {description}")
        logger.info(f"📋 URL: {url}")
        
        payload = {
            "url": url,
            "metadata": {
                "test_run": True,
                "description": description,
                "timestamp": time.time()
            },
            "enable_crawling": enable_crawling,
            "max_depth": 1,
            "max_pages": 5
        }
        
        try:
            # Submit ingestion job
            logger.info("📤 Submitting URL ingestion request...")
            response = self.session.post(
                f"{self.base_url}/ingest/url",
                json=payload,
                timeout=30
            )
            
            if response.status_code != 200:
                logger.error(f"❌ Ingestion request failed: {response.status_code}")
                logger.error(f"Response: {response.text}")
                return {"success": False, "error": f"HTTP {response.status_code}"}
            
            result = response.json()
            job_id = result.get("id")
            logger.info(f"✅ Ingestion job submitted: {job_id}")
            
            # Poll for job completion
            return self.wait_for_job_completion(job_id)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Network error during ingestion: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"❌ Unexpected error during ingestion: {e}")
            return {"success": False, "error": str(e)}
    
    def wait_for_job_completion(self, job_id: str, max_wait: int = 120) -> Dict[str, Any]:
        """Wait for ingestion job to complete."""
        logger.info(f"⏳ Waiting for job {job_id} to complete...")
        
        start_time = time.time()
        while time.time() - start_time < max_wait:
            try:
                response = self.session.get(f"{self.base_url}/ingest/jobs/{job_id}")
                if response.status_code != 200:
                    logger.warning(f"⚠️ Job status check failed: {response.status_code}")
                    time.sleep(2)
                    continue
                
                job_status = response.json()
                status = job_status.get("status")
                
                if status == "completed":
                    result = job_status.get("result", {})
                    logger.info(f"✅ Job completed successfully!")
                    logger.info(f"📊 Document ID: {result.get('document_id')}")
                    logger.info(f"📊 Chunk count: {result.get('chunk_count')}")
                    return {"success": True, "result": result, "job_status": job_status}
                
                elif status == "failed":
                    error = job_status.get("error", "Unknown error")
                    logger.error(f"❌ Job failed: {error}")
                    return {"success": False, "error": error, "job_status": job_status}
                
                elif status in ["pending", "processing"]:
                    logger.info(f"⏳ Job status: {status}")
                    time.sleep(3)
                    continue
                
                else:
                    logger.warning(f"⚠️ Unknown job status: {status}")
                    time.sleep(2)
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"⚠️ Error checking job status: {e}")
                time.sleep(2)
        
        logger.error(f"❌ Job {job_id} did not complete within {max_wait} seconds")
        return {"success": False, "error": "Timeout waiting for job completion"}
    
    def test_basic_connectivity(self, url: str) -> Dict[str, Any]:
        """Test basic connectivity to a URL."""
        logger.info(f"🌐 Testing basic connectivity to: {url}")
        
        try:
            response = requests.get(url, timeout=10, allow_redirects=True)
            logger.info(f"✅ URL accessible: Status {response.status_code}")
            logger.info(f"📄 Content-Type: {response.headers.get('content-type', 'unknown')}")
            logger.info(f"📏 Content-Length: {len(response.content)} bytes")
            
            return {
                "accessible": True,
                "status_code": response.status_code,
                "content_type": response.headers.get('content-type'),
                "content_length": len(response.content)
            }
        except Exception as e:
            logger.error(f"❌ URL not accessible: {e}")
            return {"accessible": False, "error": str(e)}
    
    def run_comprehensive_test(self):
        """Run comprehensive URL ingestion tests."""
        logger.info("🚀 Starting comprehensive URL ingestion test...")
        
        # Check service health
        if not self.check_service_health():
            logger.error("❌ Cannot proceed - RAG service is not accessible")
            return
        
        results = []
        
        for test_case in TEST_URLS:
            url = test_case["url"]
            description = test_case["description"]
            expected_success = test_case["expected_success"]
            
            logger.info(f"\n{'='*60}")
            logger.info(f"🧪 Test Case: {description}")
            logger.info(f"{'='*60}")
            
            # Test basic connectivity first
            connectivity = self.test_basic_connectivity(url)
            
            # Only test ingestion if URL is accessible or if we expect it to fail
            if connectivity.get("accessible") or not expected_success:
                # Test ingestion
                ingestion_result = self.test_url_ingestion(url, description)
                
                result = {
                    "url": url,
                    "description": description,
                    "expected_success": expected_success,
                    "connectivity": connectivity,
                    "ingestion": ingestion_result,
                    "test_passed": ingestion_result["success"] == expected_success
                }
            else:
                result = {
                    "url": url,
                    "description": description,
                    "expected_success": expected_success,
                    "connectivity": connectivity,
                    "ingestion": {"success": False, "error": "URL not accessible"},
                    "test_passed": False if expected_success else True
                }
            
            results.append(result)
            
            # Add delay between tests
            if url != TEST_URLS[-1]["url"]:
                logger.info("⏸️ Waiting 5 seconds before next test...")
                time.sleep(5)
        
        # Print summary
        self.print_test_summary(results)
    
    def print_test_summary(self, results: list):
        """Print a summary of test results."""
        logger.info(f"\n{'='*60}")
        logger.info("📋 TEST SUMMARY")
        logger.info(f"{'='*60}")
        
        total_tests = len(results)
        passed_tests = sum(1 for r in results if r["test_passed"])
        
        logger.info(f"Total tests: {total_tests}")
        logger.info(f"Passed: {passed_tests}")
        logger.info(f"Failed: {total_tests - passed_tests}")
        
        for i, result in enumerate(results, 1):
            status = "✅ PASS" if result["test_passed"] else "❌ FAIL"
            logger.info(f"{i}. {status} - {result['description']}")
            
            if not result["test_passed"]:
                logger.info(f"   Error: {result['ingestion'].get('error', 'Unknown error')}")
        
        if passed_tests == total_tests:
            logger.info("🎉 All tests passed!")
        else:
            logger.info(f"⚠️ {total_tests - passed_tests} test(s) failed")


def main():
    """Main function to run URL ingestion tests."""
    tester = URLIngestionTester()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--single":
        # Test single URL
        if len(sys.argv) > 2:
            url = sys.argv[2]
            description = f"Single URL test: {url}"
            logger.info(f"🧪 Testing single URL: {url}")
            
            if tester.check_service_health():
                connectivity = tester.test_basic_connectivity(url)
                if connectivity.get("accessible"):
                    result = tester.test_url_ingestion(url, description)
                    if result["success"]:
                        logger.info("🎉 Single URL test completed successfully!")
                    else:
                        logger.error(f"❌ Single URL test failed: {result.get('error')}")
                else:
                    logger.error("❌ URL is not accessible")
        else:
            logger.error("❌ Please provide a URL for single test mode")
            logger.info("Usage: python test_url_ingestion.py --single <URL>")
    else:
        # Run comprehensive tests
        tester.run_comprehensive_test()


if __name__ == "__main__":
    main()