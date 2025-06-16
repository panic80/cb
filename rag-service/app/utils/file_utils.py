import logging
import tempfile
import hashlib
from pathlib import Path
from typing import Set, Dict, Optional
from fastapi import UploadFile

logger = logging.getLogger(__name__)

# Try to import python-magic for file type detection, fallback gracefully
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    logger.warning("python-magic not available, using basic file type validation")

# Supported file types - aligned with Haystack's built-in converters
SUPPORTED_FILE_TYPES: Set[str] = {
    "text/plain",
    "text/markdown",
    "text/html",
    "application/pdf",
    "application/json",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}

# File extension mapping
FILE_EXTENSIONS: Dict[str, str] = {
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/html": ".html",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/csv": ".csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel": ".xls",
}


def validate_file_type(content_type: str) -> bool:
    """Validate if file type is supported."""
    return content_type in SUPPORTED_FILE_TYPES


def get_file_extension(content_type: str) -> str:
    """Get file extension for content type."""
    return FILE_EXTENSIONS.get(content_type, ".txt")


async def save_uploaded_file(file: UploadFile, content: bytes = None) -> Path:
    """Save uploaded file to temporary location."""
    # Get appropriate extension
    extension = Path(file.filename).suffix or get_file_extension(file.content_type)
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp_file:
        if content is not None:
            # Use provided content (backward compatibility)
            tmp_file.write(content)
        else:
            # Stream file directly from upload to disk (memory efficient)
            await file.seek(0)  # Reset file pointer to beginning
            while chunk := await file.read(8192):  # Read in 8KB chunks
                tmp_file.write(chunk)
        return Path(tmp_file.name)


async def save_uploaded_file_streaming(file: UploadFile) -> Path:
    """Save uploaded file to temporary location using streaming (memory efficient)."""
    # Get appropriate extension
    extension = Path(file.filename).suffix or get_file_extension(file.content_type)
    
    # Create temporary file and stream content
    with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp_file:
        await file.seek(0)  # Reset file pointer to beginning
        while chunk := await file.read(8192):  # Read in 8KB chunks
            tmp_file.write(chunk)
        return Path(tmp_file.name)


async def check_file_size_streaming(file: UploadFile, max_size: int) -> int:
    """Check file size by streaming without loading entire file into memory.
    
    Returns the actual file size if within limits.
    Raises ValueError if file exceeds max_size.
    """
    await file.seek(0)  # Reset to beginning
    total_size = 0
    
    while chunk := await file.read(8192):  # Read in 8KB chunks
        total_size += len(chunk)
        if total_size > max_size:
            # Reset file pointer for later use
            await file.seek(0)
            raise ValueError(f"File size {total_size} exceeds maximum {max_size}")
    
    # Reset file pointer for later use
    await file.seek(0)
    return total_size


def validate_filename(filename: str) -> bool:
    """Validate filename for security and compatibility."""
    if not filename:
        return False
    
    # Check for basic security issues
    if ".." in filename or "/" in filename or "\\" in filename:
        return False
    
    # Check for reasonable length
    if len(filename) > 255:
        return False
    
    # Check for valid characters (basic check)
    import re
    if not re.match(r'^[a-zA-Z0-9._-]+$', filename):
        return False
    
    return True


async def validate_file_content(file: UploadFile) -> bool:
    """Validate file content matches the declared MIME type.
    
    Returns True if validation passes or if python-magic is not available.
    """
    if not MAGIC_AVAILABLE:
        logger.debug("Magic not available, skipping content validation")
        return True
    
    try:
        # Read first 2KB to detect file type
        await file.seek(0)
        header = await file.read(2048)
        await file.seek(0)  # Reset for later use
        
        if not header:
            return False
        
        # Detect MIME type
        detected_type = magic.from_buffer(header, mime=True)
        
        # Allow some flexibility in MIME type matching
        declared_type = file.content_type.lower()
        detected_type = detected_type.lower()
        
        # Direct match
        if declared_type == detected_type:
            return True
        
        # Common variations and aliases
        type_aliases = {
            "text/plain": ["text/plain", "text/x-plain"],
            "application/pdf": ["application/pdf"],
            "text/html": ["text/html", "application/xhtml+xml"],
            "text/csv": ["text/csv", "text/plain"],
            "application/json": ["application/json", "text/plain"],
        }
        
        for canonical, aliases in type_aliases.items():
            if declared_type == canonical and detected_type in aliases:
                return True
            if detected_type == canonical and declared_type in aliases:
                return True
        
        logger.warning(f"MIME type mismatch: declared={declared_type}, detected={detected_type}")
        return False
        
    except Exception as e:
        logger.error(f"Error validating file content: {e}")
        # On error, allow the file (fail open for usability)
        return True


async def validate_file_comprehensive(
    file: UploadFile, 
    max_size: int,
    check_content: bool = True
) -> Dict[str, any]:
    """Perform comprehensive file validation.
    
    Returns dictionary with validation results and file info.
    """
    results = {
        "valid": True,
        "errors": [],
        "warnings": [],
        "file_size": 0,
        "filename_valid": True,
        "type_valid": True,
        "content_valid": True
    }
    
    # Validate filename
    if not validate_filename(file.filename):
        results["valid"] = False
        results["filename_valid"] = False
        results["errors"].append("Invalid filename: contains unsafe characters or is too long")
    
    # Validate declared MIME type
    if not validate_file_type(file.content_type):
        results["valid"] = False
        results["type_valid"] = False
        results["errors"].append(f"Unsupported file type: {file.content_type}")
    
    # Check file size
    try:
        results["file_size"] = await check_file_size_streaming(file, max_size)
    except ValueError as e:
        results["valid"] = False
        results["errors"].append(str(e))
    
    # Validate file content (if requested and possible)
    if check_content:
        content_valid = await validate_file_content(file)
        results["content_valid"] = content_valid
        if not content_valid:
            results["warnings"].append("File content may not match declared MIME type")
    
    return results


async def calculate_file_hash(file: UploadFile) -> str:
    """Calculate SHA256 hash of file content for idempotency checking."""
    hasher = hashlib.sha256()
    
    await file.seek(0)  # Reset to beginning
    while chunk := await file.read(8192):
        hasher.update(chunk)
    
    # Reset file pointer for later use
    await file.seek(0)
    return hasher.hexdigest()


def calculate_file_hash_from_path(file_path: str) -> str:
    """Calculate SHA256 hash of file at given path."""
    hasher = hashlib.sha256()
    
    with open(file_path, 'rb') as f:
        while chunk := f.read(8192):
            hasher.update(chunk)
    
    return hasher.hexdigest()


def calculate_content_hash(content: bytes) -> str:
    """Calculate SHA256 hash of content bytes."""
    return hashlib.sha256(content).hexdigest()