import logging
import json
import asyncio
from typing import Dict, Any, List, Optional, Protocol
from datetime import datetime
from dataclasses import dataclass, asdict
from abc import ABC, abstractmethod

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
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        data = asdict(self)
        data["created_at"] = self.created_at.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SourceMetadata":
        """Create from dictionary."""
        data = data.copy()
        if isinstance(data["created_at"], str):
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        return cls(**data)


class SourceMetadataStore(ABC):
    """Abstract interface for source metadata storage."""
    
    @abstractmethod
    async def store(self, source: SourceMetadata) -> None:
        """Store source metadata."""
        pass
    
    @abstractmethod
    async def get(self, source_id: str) -> Optional[SourceMetadata]:
        """Get source metadata by ID."""
        pass
    
    @abstractmethod
    async def list_all(self) -> List[SourceMetadata]:
        """List all source metadata."""
        pass
    
    @abstractmethod
    async def delete(self, source_id: str) -> bool:
        """Delete source metadata."""
        pass
    
    @abstractmethod
    async def cleanup(self) -> None:
        """Cleanup resources."""
        pass


class InMemorySourceMetadataStore(SourceMetadataStore):
    """In-memory implementation for development/testing."""
    
    def __init__(self):
        self._sources: Dict[str, SourceMetadata] = {}
    
    async def store(self, source: SourceMetadata) -> None:
        """Store source metadata."""
        self._sources[source.id] = source
        logger.debug(f"Stored source metadata for {source.id}")
    
    async def get(self, source_id: str) -> Optional[SourceMetadata]:
        """Get source metadata by ID."""
        return self._sources.get(source_id)
    
    async def list_all(self) -> List[SourceMetadata]:
        """List all source metadata."""
        return list(self._sources.values())
    
    async def delete(self, source_id: str) -> bool:
        """Delete source metadata."""
        if source_id in self._sources:
            del self._sources[source_id]
            logger.info(f"Deleted source {source_id}")
            return True
        return False
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        self._sources.clear()


