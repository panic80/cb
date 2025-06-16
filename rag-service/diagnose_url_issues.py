#!/usr/bin/env python3
"""
Diagnostic script to identify common URL ingestion issues.
"""

import subprocess
import sys
import logging
from pathlib import Path
import importlib.util

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_python_dependencies():
    """Check if required Python packages are installed."""
    logger.info("🔍 Checking Python dependencies...")
    
    required_packages = {
        'lxml': 'lxml (for HTML table extraction)',
        'requests': 'requests (for HTTP requests)',
        'beautifulsoup4': 'beautifulsoup4 (for HTML parsing)', 
        'haystack': 'haystack (for document processing)',
        'fastapi': 'fastapi (for API framework)',
        'pandas': 'pandas (for table processing)',
        'numpy': 'numpy (for numerical operations)'
    }
    
    missing_packages = []
    installed_packages = []
    
    for package, description in required_packages.items():
        try:
            spec = importlib.util.find_spec(package)
            if spec is None:
                missing_packages.append(f"❌ {package} - {description}")
            else:
                installed_packages.append(f"✅ {package} - {description}")
        except Exception as e:
            missing_packages.append(f"❌ {package} - {description} (Error: {e})")
    
    logger.info("Installed packages:")
    for pkg in installed_packages:
        logger.info(f"  {pkg}")
    
    if missing_packages:
        logger.warning("Missing packages:")
        for pkg in missing_packages:
            logger.warning(f"  {pkg}")
        return False
    else:
        logger.info("✅ All required packages are installed")
        return True

def check_service_configuration():
    """Check RAG service configuration."""
    logger.info("🔍 Checking service configuration...")
    
    config_file = Path(__file__).parent / "app" / "core" / "config.py"
    if not config_file.exists():
        logger.error(f"❌ Configuration file not found: {config_file}")
        return False
    
    try:
        with open(config_file, 'r') as f:
            config_content = f.read()
        
        # Check for key configuration settings
        checks = [
            ("OPENAI_API_KEY", "OpenAI API key configuration"),
            ("CRAWL_MAX_DEPTH", "Crawling depth configuration"),
            ("CRAWL_MAX_PAGES", "Crawling page limit configuration"),
            ("CHUNK_SIZE", "Document chunking configuration"),
            ("EMBEDDING_MODEL", "Embedding model configuration")
        ]
        
        for setting, description in checks:
            if setting in config_content:
                logger.info(f"✅ {description} found")
            else:
                logger.warning(f"⚠️ {description} not found in config")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Error reading configuration: {e}")
        return False

def check_log_files():
    """Check and analyze log files."""
    logger.info("🔍 Checking log files...")
    
    log_files = [
        Path(__file__).parent / "logs" / "rag_service.log",
        Path(__file__).parent / "rag_service.log"
    ]
    
    for log_file in log_files:
        if log_file.exists():
            logger.info(f"✅ Log file exists: {log_file}")
            
            # Check log file size
            size_mb = log_file.stat().st_size / (1024 * 1024)
            logger.info(f"📊 Log file size: {size_mb:.1f} MB")
            
            # Check for recent entries
            try:
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    if lines:
                        logger.info(f"📄 Total log lines: {len(lines)}")
                        logger.info(f"📅 Last log entry: {lines[-1].strip()}")
                    else:
                        logger.warning("⚠️ Log file is empty")
            except Exception as e:
                logger.error(f"❌ Error reading log file: {e}")
        else:
            logger.warning(f"⚠️ Log file not found: {log_file}")

