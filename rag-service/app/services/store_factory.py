"""Factory for creating document stores, metadata stores, and conversation stores."""

import asyncio
import logging
from typing import Union
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.utils import Secret
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore

from app.services.document_store import DocumentStoreService, InMemorySourceMetadataStore, DatabaseSourceMetadataStore
from app.services.conversation_store import ConversationStore, InMemoryConversationStore, DatabaseConversationStore
from app.core.config import settings

logger = logging.getLogger(__name__)


class StoreFactory:
    """Factory for creating various store implementations based on configuration."""
    
    @staticmethod
    async def create_document_store() -> Union[InMemoryDocumentStore, PgvectorDocumentStore]:
        """
        Create document store based on configuration.
        
        Returns:
            Configured document store instance
        """
        if settings.VECTOR_STORE_TYPE == "memory":
            logger.info("Creating InMemoryDocumentStore")
            return InMemoryDocumentStore(
                embedding_similarity_function="cosine"
            )
        elif settings.VECTOR_STORE_TYPE == "pgvector":
            if not settings.DATABASE_URL:
                raise ValueError("DATABASE_URL is required for pgvector document store")
            
            logger.info("Creating PgvectorDocumentStore")
            
            def _init_pg_store():
                """Synchronous function to initialize the document store."""
                logger.info("Initializing PgvectorDocumentStore...")
                store = PgvectorDocumentStore(
                    connection_string=Secret.from_token(settings.DATABASE_URL),
                    table_name="documents",
                    embedding_dimension=3072,  # OpenAI text-embedding-3-large dimension
                    vector_function="cosine_similarity",
                    recreate_table=False,  # Preserve data across restarts
                    search_strategy="exact_search"
                )
                logger.info("PgvectorDocumentStore initialized successfully")
                return store
            
            # Run the blocking initialization in a separate thread
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, _init_pg_store)
        else:
            raise NotImplementedError(
                f"Vector store type '{settings.VECTOR_STORE_TYPE}' not implemented. "
                f"Supported types: 'memory', 'pgvector'"
            )
    
    @staticmethod
    def create_metadata_store() -> Union[InMemorySourceMetadataStore, DatabaseSourceMetadataStore]:
        """
        Create metadata store based on configuration.
        
        Returns:
            Configured metadata store instance
        """
        if settings.DATABASE_URL and settings.VECTOR_STORE_TYPE == "pgvector":
            logger.info("Creating DatabaseSourceMetadataStore")
            return DatabaseSourceMetadataStore(settings.DATABASE_URL)
        else:
            logger.info("Creating InMemorySourceMetadataStore")
            return InMemorySourceMetadataStore()
    
    @staticmethod
    def create_conversation_store() -> Union[InMemoryConversationStore, DatabaseConversationStore]:
        """
        Create conversation store based on configuration.
        
        Returns:
            Configured conversation store instance
        """
        if settings.DATABASE_URL and settings.VECTOR_STORE_TYPE == "pgvector":
            logger.info("Creating DatabaseConversationStore")
            return DatabaseConversationStore(settings.DATABASE_URL)
        else:
            logger.info("Creating InMemoryConversationStore")
            return InMemoryConversationStore()
    
    @staticmethod
    async def create_document_store_service() -> DocumentStoreService:
        """
        Create complete document store service with appropriate stores.
        
        Returns:
            Configured DocumentStoreService instance
        """
        # Create document store and metadata store
        document_store = await StoreFactory.create_document_store()
        metadata_store = StoreFactory.create_metadata_store()
        
        # Create service
        service = DocumentStoreService(document_store, metadata_store)
        
        logger.info("DocumentStoreService created successfully")
        return service
    
    @staticmethod
    def get_store_configuration() -> dict:
        """
        Get current store configuration for debugging/logging.
        
        Returns:
            Dictionary with current store configuration
        """
        return {
            "vector_store_type": settings.VECTOR_STORE_TYPE,
            "has_database_url": bool(settings.DATABASE_URL),
            "using_database_stores": settings.DATABASE_URL and settings.VECTOR_STORE_TYPE == "pgvector",
            "embedding_model": settings.EMBEDDING_MODEL,
        }


# Convenience functions for backward compatibility
async def create_document_store():
    """Convenience function to create document store."""
    return await StoreFactory.create_document_store()


def create_metadata_store():
    """Convenience function to create metadata store."""
    return StoreFactory.create_metadata_store()


def create_conversation_store():
    """Convenience function to create conversation store."""
    return StoreFactory.create_conversation_store()


async def create_complete_stores():
    """
    Create all required stores for the pipeline manager.
    
    Returns:
        Tuple of (document_store, document_store_service, conversation_store)
    """
    # Create all stores
    document_store = await StoreFactory.create_document_store()
    metadata_store = StoreFactory.create_metadata_store()
    conversation_store = StoreFactory.create_conversation_store()
    
    # Create document store service
    document_store_service = DocumentStoreService(document_store, metadata_store)
    
    logger.info("All stores created successfully")
    logger.info(f"Store configuration: {StoreFactory.get_store_configuration()}")
    
    return document_store, document_store_service, conversation_store