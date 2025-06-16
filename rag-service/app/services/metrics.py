import logging
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime
from collections import defaultdict, deque

logger = logging.getLogger(__name__)


@dataclass
class MetricEntry:
    """Individual metric entry."""
    timestamp: float
    value: float
    tags: Dict[str, str] = field(default_factory=dict)


@dataclass 
class ServiceMetrics:
    """Container for service metrics."""
    # Ingestion metrics
    ingestion_jobs_total: int = 0
    ingestion_jobs_success: int = 0
    ingestion_jobs_failed: int = 0
    ingestion_jobs_duplicate: int = 0
    
    # Query metrics
    queries_total: int = 0
    queries_success: int = 0
    queries_failed: int = 0
    
    # Performance metrics
    average_ingestion_time: float = 0.0
    average_query_time: float = 0.0
    
    # Error tracking
    errors_last_hour: int = 0
    
    # Resource metrics
    documents_total: int = 0
    sources_total: int = 0
    
    # Last updated
    last_updated: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class MetricsService:
    """Service for collecting and tracking application metrics."""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        
        # Counters
        self._counters: Dict[str, int] = defaultdict(int)
        
        # Time series data
        self._time_series: Dict[str, deque] = defaultdict(lambda: deque(maxlen=max_history))
        
        # Performance tracking
        self._timing_data: Dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
        
        # Error tracking
        self._errors: deque = deque(maxlen=100)
        
        # Start time
        self._start_time = time.time()
    
    def increment_counter(self, metric_name: str, value: int = 1, tags: Dict[str, str] = None):
        """Increment a counter metric."""
        self._counters[metric_name] += value
        
        # Also add to time series for tracking over time
        entry = MetricEntry(
            timestamp=time.time(),
            value=value,
            tags=tags or {}
        )
        self._time_series[metric_name].append(entry)
        
        logger.debug(f"Incremented {metric_name} by {value}")
    
    def record_timing(self, metric_name: str, duration: float, tags: Dict[str, str] = None):
        """Record timing/duration metrics."""
        entry = MetricEntry(
            timestamp=time.time(),
            value=duration,
            tags=tags or {}
        )
        self._timing_data[metric_name].append(entry)
        logger.debug(f"Recorded {metric_name}: {duration:.3f}s")
    
    def record_error(self, error_type: str, message: str, tags: Dict[str, str] = None):
        """Record error occurrence."""
        error_entry = {
            "timestamp": time.time(),
            "error_type": error_type,
            "message": message,
            "tags": tags or {}
        }
        self._errors.append(error_entry)
        self.increment_counter("errors_total", tags={"error_type": error_type})
        logger.debug(f"Recorded error: {error_type}")
    
    def get_average_timing(self, metric_name: str, window_seconds: int = 300) -> float:
        """Get average timing for a metric within a time window."""
        if metric_name not in self._timing_data:
            return 0.0
        
        cutoff_time = time.time() - window_seconds
        recent_timings = [
            entry.value for entry in self._timing_data[metric_name]
            if entry.timestamp >= cutoff_time
        ]
        
        if not recent_timings:
            return 0.0
        
        return sum(recent_timings) / len(recent_timings)
    
    def get_counter_value(self, metric_name: str) -> int:
        """Get current counter value."""
        return self._counters.get(metric_name, 0)
    
    def get_errors_in_timeframe(self, seconds: int = 3600) -> int:
        """Get number of errors in the last N seconds."""
        cutoff_time = time.time() - seconds
        return len([
            error for error in self._errors
            if error["timestamp"] >= cutoff_time
        ])
    
    def get_recent_errors(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent errors."""
        return list(self._errors)[-limit:]
    
    def get_service_metrics(self) -> ServiceMetrics:
        """Get comprehensive service metrics."""
        return ServiceMetrics(
            # Ingestion metrics
            ingestion_jobs_total=self.get_counter_value("ingestion_jobs_total"),
            ingestion_jobs_success=self.get_counter_value("ingestion_jobs_success"),
            ingestion_jobs_failed=self.get_counter_value("ingestion_jobs_failed"),
            ingestion_jobs_duplicate=self.get_counter_value("ingestion_jobs_duplicate"),
            
            # Query metrics
            queries_total=self.get_counter_value("queries_total"),
            queries_success=self.get_counter_value("queries_success"),
            queries_failed=self.get_counter_value("queries_failed"),
            
            # Performance metrics
            average_ingestion_time=self.get_average_timing("ingestion_duration"),
            average_query_time=self.get_average_timing("query_duration"),
            
            # Error tracking
            errors_last_hour=self.get_errors_in_timeframe(3600),
            
            # Resource metrics (these would be updated by external calls)
            documents_total=self.get_counter_value("documents_total"),
            sources_total=self.get_counter_value("sources_total"),
        )
    
    def export_metrics(self) -> Dict[str, Any]:
        """Export all metrics as dictionary."""
        return {
            "counters": dict(self._counters),
            "service_metrics": asdict(self.get_service_metrics()),
            "recent_errors": self.get_recent_errors(),
            "uptime_seconds": time.time() - self._start_time
        }
    
    def reset_metrics(self):
        """Reset all metrics (useful for testing)."""
        self._counters.clear()
        self._time_series.clear()
        self._timing_data.clear()
        self._errors.clear()
        logger.info("All metrics reset")


# Global metrics instance
metrics_service = MetricsService()


class MetricsContext:
    """Context manager for timing operations."""
    
    def __init__(self, metric_name: str, tags: Dict[str, str] = None):
        self.metric_name = metric_name
        self.tags = tags or {}
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.start_time:
            duration = time.time() - self.start_time
            metrics_service.record_timing(self.metric_name, duration, self.tags)
            
            # Also record if there was an error
            if exc_type:
                metrics_service.record_error(
                    error_type=exc_type.__name__,
                    message=str(exc_val),
                    tags=self.tags
                )


def timed(metric_name: str, tags: Dict[str, str] = None):
    """Decorator for timing function execution."""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            with MetricsContext(metric_name, tags):
                return await func(*args, **kwargs)
        
        def sync_wrapper(*args, **kwargs):
            with MetricsContext(metric_name, tags):
                return func(*args, **kwargs)
        
        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator