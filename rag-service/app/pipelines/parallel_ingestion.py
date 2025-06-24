"""Parallel document ingestion optimizations."""

import asyncio
from typing import List, Tuple, Optional, Any, Dict
from concurrent.futures import ThreadPoolExecutor
import numpy as np

from langchain_core.documents import Document as LangchainDocument
from langchain_core.embeddings import Embeddings

from app.core.logging import get_logger
from app.models.documents import Document
from app.services.progress_tracker import IngestionProgressTracker

logger = get_logger(__name__)


class ParallelEmbeddingGenerator:
    """Generate embeddings in parallel for faster processing."""
    
    def __init__(self, embeddings: Embeddings, max_workers: int = 8):
        """Initialize parallel embedding generator."""
        self.embeddings = embeddings
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
    async def generate_embeddings_batch(
        self,
        texts: List[str],
        batch_size: int = 10,
        progress_callback: Optional[callable] = None
    ) -> List[List[float]]:
        """Generate embeddings in parallel batches."""
        try:
            # Split texts into batches
            batches = [texts[i:i + batch_size] for i in range(0, len(texts), batch_size)]
            
            # Process batches in parallel
            loop = asyncio.get_event_loop()
            tasks = []
            
            for batch in batches:
                task = loop.run_in_executor(
                    self.executor,
                    self.embeddings.embed_documents,
                    batch
                )
                tasks.append(task)
            
            # Wait for all batches to complete
            batch_results = await asyncio.gather(*tasks)
            
            # Flatten results
            embeddings = []
            processed = 0
            for batch_result in batch_results:
                embeddings.extend(batch_result)
                processed += len(batch_result)
                if progress_callback:
                    await progress_callback(processed, len(texts))
                
            logger.info(f"Generated {len(embeddings)} embeddings in {len(batches)} parallel batches")
            return embeddings
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings in parallel: {e}")
            raise
            
    async def generate_embeddings_concurrent(
        self,
        texts: List[str],
        max_concurrent: int = 20,
        progress_callback: Optional[callable] = None
    ) -> List[List[float]]:
        """Generate embeddings with controlled concurrency."""
        try:
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def embed_with_semaphore(text: str, index: int) -> Tuple[int, List[float]]:
                async with semaphore:
                    loop = asyncio.get_event_loop()
                    embedding = await loop.run_in_executor(
                        self.executor,
                        lambda: self.embeddings.embed_documents([text])[0]
                    )
                    return index, embedding
            
            # Create tasks for all texts
            tasks = [
                embed_with_semaphore(text, i) 
                for i, text in enumerate(texts)
            ]
            
            # Execute all tasks concurrently with progress tracking
            completed = 0
            embeddings_dict = {}
            
            for future in asyncio.as_completed(tasks):
                index, embedding = await future
                embeddings_dict[index] = embedding
                completed += 1
                
                if progress_callback:
                    await progress_callback(completed, len(texts))
            
            # Sort by index to maintain order
            embeddings = [embeddings_dict[i] for i in range(len(texts))]
            
            logger.info(f"Generated {len(embeddings)} embeddings with max concurrency {max_concurrent}")
            return embeddings
            
        except Exception as e:
            logger.error(f"Failed to generate concurrent embeddings: {e}")
            raise
            
    def close(self):
        """Shutdown the executor."""
        self.executor.shutdown(wait=True)


class ParallelChunkProcessor:
    """Process document chunks in parallel."""
    
    def __init__(self, max_workers: int = 4):
        """Initialize parallel chunk processor."""
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
    async def process_chunks_parallel(
        self,
        chunks: List[LangchainDocument],
        process_func: callable,
        batch_size: int = 50
    ) -> List[Any]:
        """Process chunks in parallel batches."""
        try:
            # Split chunks into batches
            batches = [chunks[i:i + batch_size] for i in range(0, len(chunks), batch_size)]
            
            # Process batches in parallel
            loop = asyncio.get_event_loop()
            tasks = []
            
            for batch in batches:
                task = loop.run_in_executor(
                    self.executor,
                    lambda b=batch: [process_func(chunk) for chunk in b]
                )
                tasks.append(task)
            
            # Wait for all batches to complete
            batch_results = await asyncio.gather(*tasks)
            
            # Flatten results
            results = []
            for batch_result in batch_results:
                results.extend(batch_result)
                
            logger.info(f"Processed {len(chunks)} chunks in {len(batches)} parallel batches")
            return results
            
        except Exception as e:
            logger.error(f"Failed to process chunks in parallel: {e}")
            raise
            
    async def enhance_chunks_metadata(
        self,
        chunks: List[LangchainDocument],
        enhancement_func: callable,
        max_concurrent: int = 10
    ) -> List[LangchainDocument]:
        """Enhance chunk metadata in parallel."""
        try:
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def enhance_with_semaphore(chunk: LangchainDocument, index: int) -> Tuple[int, LangchainDocument]:
                async with semaphore:
                    loop = asyncio.get_event_loop()
                    enhanced_chunk = await loop.run_in_executor(
                        self.executor,
                        enhancement_func,
                        chunk
                    )
                    return index, enhanced_chunk
            
            # Create tasks for all chunks
            tasks = [
                enhance_with_semaphore(chunk, i) 
                for i, chunk in enumerate(chunks)
            ]
            
            # Execute all tasks concurrently
            results = await asyncio.gather(*tasks)
            
            # Sort by index to maintain order
            results.sort(key=lambda x: x[0])
            enhanced_chunks = [result[1] for result in results]
            
            logger.info(f"Enhanced {len(enhanced_chunks)} chunks with max concurrency {max_concurrent}")
            return enhanced_chunks
            
        except Exception as e:
            logger.error(f"Failed to enhance chunks in parallel: {e}")
            raise
            
    def close(self):
        """Shutdown the executor."""
        self.executor.shutdown(wait=True)


