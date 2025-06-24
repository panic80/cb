"""Document ingestion pipeline."""

import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib
import asyncio
from pathlib import Path

from langchain_core.documents import Document as LangchainDocument

from app.core.config import settings
from app.core.logging import get_logger
from app.core.vectorstore import VectorStoreManager
from app.core.errors import (
    IngestionError, NetworkError, ParsingError, 
    ValidationError, StorageError, categorize_error
)
from app.models.documents import (
    Document, DocumentType, DocumentMetadata,
    DocumentIngestionRequest, DocumentIngestionResponse
)
from app.pipelines.loaders import LangChainDocumentLoader, CanadaCaScraper
from app.pipelines.splitters import LangChainTextSplitter
from app.pipelines.smart_splitters import SmartDocumentSplitter
from app.pipelines.parallel_ingestion import (
    ParallelEmbeddingGenerator, ParallelChunkProcessor, OptimizedVectorStoreWriter
)
from app.services.cache import CacheService
from app.services.progress_tracker import IngestionProgressTracker
from app.utils.retry import retry_async, RetryManager, AGGRESSIVE_RETRY_CONFIG
from app.utils.deduplication import DeduplicationService, ContentHasher
from app.components.bm25_retriever import TravelBM25Retriever
from app.components.table_multi_vector_retriever import TableMultiVectorRetriever
from app.components.cooccurrence_indexer import CooccurrenceIndexer

logger = get_logger(__name__)


