"""Custom error types and error handling utilities."""

from typing import Optional, Dict, Any
from enum import Enum
import traceback
from datetime import datetime


class ErrorCategory(Enum):
    """Categories of errors for better handling."""
    NETWORK = "network"
    PARSING = "parsing"
    VALIDATION = "validation"
    STORAGE = "storage"
    PROCESSING = "processing"
    AUTHENTICATION = "authentication"
    RATE_LIMIT = "rate_limit"
    UNKNOWN = "unknown"


class IngestionError(Exception):
    """Base exception for ingestion errors."""
    
    def __init__(
        self,
        message: str,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        details: Optional[Dict[str, Any]] = None,
        recoverable: bool = True,
        retry_after: Optional[int] = None
    ):
        """Initialize ingestion error."""
        super().__init__(message)
        self.message = message
        self.category = category
        self.details = details or {}
        self.recoverable = recoverable
        self.retry_after = retry_after
        self.timestamp = datetime.utcnow()
        self.traceback = traceback.format_exc()
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for logging/response."""
        return {
            "error": self.message,
            "category": self.category.value,
            "details": self.details,
            "recoverable": self.recoverable,
            "retry_after": self.retry_after,
            "timestamp": self.timestamp.isoformat(),
            "traceback": self.traceback if self.details.get("include_traceback") else None
        }


class NetworkError(IngestionError):
    """Network-related errors."""
    
    def __init__(self, message: str, url: Optional[str] = None, status_code: Optional[int] = None):
        details = {}
        if url:
            details["url"] = url
        if status_code:
            details["status_code"] = status_code
            
        # Determine if error is recoverable based on status code
        recoverable = status_code not in [400, 401, 403, 404] if status_code else True
        
        super().__init__(
            message=message,
            category=ErrorCategory.NETWORK,
            details=details,
            recoverable=recoverable
        )


class ParsingError(IngestionError):
    """Document parsing errors."""
    
    def __init__(self, message: str, document_type: Optional[str] = None, source: Optional[str] = None):
        details = {}
        if document_type:
            details["document_type"] = document_type
        if source:
            details["source"] = source
            
        super().__init__(
            message=message,
            category=ErrorCategory.PARSING,
            details=details,
            recoverable=False  # Parsing errors usually require fixing the source
        )


class ValidationError(IngestionError):
    """Input validation errors."""
    
    def __init__(self, message: str, field: Optional[str] = None, value: Optional[Any] = None):
        details = {}
        if field:
            details["field"] = field
        if value is not None:
            details["value"] = str(value)
            
        super().__init__(
            message=message,
            category=ErrorCategory.VALIDATION,
            details=details,
            recoverable=False  # Validation errors require fixing input
        )


class StorageError(IngestionError):
    """Vector store or database errors."""
    
    def __init__(self, message: str, operation: Optional[str] = None):
        details = {}
        if operation:
            details["operation"] = operation
            
        super().__init__(
            message=message,
            category=ErrorCategory.STORAGE,
            details=details,
            recoverable=True  # Storage errors might be temporary
        )


class RateLimitError(IngestionError):
    """Rate limiting errors."""
    
    def __init__(self, message: str, retry_after: int):
        super().__init__(
            message=message,
            category=ErrorCategory.RATE_LIMIT,
            details={"retry_after": retry_after},
            recoverable=True,
            retry_after=retry_after
        )


def categorize_error(error: Exception) -> IngestionError:
    """Categorize generic exceptions into specific ingestion errors."""
    error_str = str(error).lower()
    
    # Network-related errors
    if any(keyword in error_str for keyword in ["connection", "timeout", "network", "refused"]):
        return NetworkError(f"Network error: {error}")
        
    # Parsing errors
    elif any(keyword in error_str for keyword in ["parse", "decode", "invalid format", "malformed"]):
        return ParsingError(f"Parsing error: {error}")
        
    # Validation errors
    elif any(keyword in error_str for keyword in ["validation", "invalid", "required", "missing"]):
        return ValidationError(f"Validation error: {error}")
        
    # Storage errors
    elif any(keyword in error_str for keyword in ["database", "vector", "storage", "persist"]):
        return StorageError(f"Storage error: {error}")
        
    # Rate limit errors
    elif any(keyword in error_str for keyword in ["rate limit", "too many requests", "429"]):
        return RateLimitError("Rate limit exceeded", retry_after=60)
        
    # Default to unknown
    else:
        return IngestionError(
            message=str(error),
            category=ErrorCategory.UNKNOWN,
            details={"original_error": type(error).__name__}
        )