class OptimizedVectorStoreWriter:
    """Optimized vector store writer with parallel processing."""
    
    def __init__(self, vector_store, embeddings: Embeddings, progress_tracker: Optional[IngestionProgressTracker] = None):
        """Initialize optimized writer."""
        self.vector_store = vector_store
        self.embeddings = embeddings
        self.embedding_generator = ParallelEmbeddingGenerator(embeddings)
        self.progress_tracker = progress_tracker
        
    async def add_documents_optimized(
        self,
        documents: List[Document],
        batch_size: int = 100,
        embedding_batch_size: int = 10,
        max_concurrent_embeddings: int = 20
    ) -> List[str]:
        """Add documents with optimized parallel processing."""
        try:
            # Extract texts for embedding
            texts = [doc.content for doc in documents]
            
            # Generate embeddings in parallel
            logger.info(f"Generating embeddings for {len(texts)} documents...")
            
            # Update progress for embedding phase
            if self.progress_tracker:
                await self.progress_tracker.start_step("embedding")
            
            if len(texts) > 100:
                # Use batch processing for large document sets
                embeddings = await self.embedding_generator.generate_embeddings_batch(
                    texts, batch_size=embedding_batch_size,
                    progress_callback=self._update_embedding_progress if self.progress_tracker else None
                )
            else:
                # Use concurrent processing for smaller sets
                embeddings = await self.embedding_generator.generate_embeddings_concurrent(
                    texts, max_concurrent=max_concurrent_embeddings,
                    progress_callback=self._update_embedding_progress if self.progress_tracker else None
                )
                
            if self.progress_tracker:
                await self.progress_tracker.complete_step("embedding", f"Generated {len(embeddings)} embeddings")
            
            # Convert to numpy array for efficient storage
            embeddings_array = np.array(embeddings)
            
            # Prepare documents with pre-computed embeddings
            langchain_docs = []
            for i, doc in enumerate(documents):
                metadata = doc.metadata.model_dump() if hasattr(doc.metadata, 'model_dump') else doc.metadata
                metadata["id"] = doc.id
                metadata["created_at"] = doc.created_at.isoformat()
                
                # Filter metadata
                filtered_metadata = {}
                for key, value in metadata.items():
                    if isinstance(value, (str, int, float, bool)) or value is None:
                        filtered_metadata[key] = value
                    elif isinstance(value, list) and key == "tags":
                        filtered_metadata[key] = ", ".join(str(v) for v in value)
                
                langchain_doc = LangchainDocument(
                    page_content=doc.content,
                    metadata=filtered_metadata
                )
                langchain_docs.append(langchain_doc)
            
            # Add to vector store with pre-computed embeddings
            logger.info(f"Adding {len(langchain_docs)} documents to vector store...")
            
            # Update progress for storing phase
            if self.progress_tracker:
                await self.progress_tracker.start_step("storing")
            
            # Most vector stores don't support pre-computed embeddings directly,
            # so we'll still batch the addition for efficiency
            all_ids = []
            loop = asyncio.get_event_loop()
            total_docs = len(langchain_docs)
            docs_stored = 0
            
            for i in range(0, len(langchain_docs), batch_size):
                batch = langchain_docs[i:i + batch_size]
                # Run synchronous add_documents in executor
                ids = await loop.run_in_executor(
                    None,
                    self.vector_store.add_documents,
                    batch
                )
                all_ids.extend(ids)
                docs_stored += len(batch)
                logger.info(f"Added batch {i//batch_size + 1}: {len(batch)} documents")
                
                # Update storing progress
                if self.progress_tracker:
                    await self.progress_tracker.update_storing_progress(docs_stored, total_docs)
            
            return all_ids
            
        except Exception as e:
            logger.error(f"Failed to add documents with optimization: {e}")
            raise
            
    async def _update_embedding_progress(self, current: int, total: int):
        """Update embedding progress."""
        if self.progress_tracker:
            await self.progress_tracker.update_embedding_progress(current, total)
            
    def close(self):
        """Cleanup resources."""
        self.embedding_generator.close()