class IngestionPipeline:
    """Document ingestion pipeline."""
    
    def __init__(
        self,
        vector_store_manager: VectorStoreManager,
        cache_service: Optional[CacheService] = None,
        deduplication_threshold: float = 0.85,
        use_smart_chunking: bool = True,
        use_hierarchical_chunking: bool = False,
        llm: Optional[Any] = None
    ):
        """Initialize ingestion pipeline."""
        self.vector_store_manager = vector_store_manager
        self.cache_service = cache_service
        self.retry_manager = RetryManager(AGGRESSIVE_RETRY_CONFIG)
        self.deduplication_service = DeduplicationService(deduplication_threshold)
        self.content_hasher = ContentHasher()
        self.use_smart_chunking = use_smart_chunking
        self.use_hierarchical_chunking = use_hierarchical_chunking
        self.chunk_processor = ParallelChunkProcessor(max_workers=settings.parallel_chunk_workers)
        self.optimized_writer = None  # Initialize when needed
        self.progress_trackers: Dict[str, IngestionProgressTracker] = {}
        
        # Initialize table multi-vector retriever for table storage
        self.table_retriever = TableMultiVectorRetriever(
            vectorstore=vector_store_manager.vector_store,
            llm=llm
        )
        
        # Initialize co-occurrence indexer
        self.cooccurrence_indexer = CooccurrenceIndexer(
            index_path=Path("cooccurrence_index")
        )
        # Try to load existing index
        self.cooccurrence_indexer.load_index()
        
    async def cleanup(self):
        """Cleanup resources."""
        try:
            if self.chunk_processor:
                self.chunk_processor.close()
            if self.optimized_writer:
                self.optimized_writer.close()
            logger.info("Ingestion pipeline resources cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        
    async def ingest_document(
        self,
        request: DocumentIngestionRequest,
        progress_callback: Optional[callable] = None
    ) -> DocumentIngestionResponse:
        """Ingest a document through the pipeline."""
        start_time = datetime.utcnow()
        
        # Create progress tracker
        operation_id = f"ingest_{int(start_time.timestamp())}"
        progress_tracker = IngestionProgressTracker(operation_id, request.url or "direct_input")
        if progress_callback:
            progress_tracker.add_callback(progress_callback)
        self.progress_trackers[operation_id] = progress_tracker
        
        try:
            # Validate request
            self._validate_request(request)
            
            # Check if document already exists (unless force refresh)
            if not request.force_refresh:
                existing = await self._check_existing_document(request)
                if existing:
                    return DocumentIngestionResponse(
                        document_id=existing["id"],
                        chunks_created=existing["chunks"],
                        status="exists",
                        message="Document already ingested",
                        processing_time=0
                    )
                    
            # Load document with retry
            logger.info(f"Loading document: {request.url or request.file_path}")
            await progress_tracker.start_step("loading")
            documents = await self._load_documents_with_retry(request)
            await progress_tracker.complete_step("loading", f"Loaded {len(documents)} document(s)")
            
            if not documents:
                raise ParsingError("No content extracted from document")
                
            # Split documents into chunks
            logger.info(f"Splitting {len(documents)} documents")
            await progress_tracker.start_step("splitting")
            split_start = datetime.utcnow()
            chunks = await self._split_documents_safely(documents, progress_tracker)
            split_time = (datetime.utcnow() - split_start).total_seconds()
            await progress_tracker.complete_step("splitting", f"Created {len(chunks)} chunks in {split_time:.2f}s")
            logger.info(f"Document splitting completed in {split_time:.2f} seconds")
            
            if not chunks:
                raise ParsingError("No chunks created from document")
            
            # Generate document ID
            doc_id = self._generate_document_id(request)
            
            # Convert to internal document format
            internal_docs = self._convert_to_internal_documents(
                chunks, doc_id, request
            )
            
            # Deduplicate chunks
            deduplicated_docs = await self._deduplicate_documents(
                internal_docs, request
            )
            
            if not deduplicated_docs:
                raise ParsingError("All chunks were duplicates")
            
            # Separate table documents from regular documents
            table_docs = []
            regular_docs = []
            
            for doc in deduplicated_docs:
                # Get metadata dict properly
                if hasattr(doc.metadata, 'model_dump'):
                    metadata_dict = doc.metadata.model_dump()
                elif isinstance(doc.metadata, dict):
                    metadata_dict = doc.metadata
                else:
                    metadata_dict = {}
                
                content_type = metadata_dict.get("content_type", "")
                if content_type in ["table_markdown", "table_key_value", "table_html", "table_json", "table_unstructured"]:
                    table_docs.append(doc)
                else:
                    regular_docs.append(doc)
            
            logger.info(f"Separated documents: {len(table_docs)} tables, {len(regular_docs)} regular documents")
            
            # Add tables using multi-vector approach if any
            if table_docs:
                logger.info("Adding table documents with multi-vector approach")
                # Convert internal documents to LangChain documents for table retriever
                langchain_table_docs = []
                for doc in table_docs:
                    langchain_doc = LangchainDocument(
                        page_content=doc.content,
                        metadata=doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                    )
                    langchain_table_docs.append(langchain_doc)
                
                # Add tables to multi-vector retriever
                self.table_retriever.add_tables(langchain_table_docs)
            
            # Add regular documents to vector store with parallel processing
            if regular_docs:
                logger.info(f"Adding {len(regular_docs)} regular chunks to vector store with parallel processing")
                await progress_tracker.start_step("embedding")
                await progress_tracker.start_step("storing")
                store_start = datetime.utcnow()
                await self._store_documents_parallel(regular_docs, progress_tracker)
                store_time = (datetime.utcnow() - store_start).total_seconds()
                await progress_tracker.complete_step("storing", f"Stored {len(regular_docs)} documents in {store_time:.2f}s")
                logger.info(f"Vector store addition completed in {store_time:.2f} seconds")
            
            # Update BM25 index with new documents
            await self._update_bm25_index(deduplicated_docs)
            
            # Update co-occurrence index with new documents
            await self._update_cooccurrence_index(deduplicated_docs)
            
            # Cache document info
            if self.cache_service:
                await self._cache_document_info(doc_id, deduplicated_docs, request)
                
            # Calculate processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Mark complete
            await progress_tracker.complete()
            
            logger.info(
                f"Successfully ingested document {doc_id} with {len(internal_docs)} chunks "
                f"in {processing_time:.2f} seconds"
            )
            
            return DocumentIngestionResponse(
                document_id=doc_id,
                chunks_created=len(deduplicated_docs),
                status="success",
                message=f"Successfully ingested document into {len(deduplicated_docs)} chunks",
                processing_time=processing_time,
                error_details={
                    "original_chunks": len(internal_docs),
                    "deduplicated_chunks": len(deduplicated_docs),
                    "duplicates_removed": len(internal_docs) - len(deduplicated_docs)
                } if len(internal_docs) != len(deduplicated_docs) else None
            )
            
        except IngestionError as e:
            # Already categorized error
            logger.error(f"Ingestion failed: {e.to_dict()}")
            if 'progress_tracker' in locals():
                await progress_tracker.error_step(
                    progress_tracker.current_step_id or "unknown",
                    str(e)
                )
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            return DocumentIngestionResponse(
                document_id="",
                chunks_created=0,
                status="error",
                message=e.message,
                processing_time=processing_time,
                error_details=e.to_dict()
            )
            
        except Exception as e:
            # Categorize unknown errors
            categorized_error = categorize_error(e)
            logger.error(f"Ingestion failed: {categorized_error.to_dict()}")
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            return DocumentIngestionResponse(
                document_id="",
                chunks_created=0,
                status="error",
                message=categorized_error.message,
                processing_time=processing_time,
                error_details=categorized_error.to_dict()
            )
            
    async def ingest_batch(
        self,
        requests: List[DocumentIngestionRequest],
        max_concurrent: int = 5,
        progress_callback: Optional[callable] = None
    ) -> List[DocumentIngestionResponse]:
        """Ingest multiple documents concurrently."""
        if not requests:
            return []
            
        # Validate all requests first
        for i, request in enumerate(requests):
            try:
                self._validate_request(request)
            except ValidationError as e:
                # Return early with validation errors
                return [
                    DocumentIngestionResponse(
                        document_id="",
                        chunks_created=0,
                        status="error",
                        message=f"Request {i}: {e.message}",
                        processing_time=0,
                        error_details=e.to_dict()
                    )
                    for _ in requests
                ]
                
        # Create semaphore to limit concurrent operations
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def ingest_with_semaphore(request: DocumentIngestionRequest, index: int):
            """Ingest document with concurrency control."""
            async with semaphore:
                try:
                    response = await self.ingest_document(request)
                    
                    # Call progress callback if provided
                    if progress_callback:
                        await progress_callback(index, len(requests), response)
                        
                    return response
                    
                except Exception as e:
                    logger.error(f"Batch ingestion failed for request {index}: {e}")
                    # Return error response
                    return DocumentIngestionResponse(
                        document_id="",
                        chunks_created=0,
                        status="error",
                        message=str(e),
                        processing_time=0
                    )
                    
        # Create tasks for all requests
        tasks = [
            ingest_with_semaphore(request, i) 
            for i, request in enumerate(requests)
        ]
        
        # Execute all tasks concurrently
        responses = await asyncio.gather(*tasks, return_exceptions=False)
        
        # Log batch statistics
        successful = sum(1 for r in responses if r.status == "success")
        failed = sum(1 for r in responses if r.status == "error")
        existing = sum(1 for r in responses if r.status == "exists")
        
        logger.info(
            f"Batch ingestion complete: {successful} successful, "
            f"{failed} failed, {existing} already existing out of {len(requests)} total"
        )
        
        return responses
        
    async def ingest_canada_ca(self) -> DocumentIngestionResponse:
        """Ingest all Canada.ca travel instructions."""
        start_time = datetime.utcnow()
        
        try:
            # Use specialized scraper
            scraper = CanadaCaScraper()
            documents = await scraper.scrape_travel_instructions()
            
            # Split all documents using LangChain splitter
            splitter = LangChainTextSplitter()
            all_chunks = splitter.split_documents(documents)
            
            # Generate parent document ID
            doc_id = f"canada_ca_travel_{datetime.utcnow().strftime('%Y%m%d')}"
            
            # Convert to internal format
            internal_docs = []
            for i, chunk in enumerate(all_chunks):
                metadata = DocumentMetadata(
                    source=chunk.metadata.get("source", ""),
                    title=chunk.metadata.get("title", "Canadian Forces Travel Instructions"),
                    type=DocumentType.WEB,
                    section=chunk.metadata.get("section"),
                    last_modified=chunk.metadata.get("last_modified"),
                    tags=["canada.ca", "travel", "policy", "official"]
                )
                
                internal_doc = Document(
                    id=f"{doc_id}_chunk_{i}",
                    content=chunk.page_content,
                    metadata=metadata,
                    chunk_index=i,
                    parent_id=doc_id,
                    created_at=datetime.utcnow()
                )
                internal_docs.append(internal_doc)
                
            # Add to vector store
            logger.info(f"Adding {len(internal_docs)} Canada.ca chunks to vector store")
            await self.vector_store_manager.add_documents(internal_docs)
            
            # Cache ingestion info
            if self.cache_service:
                await self.cache_service.set(
                    f"doc:{doc_id}",
                    {
                        "id": doc_id,
                        "chunks": len(internal_docs),
                        "source": "canada.ca",
                        "pages_scraped": len(documents),
                        "ingested_at": datetime.utcnow().isoformat()
                    },
                    ttl=86400
                )
                
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            return DocumentIngestionResponse(
                document_id=doc_id,
                chunks_created=len(internal_docs),
                status="success",
                message=f"Successfully ingested {len(documents)} Canada.ca pages into {len(internal_docs)} chunks",
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"Canada.ca ingestion failed: {e}")
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            return DocumentIngestionResponse(
                document_id="",
                chunks_created=0,
                status="error",
                message=str(e),
                processing_time=processing_time
            )
            
    def _generate_document_id(self, request: DocumentIngestionRequest) -> str:
        """Generate unique document ID using content-based hashing."""
        # For content-based ID, use the content itself
        if request.content:
            # Use content hash for direct input
            content_hash = self.content_hasher.generate_content_hash(request.content)
            return f"doc_{content_hash[:12]}"
            
        # For URL/file, combine source and metadata
        if request.url:
            source = request.url
        elif request.file_path:
            source = request.file_path
        else:
            source = str(uuid.uuid4())
            
        # Include metadata in hash for better uniqueness
        hash_input = f"{source}:{request.type}:{str(request.metadata)}"
        hash_obj = hashlib.sha256(hash_input.encode())
        return f"doc_{hash_obj.hexdigest()[:12]}"
        
    async def _check_existing_document(
        self,
        request: DocumentIngestionRequest
    ) -> Optional[Dict[str, Any]]:
        """Check if document already exists."""
        if not self.cache_service:
            return None
            
        doc_id = self._generate_document_id(request)
        cached = await self.cache_service.get(f"doc:{doc_id}")
        
        return cached
        
    def _validate_request(self, request: DocumentIngestionRequest) -> None:
        """Validate ingestion request."""
        # Must have either URL, file path, or content
        if not request.url and not request.file_path and not request.content:
            raise ValidationError(
                "Must provide either URL, file path, or content",
                field="source"
            )
            
        # Validate URL format if provided
        if request.url:
            import re
            url_pattern = re.compile(
                r'^https?://'  # http:// or https://
                r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
                r'localhost|'  # localhost...
                r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
                r'(?::\d+)?'  # optional port
                r'(?:/?|[/?]\S+)$', re.IGNORECASE
            )
            if not url_pattern.match(request.url):
                raise ValidationError(
                    f"Invalid URL format: {request.url}",
                    field="url",
                    value=request.url
                )
                
        # Validate file path if provided
        if request.file_path:
            import os
            if not os.path.exists(request.file_path):
                raise ValidationError(
                    f"File not found: {request.file_path}",
                    field="file_path",
                    value=request.file_path
                )
                
        # Validate document type
        if request.type not in DocumentType:
            raise ValidationError(
                f"Invalid document type: {request.type}",
                field="type",
                value=request.type
            )
            
    async def _load_documents_with_retry(
        self, 
        request: DocumentIngestionRequest
    ) -> List[LangchainDocument]:
        """Load documents with retry logic."""
        async def load_documents():
            if request.content:
                # Direct content input
                return [LangchainDocument(
                    page_content=request.content,
                    metadata={
                        "source": "direct_input",
                        "type": request.type,
                        **request.metadata
                    }
                )]
            else:
                # Load from URL or file
                loader = LangChainDocumentLoader()
                if request.url:
                    return await loader.load_from_url(request.url)
                else:
                    return await loader.load_from_file(request.file_path)
                
        # Use retry manager for network operations
        return await self.retry_manager.execute_with_retry(
            load_documents,
            on_retry=lambda e, attempt: logger.warning(
                f"Document loading retry {attempt}: {e}"
            )
        )
        
    async def _split_documents_safely(
        self,
        documents: List[LangchainDocument],
        progress_tracker: Optional[IngestionProgressTracker] = None
    ) -> List[LangchainDocument]:
        """Split documents with error handling, smart chunking, and parallel processing."""
        try:
            # Initialize the appropriate splitter
            if self.use_smart_chunking:
                # Use smart document splitter for structured documents
                splitter = SmartDocumentSplitter()
            else:
                # Use standard LangChain splitter
                splitter = LangChainTextSplitter()
            
            # For large documents, split in parallel
            if len(documents) > 5 or sum(len(doc.page_content) for doc in documents) > 50000:
                logger.info(f"Using parallel processing to split {len(documents)} documents")
                
                # Define splitting function
                def split_single_doc(doc: LangchainDocument) -> List[LangchainDocument]:
                    # Check if document type supports type-aware splitting
                    doc_type = doc.metadata.get("type", DocumentType.TEXT)
                    
                    # Use the appropriate splitting method
                    if isinstance(splitter, SmartDocumentSplitter):
                        return splitter.split_by_type([doc], doc_type)
                    else:
                        # LangChainTextSplitter has split_documents method
                        return splitter.split_documents([doc])
                
                # Process documents in parallel using executor
                loop = asyncio.get_event_loop()
                tasks = []
                for doc in documents:
                    task = loop.run_in_executor(
                        self.chunk_processor.executor,
                        split_single_doc,
                        doc
                    )
                    tasks.append(task)
                
                # Wait for all documents to be split with progress updates
                completed = 0
                chunks = []
                for future in asyncio.as_completed(tasks):
                    doc_chunks = await future
                    chunks.extend(doc_chunks)
                    completed += 1
                    
                    # Update progress
                    if progress_tracker:
                        await progress_tracker.update_splitting_progress(
                            completed,
                            len(documents)
                        )
                
                logger.info(f"Parallel splitting produced {len(chunks)} chunks")
                return chunks
            
            # For smaller documents, use standard processing
            else:
                # Check document type
                if documents:
                    doc_type = documents[0].metadata.get("type", DocumentType.TEXT)
                    
                    # Use the appropriate splitting method
                    if isinstance(splitter, SmartDocumentSplitter):
                        return splitter.split_by_type(documents, doc_type)
                    else:
                        # LangChainTextSplitter has split_documents method
                        return splitter.split_documents(documents)
                else:
                    return []
            
        except Exception as e:
            raise ParsingError(
                f"Failed to split documents: {e}",
                document_type="multiple"
            )
            
    def _convert_to_internal_documents(
        self,
        chunks: List[LangchainDocument],
        doc_id: str,
        request: DocumentIngestionRequest
    ) -> List[Document]:
        """Convert LangChain documents to internal format."""
        internal_docs = []
        
        for i, chunk in enumerate(chunks):
            try:
                # Enhance metadata
                metadata = DocumentMetadata(
                    source=chunk.metadata.get("source", ""),
                    title=chunk.metadata.get("title"),
                    type=DocumentType(chunk.metadata.get("type", request.type)),
                    section=chunk.metadata.get("section"),
                    page_number=chunk.metadata.get("page"),
                    last_modified=chunk.metadata.get("last_modified"),
                    policy_reference=chunk.metadata.get("policy_reference"),
                    tags=chunk.metadata.get("tags", [])
                )
                
                # Create internal document
                internal_doc = Document(
                    id=f"{doc_id}_chunk_{i}",
                    content=chunk.page_content,
                    metadata=metadata,
                    chunk_index=i,
                    parent_id=doc_id,
                    created_at=datetime.utcnow()
                )
                internal_docs.append(internal_doc)
                
            except Exception as e:
                logger.warning(f"Failed to convert chunk {i}: {e}")
                # Continue with other chunks
                
        if not internal_docs:
            raise ParsingError("Failed to convert any chunks to internal format")
            
        return internal_docs
        
    async def _store_documents_with_retry(
        self, 
        documents: List[Document]
    ) -> None:
        """Store documents in vector store with retry."""
        async def store_documents():
            try:
                await self.vector_store_manager.add_documents(documents)
            except Exception as e:
                # Convert to storage error for proper categorization
                raise StorageError(
                    f"Failed to store documents: {e}",
                    operation="add_documents"
                )
                
        await self.retry_manager.execute_with_retry(
            store_documents,
            on_retry=lambda e, attempt: logger.warning(
                f"Document storage retry {attempt}: {e}"
            )
        )
        
    async def _store_documents_parallel(
        self, 
        documents: List[Document],
        progress_tracker: Optional[IngestionProgressTracker] = None
    ) -> None:
        """Store documents with parallel embedding generation."""
        try:
            # Initialize optimized writer if not already done
            if not self.optimized_writer:
                self.optimized_writer = OptimizedVectorStoreWriter(
                    self.vector_store_manager.vector_store,
                    self.vector_store_manager.embeddings,
                    progress_tracker=progress_tracker
                )
            
            # Use optimized parallel processing with configuration values
            await self.optimized_writer.add_documents_optimized(
                documents,
                batch_size=settings.vector_store_batch_size,
                embedding_batch_size=settings.embedding_batch_size,
                max_concurrent_embeddings=settings.max_concurrent_embeddings
            )
            
        except Exception as e:
            logger.warning(f"Parallel storage failed, falling back to standard storage: {e}")
            # Fall back to standard storage with retry
            await self._store_documents_with_retry(documents)
        
    async def _cache_document_info(
        self,
        doc_id: str,
        internal_docs: List[Document],
        request: DocumentIngestionRequest
    ) -> None:
        """Cache document information."""
        try:
            await self.cache_service.set(
                f"doc:{doc_id}",
                {
                    "id": doc_id,
                    "chunks": len(internal_docs),
                    "source": request.url or request.file_path or "direct",
                    "type": request.type,
                    "ingested_at": datetime.utcnow().isoformat(),
                    "metadata": request.metadata
                },
                ttl=86400  # 24 hours
            )
        except Exception as e:
            # Log but don't fail ingestion for cache errors
            logger.warning(f"Failed to cache document info: {e}")
            
    async def _deduplicate_documents(
        self,
        documents: List[Document],
        request: DocumentIngestionRequest
    ) -> List[Document]:
        """Deduplicate documents against existing content."""
        if not documents:
            return documents
            
        # Check if we should skip deduplication
        if request.force_refresh:
            logger.info("Skipping deduplication due to force_refresh=True")
            return documents
            
        try:
            # Convert documents to format expected by deduplication service
            docs_for_dedup = []
            for doc in documents:
                docs_for_dedup.append({
                    "id": doc.id,
                    "content": doc.content,
                    "metadata": doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                })
                
            # Check against existing documents in vector store
            existing_docs = await self._get_existing_documents_for_dedup(
                request, limit=100
            )
            
            if existing_docs:
                # Check each new document against existing ones
                duplicates_to_remove = set()
                
                for new_doc in docs_for_dedup:
                    for existing_doc in existing_docs:
                        is_dup, score, reason = self.deduplication_service.is_duplicate(
                            new_doc["content"],
                            existing_doc.get("content", ""),
                            new_doc.get("metadata"),
                            existing_doc.get("metadata")
                        )
                        
                        if is_dup and reason != "updated_version":
                            logger.info(
                                f"Found duplicate chunk {new_doc['id']}: "
                                f"score={score:.2f}, reason={reason}"
                            )
                            duplicates_to_remove.add(new_doc["id"])
                            break
                            
                # Remove duplicates
                if duplicates_to_remove:
                    documents = [
                        doc for doc in documents 
                        if doc.id not in duplicates_to_remove
                    ]
                    logger.info(
                        f"Removed {len(duplicates_to_remove)} duplicate chunks"
                    )
                    
            # Also deduplicate within the batch itself
            deduplicated = self.deduplication_service.deduplicate_chunks(
                docs_for_dedup, strategy="merge"
            )
            
            # Convert back to Document objects
            final_docs = []
            for dedup_doc in deduplicated:
                # Find original document
                original = next(
                    (doc for doc in documents if doc.id == dedup_doc["id"]),
                    None
                )
                if original:
                    # Update metadata if it was merged
                    if "metadata" in dedup_doc:
                        # Update the original document's metadata
                        for key, value in dedup_doc["metadata"].items():
                            if hasattr(original.metadata, key):
                                setattr(original.metadata, key, value)
                    final_docs.append(original)
                    
            return final_docs
            
        except Exception as e:
            logger.warning(f"Deduplication failed: {e}. Proceeding without deduplication.")
            return documents
            
    async def _get_existing_documents_for_dedup(
        self,
        request: DocumentIngestionRequest,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get existing documents for deduplication check."""
        try:
            # Query vector store for similar documents
            # This is a simplified version - in production you'd want to
            # query based on source, type, and metadata
            filters = {}
            
            if request.url:
                filters["source"] = request.url
            elif request.file_path:
                filters["source"] = request.file_path
                
            # This would need to be implemented in your vector store
            # For now, return empty list
            return []
            
        except Exception as e:
            logger.warning(f"Failed to get existing documents: {e}")
            return []
            
    async def _update_bm25_index(self, documents: List[Document]) -> None:
        """Update BM25 index with new documents."""
        try:
            # Initialize BM25 retriever
            bm25_retriever = TravelBM25Retriever(documents=[])
            
            # Load existing index
            if bm25_retriever.load_index():
                logger.info("Loaded existing BM25 index for update")
                
                # Get all existing documents
                all_docs = list(bm25_retriever.documents)
                
                # Convert Document objects to LangchainDocument format
                new_langchain_docs = []
                for doc in documents:
                    langchain_doc = LangchainDocument(
                        page_content=doc.content,
                        metadata=doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                    )
                    new_langchain_docs.append(langchain_doc)
                
                # Add new documents
                all_docs.extend(new_langchain_docs)
                
                # Rebuild index with all documents
                bm25_retriever.build_index(all_docs)
                logger.info(f"Updated BM25 index with {len(documents)} new documents. Total documents: {len(all_docs)}")
            else:
                # No existing index, build new one with just these documents
                langchain_docs = []
                for doc in documents:
                    langchain_doc = LangchainDocument(
                        page_content=doc.content,
                        metadata=doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                    )
                    langchain_docs.append(langchain_doc)
                    
                bm25_retriever.build_index(langchain_docs)
                logger.info(f"Created new BM25 index with {len(documents)} documents")
                
        except Exception as e:
            logger.error(f"Failed to update BM25 index: {e}")
            # Don't fail the ingestion if BM25 update fails
            pass
            
    async def _update_cooccurrence_index(self, documents: List[Document]) -> None:
        """Update co-occurrence index with new documents."""
        try:
            # Convert Document objects to LangchainDocument format
            langchain_docs = []
            for doc in documents:
                # Prepare metadata
                if hasattr(doc.metadata, 'model_dump'):
                    metadata = doc.metadata.model_dump()
                elif isinstance(doc.metadata, dict):
                    metadata = doc.metadata
                else:
                    metadata = {}
                
                # Include document ID in metadata
                metadata['id'] = doc.id
                
                langchain_doc = LangchainDocument(
                    page_content=doc.content,
                    metadata=metadata
                )
                langchain_docs.append(langchain_doc)
            
            # Add documents to co-occurrence index
            for doc in langchain_docs:
                self.cooccurrence_indexer.add_document(doc)
            
            # Save the index
            self.cooccurrence_indexer.save_index()
            logger.info(f"Updated co-occurrence index with {len(documents)} documents")
            
        except Exception as e:
            logger.error(f"Failed to update co-occurrence index: {e}")
            # Don't fail the ingestion if co-occurrence update fails
            pass