class DatabaseSourceMetadataStore(SourceMetadataStore):
    """Database implementation for production (PostgreSQL)."""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self._pool = None
    
    async def _get_pool(self):
        """Get or create database connection pool."""
        if self._pool is None:
            try:
                import asyncpg
                self._pool = await asyncpg.create_pool(self.database_url)
                await self._create_table()
            except ImportError:
                logger.error("asyncpg not installed. Install with: pip install asyncpg")
                raise
            except Exception as e:
                logger.error(f"Failed to create database pool: {e}")
                raise
        return self._pool
    
    async def _create_table(self):
        """Create source metadata table if it doesn't exist."""
        async with self._pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS source_metadata (
                    id VARCHAR(255) PRIMARY KEY,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    content_type VARCHAR(100) NOT NULL,
                    chunk_count INTEGER NOT NULL,
                    created_at TIMESTAMP NOT NULL,
                    metadata JSONB
                )
            """)
            # Create index for faster queries
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_source_metadata_created_at 
                ON source_metadata(created_at DESC)
            """)
    
    async def store(self, source: SourceMetadata) -> None:
        """Store source metadata."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO source_metadata 
                (id, title, source, content_type, chunk_count, created_at, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    source = EXCLUDED.source,
                    content_type = EXCLUDED.content_type,
                    chunk_count = EXCLUDED.chunk_count,
                    created_at = EXCLUDED.created_at,
                    metadata = EXCLUDED.metadata
            """, source.id, source.title, source.source, source.content_type,
                source.chunk_count, source.created_at, 
                json.dumps(source.metadata) if source.metadata else None)
        logger.debug(f"Stored source metadata for {source.id}")
    
    async def get(self, source_id: str) -> Optional[SourceMetadata]:
        """Get source metadata by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM source_metadata WHERE id = $1", source_id
            )
            if row:
                metadata = json.loads(row['metadata']) if row['metadata'] else None
                return SourceMetadata(
                    id=row['id'],
                    title=row['title'],
                    source=row['source'],
                    content_type=row['content_type'],
                    chunk_count=row['chunk_count'],
                    created_at=row['created_at'],
                    metadata=metadata
                )
        return None
    
    async def list_all(self) -> List[SourceMetadata]:
        """List all source metadata."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM source_metadata ORDER BY created_at DESC"
            )
            result = []
            for row in rows:
                metadata = json.loads(row['metadata']) if row['metadata'] else None
                result.append(SourceMetadata(
                    id=row['id'],
                    title=row['title'],
                    source=row['source'],
                    content_type=row['content_type'],
                    chunk_count=row['chunk_count'],
                    created_at=row['created_at'],
                    metadata=metadata
                ))
            return result
    
    async def delete(self, source_id: str) -> bool:
        """Delete source metadata."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM source_metadata WHERE id = $1", source_id
            )
            deleted = result == "DELETE 1"
            if deleted:
                logger.info(f"Deleted source {source_id}")
            return deleted
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        if self._pool:
            await self._pool.close()
            self._pool = None


class DocumentStoreService:
    """Service for managing document store operations."""
    
    def __init__(self, document_store, metadata_store: SourceMetadataStore):
        self.document_store = document_store
        self.metadata_store = metadata_store
    
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
        source_metadata = SourceMetadata(
            id=source_id,
            title=title,
            source=source,
            content_type=content_type,
            chunk_count=chunk_count,
            created_at=datetime.utcnow(),
            metadata=metadata
        )
        await self.metadata_store.store(source_metadata)
        logger.info(f"Stored source metadata for {source_id}")
    
    async def list_sources(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """List all sources with pagination."""
        try:
            # Get sources from persistent store
            all_sources = await self.metadata_store.list_all()
            
            # Sort by creation date (newest first) - already handled in DB store
            total = len(all_sources)
            
            # Apply pagination
            paginated = all_sources[offset:offset + limit]
            
            return {
                "items": [src.to_dict() for src in paginated],
                "total": total
            }
            
        except Exception as e:
            logger.error(f"Failed to list sources from metadata store: {e}")
            
            # Fallback: try to reconstruct from documents in the store
            try:
                all_docs = self.document_store.filter_documents()
                
                # Group documents by source
                sources_by_id = {}
                for doc in all_docs:
                    source_id = doc.meta.get("source_id", doc.meta.get("source", "unknown"))
                    if source_id not in sources_by_id:
                        sources_by_id[source_id] = {
                            "id": source_id,
                            "title": doc.meta.get("filename", doc.meta.get("title", source_id)),
                            "source": doc.meta.get("source", source_id), 
                            "content_type": doc.meta.get("content_type", "text/plain"),
                            "chunk_count": 0,
                            "created_at": doc.meta.get("indexed_at", datetime.utcnow().isoformat()),
                            "metadata": doc.meta
                        }
                    sources_by_id[source_id]["chunk_count"] += 1
                
                # Convert to list and sort
                reconstructed_sources = list(sources_by_id.values())
                reconstructed_sources.sort(key=lambda x: x.get("created_at", ""), reverse=True)
                
                # Apply pagination
                paginated = reconstructed_sources[offset:offset + limit]
                
                return {
                    "items": paginated,
                    "total": len(reconstructed_sources)
                }
                
            except Exception as fallback_error:
                logger.error(f"Failed to reconstruct sources from documents: {fallback_error}")
                return {"items": [], "total": 0}
    
    async def get_source(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific source by ID."""
        try:
            source = await self.metadata_store.get(source_id)
            if source:
                return source.to_dict()
        except Exception as e:
            logger.error(f"Failed to get source {source_id} from metadata store: {e}")
        
        return None
    
    async def delete_source(self, source_id: str) -> bool:
        """Delete a source."""
        try:
            return await self.metadata_store.delete(source_id)
        except Exception as e:
            logger.error(f"Failed to delete source {source_id} from metadata store: {e}")
            return False
    
    async def check_duplicate_by_hash(self, content_hash: str) -> Optional[str]:
        """Check if a document with the same content hash already exists.
        
        Returns the source_id if a duplicate is found, None otherwise.
        """
        try:
            # Get all sources and check their content hashes
            all_sources = await self.metadata_store.list_all()
            for source in all_sources:
                if source.metadata and source.metadata.get("content_hash") == content_hash:
                    logger.info(f"Found duplicate document with hash {content_hash[:8]}... (source: {source.id})")
                    return source.id
        except Exception as e:
            logger.error(f"Error checking for duplicate content: {e}")
        
        return None
    
    async def cleanup(self):
        """Cleanup resources."""
        try:
            await self.metadata_store.cleanup()
        except Exception as e:
            logger.error(f"Error during metadata store cleanup: {e}")