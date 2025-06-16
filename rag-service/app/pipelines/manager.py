import logging
import asyncio
import uuid
from typing import Dict, Any, List, Optional, AsyncGenerator
from datetime import datetime

from haystack import Pipeline
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.document_stores.types import DuplicatePolicy
from haystack.utils import Secret
from haystack_integrations.document_stores.pgvector import PgvectorDocumentStore

from app.pipelines.provider import PipelineProvider
from app.services.document_store import DocumentStoreService
from app.services.conversation_store import ConversationStore
from app.services.store_factory import create_complete_stores
from app.models.documents import create_source_metadata
from app.models.query import create_query_context, QueryContext
from app.processing.query_classifier import create_query_classifier
from app.core.config import settings

logger = logging.getLogger(__name__)


class PipelineManager:
    """Manages Haystack pipelines and document store."""
    
    def __init__(self):
        self.document_store: Optional[InMemoryDocumentStore] = None
        self.document_store_service: Optional[DocumentStoreService] = None
        self.pipeline_provider: Optional[PipelineProvider] = None
        self._initialized = False
        self.conversation_store: Optional[ConversationStore] = None
        self.query_classifier = create_query_classifier()
    
    async def initialize(self):
        """Initialize pipelines and document store using factory pattern."""
        try:
            logger.info("Initializing pipeline manager...")
            
            # Create all stores using factory
            (
                self.document_store,
                self.document_store_service,
                self.conversation_store
            ) = await create_complete_stores()
            
            # Initialize pipeline provider
            self.pipeline_provider = PipelineProvider(self.document_store)
            
            self._initialized = True
            logger.info("Pipeline manager initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize pipeline manager: {e}", exc_info=True)
            raise
    
    async def cleanup(self):
        """Cleanup resources."""
        logger.info("Cleaning up pipeline manager...")
        if self.document_store_service:
            await self.document_store_service.cleanup()
        if self.conversation_store:
            await self.conversation_store.cleanup()
        self._initialized = False
    
    def is_initialized(self) -> bool:
        """Check if pipelines are initialized."""
        return self._initialized
    
    async def index_file(
        self,
        file_path: str,
        filename: str,
        content_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Index a file into the document store."""
        try:
            logger.info(f"Indexing file: {filename}")
            
            # Generate document ID
            doc_id = str(uuid.uuid4())
            
            # Create standardized metadata
            source_meta = create_source_metadata(
                source_id=doc_id,
                source=filename,
                content_type=content_type,
                title=filename,
                **(metadata or {})
            )
            doc_metadata = source_meta.dict(exclude_none=True)
            
            # Run indexing pipeline synchronously (Haystack 2.0 doesn't have async support yet)
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_indexing_pipeline,
                file_path,
                doc_metadata
            )
            
            # Store source metadata
            await self.document_store_service.store_source_metadata(
                source_id=doc_id,
                title=filename,
                source=filename,
                content_type=content_type,
                chunk_count=result["document_count"],
                metadata=metadata
            )
            
            return {
                "document_id": doc_id,
                "chunk_count": result["document_count"],
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Failed to index file: {e}", exc_info=True)
            raise
    
    async def index_url(
        self,
        url: str,
        metadata: Optional[Dict[str, Any]] = None,
        enable_crawling: bool = True,
        max_depth: Optional[int] = None,
        max_pages: Optional[int] = None,
        follow_external_links: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Index content from a URL."""
        try:
            logger.info(f"Indexing URL: {url}")
            
            # Generate document ID
            doc_id = str(uuid.uuid4())
            
            # Create standardized metadata
            source_meta = create_source_metadata(
                source_id=doc_id,
                source=url,
                content_type="text/html",
                title=url,
                url=url,  # Keep URL in legacy field for compatibility
                **(metadata or {})
            )
            doc_metadata = source_meta.dict(exclude_none=True)
            
            # Run indexing pipeline for URL
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_url_indexing_pipeline,
                url,
                doc_metadata,
                enable_crawling,
                max_depth,
                max_pages,
                follow_external_links
            )
            
            # Store source metadata
            await self.document_store_service.store_source_metadata(
                source_id=doc_id,
                title=url,
                source=url,
                content_type="text/html",
                chunk_count=result["document_count"],
                metadata=metadata
            )
            
            return {
                "document_id": doc_id,
                "chunk_count": result["document_count"],
                "status": "success"
            }
            
        except Exception as e:
            logger.error(f"Failed to index URL: {e}", exc_info=True)
            raise
    
    async def query(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None,
        query_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a query against the document store."""
        try:
            logger.info(f"Executing query: {query[:50]}... with model: {model}, provider: {provider}")
            
            # Generate conversation ID if not provided
            if not conversation_id:
                conversation_id = str(uuid.uuid4())
            
            # Get conversation history
            conversation_history = await self.conversation_store.get_conversation(conversation_id)
            
            # Create query context with classification
            context = create_query_context(
                query=query,
                model=model,
                retrieval_mode=retrieval_mode,
                conversation_id=conversation_id,
                conversation_history=conversation_history,
                filters=filters
            )
            
            # Apply query classification
            classification = self.query_classifier.classify(query)
            context.apply_classification(classification)
            
            # Override with any explicit configuration
            if query_config:
                for key, value in query_config.items():
                    if hasattr(context, key):
                        setattr(context, key, value)
            
            # Run query pipeline with context
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._run_query_pipeline_with_context,
                context
            )
            
            # Update conversation history
            await self.conversation_store.add_to_conversation(conversation_id, [
                {"role": "user", "content": query},
                {"role": "assistant", "content": result["answer"]}
            ])
            
            return {
                "answer": result["answer"],
                "sources": result.get("sources", []),
                "conversation_id": conversation_id,
                "metadata": {
                    "query_type": classification.query_type,
                    "confidence": classification.confidence,
                    "pipeline_config": context.get_pipeline_config()
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to execute query: {e}", exc_info=True)
            raise
    
    async def stream_query(
        self,
        query: str,
        conversation_id: Optional[str] = None,
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute a streaming query against the document store."""
        try:
            logger.info(f"Executing streaming query: {query[:50]}...")
            
            # Generate conversation ID if not provided
            if not conversation_id:
                conversation_id = str(uuid.uuid4())
            
            # Get conversation history
            conversation_history = await self.conversation_store.get_conversation(conversation_id)
            
            # Run streaming query pipeline
            full_response = ""
            async for chunk in self._stream_query_pipeline(query, conversation_history, model, retrieval_mode, filters):
                if chunk["type"] == "content":
                    full_response += chunk["content"]
                yield chunk
            
            # Update conversation history after streaming completes
            await self.conversation_store.add_to_conversation(conversation_id, [
                {"role": "user", "content": query},
                {"role": "assistant", "content": full_response}
            ])
            
        except Exception as e:
            logger.error(f"Failed to execute streaming query: {e}", exc_info=True)
            yield {"type": "error", "message": str(e)}
    
    async def list_sources(self, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """List all sources in the document store."""
        try:
            return await self.document_store_service.list_sources(limit=limit, offset=offset)
        except Exception as e:
            logger.error(f"Failed to list sources: {e}", exc_info=True)
            raise
    
    async def get_source(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific source."""
        try:
            return await self.document_store_service.get_source(source_id)
        except Exception as e:
            logger.error(f"Failed to get source: {e}", exc_info=True)
            raise
    
    async def delete_source(self, source_id: str) -> Dict[str, Any]:
        """Delete a source and all its documents using efficient metadata filtering."""
        try:
            logger.info(f"Deleting source: {source_id}")
            
            # Use metadata filtering for efficient deletion instead of O(n) scan
            # Try multiple filter combinations to handle legacy inconsistent metadata
            filter_combinations = [
                {"field": "meta.source_id", "operator": "==", "value": source_id},
                {"field": "meta.source", "operator": "==", "value": source_id},
                {"field": "meta.filename", "operator": "==", "value": source_id},
            ]
            
            # Handle special case for "unknown" sources
            if source_id == "unknown":
                filter_combinations.extend([
                    {"field": "meta.source", "operator": "==", "value": None},
                    {"field": "meta.url", "operator": "in", "value": ["haystack"]},
                ])
            
            total_deleted = 0
            
            # Try each filter combination
            for filters in filter_combinations:
                try:
                    # First count documents that match this filter
                    matching_docs = self.document_store.filter_documents(filters=filters)
                    doc_count = len(matching_docs)
                    
                    if doc_count > 0:
                        # Delete using the filter - much more efficient than ID-based deletion
                        self.document_store.delete_documents(filters=filters)
                        total_deleted += doc_count
                        logger.info(f"Deleted {doc_count} documents using filter: {filters}")
                        
                except Exception as e:
                    logger.warning(f"Filter {filters} failed: {e}")
                    continue
            
            # Delete source metadata
            await self.document_store_service.delete_source(source_id)
            
            logger.info(f"Successfully deleted source {source_id} with {total_deleted} documents")
            
            return {
                "success": True,
                "documents_deleted": total_deleted
            }
            
        except Exception as e:
            logger.error(f"Failed to delete source: {e}", exc_info=True)
            raise
    
    async def get_document_count(self) -> int:
        """Get total document count."""
        try:
            return self.document_store.count_documents()
        except Exception as e:
            logger.error(f"Failed to get document count: {e}", exc_info=True)
            return 0
    
    
    def _run_query_pipeline_with_context(self, context: QueryContext) -> Dict[str, Any]:
        """Run the query pipeline using QueryContext for configuration."""
        logger.info(f"Running pipeline for query type: {context.classification.query_type if context.classification else 'unknown'}")
        
        # Get the appropriate pipeline based on context
        pipeline = self.pipeline_provider.get_query_pipeline(
            model=context.model,
            provider=context.provider,
            retrieval_mode=context.retrieval_mode,
            filters=context.filters,
            query_config=context.get_pipeline_config()
        )
        
        # Build inputs from context
        inputs = context.get_pipeline_inputs()
        
        # Run the pipeline
        result = pipeline.run(inputs)
        
        # Extract the answer from the answer_builder output
        answer_builder_output = result.get("answer_builder", {})
        return {
            "answer": answer_builder_output.get("answer", ""),
            "sources": answer_builder_output.get("sources", []),
            "confidence_score": answer_builder_output.get("confidence_score", 0.0),
            "metadata": answer_builder_output.get("metadata", {})
        }
    
    def _run_indexing_pipeline(self, file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Run the indexing pipeline synchronously."""
        from pathlib import Path
        file_extension = Path(file_path).suffix.lower()
        
        pipeline = self.pipeline_provider.get_file_indexing_pipeline(file_extension)
        
        # Run the pipeline
        result = pipeline.run({
            "converter": {
                "sources": [file_path],
                "meta": metadata
            }
        })
        
        # Log the pipeline result for debugging
        logger.info(f"Pipeline result keys: {list(result.keys())}")
        
        # Get document count from writer output
        # In Haystack 2.0, DocumentWriter returns documents_written as an integer
        writer_result = result.get("writer", {})
        logger.info(f"Writer result: {writer_result}")
        
        # The DocumentWriter returns an integer count in documents_written
        doc_count = writer_result.get("documents_written", 0)
        
        logger.info(f"Document count after splitting: {doc_count}")
        
        return {
            "document_count": doc_count
        }
    
    def _run_url_indexing_pipeline(
        self, 
        url: str, 
        metadata: Dict[str, Any],
        enable_crawling: bool = True,
        max_depth: Optional[int] = None,
        max_pages: Optional[int] = None,
        follow_external_links: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Run the URL indexing pipeline synchronously with custom crawling settings."""
        
        logger.info(f"Running {'crawling' if enable_crawling else 'single-page'} pipeline for URL: {url}")
        logger.info(f"Crawling settings - depth: {max_depth}, pages: {max_pages}, external: {follow_external_links}")
        
        pipeline = self.pipeline_provider.get_url_indexing_pipeline(
            enable_crawling=enable_crawling,
            max_depth=max_depth,
            max_pages=max_pages,
            follow_external_links=follow_external_links
        )
        
        # Log the component type for debugging
        fetcher_component = pipeline.get_component("fetcher")
        logger.info(f"Pipeline fetcher component type: {type(fetcher_component).__name__}")
        
        # Run the URL indexing pipeline
        result = pipeline.run({
            "fetcher": {
                "urls": [url]
            }
        })
        
        # Log the pipeline result for debugging
        logger.info(f"URL pipeline result keys: {list(result.keys())}")
        
        # Get document count from writer output
        writer_result = result.get("writer", {})
        logger.info(f"Writer result: {writer_result}")
        
        # The DocumentWriter returns an integer count in documents_written
        doc_count = writer_result.get("documents_written", 0)
        
        logger.info(f"Document count after splitting: {doc_count}")
        
        # Update documents with metadata
        if doc_count > 0:
            # TODO: Update documents in the store with the provided metadata
            # For now, we'll just return the count
            pass
        
        return {
            "document_count": doc_count
        }
    
    def _run_query_pipeline(
        self,
        query: str,
        conversation_history: List[Dict],
        model: str,
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None,
        query_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run the query pipeline synchronously."""
        # Default provider to openai if not specified
        provider = "openai"  # Currently only OpenAI is supported by Haystack
        
        # Parse query configuration - use settings defaults if not specified
        config = query_config or {}
        use_enhanced = config.get("use_enhanced_pipeline", settings.USE_ENHANCED_PIPELINE)
        use_table_aware = config.get("use_table_aware_pipeline", self.query_classifier.is_table_query(query))
        enable_query_expansion = config.get("enable_query_expansion", settings.ENABLE_QUERY_EXPANSION)
        enable_source_filtering = config.get("enable_source_filtering", settings.ENABLE_SOURCE_FILTERING)
        enable_diversity_ranking = config.get("enable_diversity_ranking", settings.ENABLE_DIVERSITY_RANKING)
        source_filters = config.get("source_filters", None)
        preferred_sources = config.get("preferred_sources", None)
        
        # Use table-aware pipeline if detected or requested
        if use_table_aware:
            config["use_table_aware_pipeline"] = True
            pipeline = self.pipeline_provider.get_query_pipeline(model, provider, retrieval_mode, filters, config)
            inputs = {
                "query_expander": {"query": query},
                "prompt_builder": {
                    "conversation_history": conversation_history
                }
            }
            
            # Run the table-aware pipeline
            result = pipeline.run(inputs)
            
            # Extract table-aware results
            answer_builder_output = result.get("answer_builder", {})
            return {
                "answer": answer_builder_output.get("answer", ""),
                "sources": answer_builder_output.get("sources", [])
            }
        
        # Use enhanced pipeline if requested
        elif use_enhanced:
            config["use_enhanced_pipeline"] = True
            pipeline = self.pipeline_provider.get_query_pipeline(model, provider, retrieval_mode, filters, config)
            
            # Build inputs for enhanced pipeline
            inputs = {
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
            
            # Add query expansion inputs if enabled
            if enable_query_expansion:
                inputs["query_expander"] = {"query": query}
            else:
                # If no query expansion, connect embedder directly
                inputs["embedder"] = {"text": query}
            
            # Add source filtering inputs if enabled
            if enable_source_filtering and source_filters:
                inputs["source_filter"] = {
                    "source_filters": source_filters,
                    "preferred_sources": preferred_sources
                }
            
            # Add retriever-specific inputs
            if isinstance(self.document_store, InMemoryDocumentStore):
                inputs["bm25_retriever"] = {"query": query}
            else:
                # For hybrid retriever
                inputs["hybrid_retriever"] = {"query": query}
                if filters:
                    inputs["hybrid_retriever"]["filters"] = filters
            
            # Similarity ranker always needs query
            inputs["similarity_ranker"] = {"query": query}
            
            if filters and isinstance(self.document_store, InMemoryDocumentStore):
                inputs["embedding_retriever"] = {"filters": filters}
            
            # Run the enhanced pipeline
            result = pipeline.run(inputs)
            
            # Extract enhanced results
            answer_builder_output = result.get("answer_builder", {})
            return {
                "answer": answer_builder_output.get("answer", ""),
                "sources": answer_builder_output.get("sources", []),
                "confidence_score": float(answer_builder_output.get("confidence_score", 0.0)),
                "metadata": answer_builder_output.get("metadata", {})
            }
        
        # Select pipeline based on retrieval mode and filters
        if filters:
            pipeline = self.pipeline_provider.get_query_pipeline(model, provider, retrieval_mode, filters, config)
            inputs = {
                "embedder": {"text": query},
                "retriever": {"filters": filters},
                "similarity_ranker": {"query": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        elif retrieval_mode == "hybrid" and isinstance(self.document_store, InMemoryDocumentStore):
            pipeline = self.pipeline_provider.get_query_pipeline(model, provider, retrieval_mode, filters, config)
            inputs = {
                "embedder": {"text": query},
                "bm25_retriever": {"query": query},
                "ranker": {"query": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        else:
            # Default to standard embedding pipeline
            pipeline = self.pipeline_provider.get_query_pipeline(model, provider, retrieval_mode, filters, config)
            inputs = {
                "embedder": {"text": query},
                "prompt_builder": {
                    "question": query,
                    "conversation_history": conversation_history
                }
            }
        
        # Run the selected pipeline
        result = pipeline.run(inputs)
        
        # Extract the answer from the answer_builder output
        answer_builder_output = result.get("answer_builder", {})
        return {
            "answer": answer_builder_output.get("answer", ""),
            "sources": answer_builder_output.get("sources", [])
        }
    
    async def _stream_query_pipeline(
        self,
        query: str,
        conversation_history: List[Dict],
        model: str,
        retrieval_mode: str = settings.DEFAULT_RETRIEVAL_MODE,
        filters: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Run the query pipeline with streaming."""
        # TODO: Implement proper streaming with Haystack 2.0
        # For now, we'll simulate streaming by chunking the response
        result = await asyncio.get_event_loop().run_in_executor(
            None,
            self._run_query_pipeline,
            query,
            conversation_history,
            model,
            retrieval_mode,
            filters
        )
        
        # Simulate streaming by chunking the response
        answer = result["answer"]
        chunk_size = 50  # Characters per chunk
        
        for i in range(0, len(answer), chunk_size):
            chunk = answer[i:i+chunk_size]
            yield {"type": "content", "content": chunk}
            await asyncio.sleep(0.01)  # Small delay to simulate streaming