def analyze_common_issues():
    """Analyze common URL ingestion issues from logs."""
    logger.info("🔍 Analyzing common issues...")
    
    log_file = Path(__file__).parent / "logs" / "rag_service.log"
    if not log_file.exists():
        log_file = Path(__file__).parent / "rag_service.log"
    
    if log_file.exists():
        try:
            with open(log_file, 'r') as f:
                log_content = f.read()
            
            # Common issues to check for
            issues = {
                "lxml": {
                    "pattern": "Missing optional dependency 'lxml'",
                    "description": "lxml package missing - affects table extraction",
                    "solution": "Install lxml: pip install lxml"
                },
                "pydantic_serialization": {
                    "pattern": "PydanticSerializationError",
                    "description": "Pydantic serialization error with numpy types",
                    "solution": "This is a known issue with numpy.float32 serialization"
                },
                "connection_error": {
                    "pattern": "ConnectionError",
                    "description": "Network connection issues",
                    "solution": "Check internet connectivity and firewall settings"
                },
                "timeout": {
                    "pattern": "TimeoutError",
                    "description": "Request timeout issues",
                    "solution": "Increase timeout settings or check target URLs"
                },
                "openai_api": {
                    "pattern": "OpenAI API",
                    "description": "OpenAI API related issues",
                    "solution": "Check OpenAI API key and usage limits"
                }
            }
            
            found_issues = []
            for issue_key, issue_info in issues.items():
                if issue_info["pattern"] in log_content:
                    count = log_content.count(issue_info["pattern"])
                    found_issues.append({
                        "issue": issue_key,
                        "count": count,
                        "description": issue_info["description"],
                        "solution": issue_info["solution"]
                    })
            
            if found_issues:
                logger.warning("⚠️ Issues found in logs:")
                for issue in found_issues:
                    logger.warning(f"  🔸 {issue['description']} (occurred {issue['count']} times)")
                    logger.info(f"    💡 Solution: {issue['solution']}")
            else:
                logger.info("✅ No common issues found in logs")
                
        except Exception as e:
            logger.error(f"❌ Error analyzing logs: {e}")
    else:
        logger.warning("⚠️ Cannot analyze logs - log file not found")

def check_virtual_environment():
    """Check if we're in a virtual environment and its status."""
    logger.info("🔍 Checking virtual environment...")
    
    venv_path = Path(__file__).parent / "venv"
    if venv_path.exists():
        logger.info("✅ Virtual environment directory found")
        
        # Check if we're currently in the venv
        if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            logger.info("✅ Currently running in virtual environment")
        else:
            logger.warning("⚠️ Not currently running in virtual environment")
            logger.info("💡 To activate: source venv/bin/activate")
        
        # Check pip packages in venv
        try:
            pip_list = subprocess.run(
                [str(venv_path / "bin" / "pip"), "list"],
                capture_output=True,
                text=True,
                check=True
            )
            package_count = len(pip_list.stdout.strip().split('\n')) - 2  # Subtract header lines
            logger.info(f"📦 {package_count} packages installed in virtual environment")
        except Exception as e:
            logger.warning(f"⚠️ Could not check pip packages: {e}")
    else:
        logger.warning("⚠️ Virtual environment directory not found")

def main():
    """Run all diagnostic checks."""
    logger.info("🚀 Starting RAG Service URL Ingestion Diagnostics")
    logger.info("=" * 60)
    
    checks = [
        ("Virtual Environment", check_virtual_environment),
        ("Python Dependencies", check_python_dependencies),
        ("Service Configuration", check_service_configuration),
        ("Log Files", check_log_files),
        ("Common Issues Analysis", analyze_common_issues)
    ]
    
    results = []
    for check_name, check_func in checks:
        logger.info(f"\n{'-' * 40}")
        logger.info(f"Running: {check_name}")
        logger.info(f"{'-' * 40}")
        
        try:
            result = check_func()
            results.append((check_name, result))
        except Exception as e:
            logger.error(f"❌ {check_name} failed: {e}")
            results.append((check_name, False))
    
    # Summary
    logger.info(f"\n{'=' * 60}")
    logger.info("📋 DIAGNOSTIC SUMMARY")
    logger.info(f"{'=' * 60}")
    
    for check_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        logger.info(f"{status} - {check_name}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    if passed == total:
        logger.info("🎉 All diagnostics passed!")
    else:
        logger.warning(f"⚠️ {total - passed} diagnostic(s) failed")
        logger.info("💡 Review the issues above and follow the suggested solutions")

if __name__ == "__main__":
    main()