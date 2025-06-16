import logging
import json
import asyncio
from typing import Dict, Any, List, Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class ConversationStore(ABC):
    """Abstract interface for conversation state storage."""
    
    @abstractmethod
    async def get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get conversation history by ID."""
        pass
    
    @abstractmethod
    async def add_to_conversation(
        self, 
        conversation_id: str, 
        messages: List[Dict[str, Any]]
    ) -> None:
        """Add messages to conversation history."""
        pass
    
    @abstractmethod
    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation history."""
        pass
    
    @abstractmethod
    async def cleanup(self) -> None:
        """Cleanup resources."""
        pass


class InMemoryConversationStore(ConversationStore):
    """In-memory implementation for development/testing."""
    
    def __init__(self):
        self._conversations: Dict[str, List[Dict[str, Any]]] = {}
    
    async def get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get conversation history by ID."""
        return self._conversations.get(conversation_id, [])
    
    async def add_to_conversation(
        self, 
        conversation_id: str, 
        messages: List[Dict[str, Any]]
    ) -> None:
        """Add messages to conversation history."""
        if conversation_id not in self._conversations:
            self._conversations[conversation_id] = []
        self._conversations[conversation_id].extend(messages)
        logger.debug(f"Added {len(messages)} messages to conversation {conversation_id}")
    
    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation history."""
        if conversation_id in self._conversations:
            del self._conversations[conversation_id]
            logger.info(f"Deleted conversation {conversation_id}")
            return True
        return False
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        self._conversations.clear()


class DatabaseConversationStore(ConversationStore):
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
        """Create conversation table if it doesn't exist."""
        async with self._pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    conversation_id VARCHAR(255) NOT NULL,
                    message_index INTEGER NOT NULL,
                    role VARCHAR(50) NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (conversation_id, message_index)
                )
            """)
            # Create index for faster queries
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_conversations_id_index 
                ON conversations(conversation_id, message_index)
            """)
    
    async def get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get conversation history by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT role, content FROM conversations 
                WHERE conversation_id = $1 
                ORDER BY message_index
            """, conversation_id)
            
            return [{"role": row["role"], "content": row["content"]} for row in rows]
    
    async def add_to_conversation(
        self, 
        conversation_id: str, 
        messages: List[Dict[str, Any]]
    ) -> None:
        """Add messages to conversation history."""
        if not messages:
            return
            
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Get current max index for this conversation
            max_index_row = await conn.fetchrow("""
                SELECT COALESCE(MAX(message_index), -1) as max_index 
                FROM conversations 
                WHERE conversation_id = $1
            """, conversation_id)
            
            current_index = max_index_row["max_index"] + 1
            
            # Insert new messages
            for message in messages:
                await conn.execute("""
                    INSERT INTO conversations 
                    (conversation_id, message_index, role, content)
                    VALUES ($1, $2, $3, $4)
                """, conversation_id, current_index, message["role"], message["content"])
                current_index += 1
        
        logger.debug(f"Added {len(messages)} messages to conversation {conversation_id}")
    
    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation history."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM conversations WHERE conversation_id = $1", conversation_id
            )
            # Check if any rows were deleted
            deleted = result.split()[-1] != "0"
            if deleted:
                logger.info(f"Deleted conversation {conversation_id}")
            return deleted
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        if self._pool:
            await self._pool.close()
            self._pool = None


class RedisConversationStore(ConversationStore):
    """Redis implementation for production (high-performance)."""
    
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._redis = None
    
    async def _get_redis(self):
        """Get or create Redis connection."""
        if self._redis is None:
            try:
                import redis.asyncio as redis
                self._redis = redis.from_url(self.redis_url)
                # Test connection
                await self._redis.ping()
            except ImportError:
                logger.error("redis not installed. Install with: pip install redis")
                raise
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                raise
        return self._redis
    
    async def get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get conversation history by ID."""
        redis = await self._get_redis()
        key = f"conversation:{conversation_id}"
        
        # Get conversation data from Redis list
        conversation_data = await redis.lrange(key, 0, -1)
        
        messages = []
        for data in conversation_data:
            try:
                message = json.loads(data)
                messages.append(message)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to decode message in conversation {conversation_id}: {e}")
        
        return messages
    
    async def add_to_conversation(
        self, 
        conversation_id: str, 
        messages: List[Dict[str, Any]]
    ) -> None:
        """Add messages to conversation history."""
        if not messages:
            return
            
        redis = await self._get_redis()
        key = f"conversation:{conversation_id}"
        
        # Add messages to Redis list
        serialized_messages = [json.dumps(msg) for msg in messages]
        await redis.rpush(key, *serialized_messages)
        
        # Set expiration (24 hours for conversation history)
        await redis.expire(key, 86400)
        
        logger.debug(f"Added {len(messages)} messages to conversation {conversation_id}")
    
    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation history."""
        redis = await self._get_redis()
        key = f"conversation:{conversation_id}"
        
        deleted = await redis.delete(key)
        if deleted:
            logger.info(f"Deleted conversation {conversation_id}")
        return bool(deleted)
    
    async def cleanup(self) -> None:
        """Cleanup resources."""
        if self._redis:
            await self._redis.close()
            self._redis = None