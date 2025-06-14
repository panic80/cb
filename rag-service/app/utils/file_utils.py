import logging
import tempfile
from pathlib import Path
from typing import Set, Dict
from fastapi import UploadFile

logger = logging.getLogger(__name__)

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


async def save_uploaded_file(file: UploadFile, content: bytes) -> Path:
    """Save uploaded file to temporary location."""
    # Get appropriate extension
    extension = Path(file.filename).suffix or get_file_extension(file.content_type)
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp_file:
        tmp_file.write(content)
        return Path(tmp_file.name)