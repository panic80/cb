import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SourceMetadata:
    """Source metadata model."""
    id: str
    title: str
    source: str
    content_type: str
    chunk_count: int
    created_at: datetime
    metadata: Optional[Dict[str, Any]] = None


class DocumentStoreService:
    """Service for managing document store operations."""
    
    def __init__(self, document_store):
        self.document_store = document_store
        self._sources: Dict[str, SourceMetadata] = {}
    
    async def store_source_metadata(
        self,
        source_id: str,
        title: str,
        source: str,
        content_type: str,
        chunk_count: int,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Store metadata about an ingested source."""
        self._sources[source_id] = SourceMetadata(
            id=source_id,
            title=title,
            source=source,
            content_type=content_type,
            chunk_count=chunk_count,
            created_at=datetime.utcnow(),
            metadata=metadata
        )
        logger.info(f"Stored source metadata for {source_id}")
    
    async def list_sources(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """List all sources with pagination."""
        # First check in-memory sources
        in_memory_sources = list(self._sources.values())
        
        # If no in-memory sources, try to reconstruct from documents in the store
        if not in_memory_sources:
            try:
                # Get all documents from the document store
                all_docs = self.document_store.filter_documents()
                
                # Group documents by source
                sources_by_id = {}
                for doc in all_docs:
                    source_id = doc.meta.get("source", "unknown")
                    if source_id not in sources_by_id:
                        sources_by_id[source_id] = {
                            "id": source_id,
                            "title": doc.meta.get("title", source_id),
                            "source": doc.meta.get("source", source_id), 
                            "content_type": doc.meta.get("content_type", "text/plain"),
                            "chunk_count": 0,
                            "created_at": doc.meta.get("indexed_at", datetime.utcnow().isoformat()),
                            "metadata": doc.meta
                        }
                    sources_by_id[source_id]["chunk_count"] += 1
                
                # Convert to list and sort
                reconstructed_sources = list(sources_by_id.values())
                
                # Sort by creation date (newest first)
                reconstructed_sources.sort(key=lambda x: x.get("created_at", ""), reverse=True)
                
                # Apply pagination
                paginated = reconstructed_sources[offset:offset + limit]
                
                return {
                    "items": paginated,
                    "total": len(reconstructed_sources)
                }
                
            except Exception as e:
                logger.error(f"Failed to reconstruct sources from documents: {e}")
                # Fall back to empty list
                pass
        
        # Use in-memory sources if available
        total = len(in_memory_sources)
        
        # Sort by creation date (newest first)
        in_memory_sources.sort(key=lambda x: x.created_at, reverse=True)
        
        # Apply pagination
        paginated = in_memory_sources[offset:offset + limit]
        
        return {
            "items": [
                {
                    "id": src.id,
                    "title": src.title,
                    "source": src.source,
                    "content_type": src.content_type,
                    "chunk_count": src.chunk_count,
                    "created_at": src.created_at.isoformat(),
                    "metadata": src.metadata
                }
                for src in paginated
            ],
            "total": total
        }
    
    async def get_source(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific source by ID."""
        source = self._sources.get(source_id)
        if not source:
            return None
        
        return {
            "id": source.id,
            "title": source.title,
            "source": source.source,
            "content_type": source.content_type,
            "chunk_count": source.chunk_count,
            "created_at": source.created_at.isoformat(),
            "metadata": source.metadata
        }
    
    async def delete_source(self, source_id: str) -> bool:
        """Delete a source."""
        if source_id in self._sources:
            del self._sources[source_id]
            logger.info(f"Deleted source {source_id}")
            return True
        return False