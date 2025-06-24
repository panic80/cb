"""Streaming chat API endpoint for real-time responses."""

import asyncio
import json
import time
from datetime import datetime
from typing import AsyncGenerator, Optional
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
import uuid

from app.core.config import settings
from app.core.logging import get_logger
from app.models.query import ChatRequest, Provider
from app.api.chat import get_llm
from app.pipelines.parallel_retrieval import create_parallel_pipeline
from app.pipelines.query_optimizer import QueryOptimizer
from app.services.advanced_cache import AdvancedCacheService, create_context_hash
from app.services.performance_monitor import get_performance_monitor
from app.api.streaming import StreamingCallbackHandler, RetrievalStreamingHandler
from app.components.result_processor import StreamingResultProcessor
from app.services.llm_pool import llm_pool

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.callbacks import AsyncCallbackManager

logger = get_logger(__name__)

router = APIRouter()


async def generate_sse_events(
    chat_request: ChatRequest,
    request: Request
) -> AsyncGenerator[str, None]:
    """Generate Server-Sent Events for streaming chat responses."""
    start_time = datetime.utcnow()
    perf_monitor = get_performance_monitor()
    first_token_time = None
    
    # Record request
    perf_monitor.increment_counter("streaming_requests")
    
    # Track connection
    connection_id = str(uuid.uuid4())
    logger.info(f"Streaming connection {connection_id} started")
    
    try:
        # Yield connection established event
        yield f"data: {json.dumps({'type': 'connection', 'id': connection_id})}\n\n"
        
        # Get services from app state
        app = request.app
        vector_store = app.state.vector_store_manager
        document_store = app.state.document_store
        cache_service = getattr(app.state, "cache_service", None)
        
        # Acquire LLM from pool
        llm_wrapper = None
        llm = None
        from_pool = False
        
        # Try to acquire from pool first
        # Ensure we have a Provider enum object
        provider_enum = chat_request.provider
        if isinstance(provider_enum, str):
            # Convert string to Provider enum
            provider_map = {
                "openai": Provider.OPENAI,
                "anthropic": Provider.ANTHROPIC,
                "google": Provider.GOOGLE,
                "Provider.OPENAI": Provider.OPENAI,
                "Provider.ANTHROPIC": Provider.ANTHROPIC,
                "Provider.GOOGLE": Provider.GOOGLE,
                "OPENAI": Provider.OPENAI,
                "ANTHROPIC": Provider.ANTHROPIC,
                "GOOGLE": Provider.GOOGLE
            }
            provider_enum = provider_map.get(provider_enum, Provider.OPENAI)
        
        try:
            # Use async context manager pattern
            async with llm_pool.acquire(provider_enum, chat_request.model or "gpt-4") as llm_wrapper:
                from_pool = True
                logger.info(f"Acquired LLM from pool: {provider_enum.value}:{chat_request.model}")
                
                # Process the entire request within the context manager
                # to ensure the connection stays alive
                
                # Initialize components
                query_optimizer = QueryOptimizer(llm_wrapper)
                
                # Get the underlying LLM from the RetryableLLM wrapper for streaming
                llm = llm_wrapper.llm
                
                # Initialize streaming handlers with queues
                streaming_queue = asyncio.Queue()
                retrieval_queue = asyncio.Queue()
                streaming_handler = StreamingCallbackHandler(streaming_queue)
                retrieval_handler = RetrievalStreamingHandler(retrieval_queue)
                
                # Setup callback manager for streaming (only include LangChain callback handlers)
                callback_manager = AsyncCallbackManager([streaming_handler])
                
                # Configure LLM with streaming
                llm.callbacks = callback_manager
                llm.streaming = True
                
                # Initialize result processor for streaming
                result_processor = StreamingResultProcessor()
                
                # Advanced cache initialization
                advanced_cache = None
                if cache_service:
                    advanced_cache = AdvancedCacheService(cache_service)
                
                # Only create retrieval pipeline if RAG is enabled
                retrieval_pipeline = None
                context = ""
                sources = []
                results = []
                
                if chat_request.use_rag:
                    # Yield retrieval start event
                    yield f"data: {json.dumps({'type': 'retrieval_start'})}\n\n"
                    
                    # Check cache first
                    cached_response = None
                    if advanced_cache:
                        context_hash = create_context_hash(
                            query=chat_request.message,
                            documents=[],  # Will be updated after retrieval
                            model=chat_request.model or "default"
                        )
                        cached_response = await advanced_cache.get_response(
                            query=chat_request.message,
                            context_hash=context_hash,
                            model=chat_request.model or "default"
                        )
                    
                    if cached_response:
                        # Stream cached response
                        yield f"data: {json.dumps({'type': 'cache_hit', 'level': 'l3'})}\n\n"
                        
                        # Split cached response into tokens for streaming effect
                        tokens = cached_response.get("response", "").split()
                        for i, token in enumerate(tokens):
                            if i == 0 and first_token_time is None:
                                first_token_time = datetime.utcnow()
                            yield f"data: {json.dumps({'type': 'token', 'content': token + ' '})}\n\n"
                            await asyncio.sleep(0.01)  # Small delay for streaming effect
                        
                        # Send sources if available
                        if cached_response.get("sources"):
                            yield f"data: {json.dumps({'type': 'sources', 'sources': cached_response['sources']})}\n\n"
                        
                        # Complete event
                        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                        return
                    
                    # Query optimization (use rule-based only for speed)
                    optimized_query = chat_request.message
                    async with perf_monitor.measure_latency("query_optimization_ms"):
                        # Expand abbreviations
                        optimized_query = query_optimizer.expand_abbreviations(chat_request.message)
                        # Use rule-based classification to avoid LLM call
                        classification = query_optimizer._rule_based_classification(optimized_query)
                        if classification and classification.intent != "unknown":
                            expanded_queries = query_optimizer.expand_query(optimized_query, classification.intent)
                            if expanded_queries:
                                optimized_query = expanded_queries[0]
                    
                    # Use parallel retrieval pipeline (use wrapper for non-streaming operations)
                    retrieval_pipeline = await asyncio.to_thread(
                        create_parallel_pipeline,
                        vector_store_manager=vector_store,
                        llm=llm_wrapper
                    )
                    
                    # Retrieve with progress updates
                    logger.info("Starting retrieval for streaming query")
                    
                    # Set up retrieval monitoring
                    retrieval_start = time.time()
                    
                    results = await retrieval_pipeline.retrieve(
                        query=optimized_query,
                        k=settings.max_chunks_per_query
                    )
                    
                    retrieval_time = time.time() - retrieval_start
                    yield f"data: {json.dumps({'type': 'retrieval_complete', 'duration': retrieval_time, 'count': len(results)})}\n\n"
                    
                    # Process results for streaming
                    if results:
                        # Stream process results
                        # Process results and collect them
                        processed_docs = []
                        async for doc in result_processor.process_results_stream(
                            documents=[doc for doc, _ in results],
                            query=optimized_query
                        ):
                            processed_docs.append(doc)
                        
                        # Use processed_docs instead of processed_results
                        processed_results = [(doc, doc.metadata.get('score', 0.0)) for doc in processed_docs]
                        
                        # Build context
                        context_parts = []
                        sources = []
                        
                        for i, (doc, score) in enumerate(processed_results):
                            is_table_content = "|" in doc.page_content or "table" in doc.metadata.get("content_type", "").lower()
                            
                            if is_table_content:
                                context_parts.append(f"[Source {i+1} - Table Content]\n{doc.page_content}\n")
                            else:
                                context_parts.append(f"[Source {i+1}]\n{doc.page_content}\n")
                            
                            # Create source object
                            from app.models.query import Source
                            
                            # Handle different metadata field names
                            url = doc.metadata.get("source") or doc.metadata.get("url") or doc.metadata.get("file_path", "Unknown")
                            title = doc.metadata.get("title") or doc.metadata.get("filename") or url
                            
                            source = Source(
                                id=doc.metadata.get("id", f"source_{i}"),
                                text=doc.page_content[:settings.source_preview_max_length] if settings.source_preview_max_length > 0 else doc.page_content,
                                title=title,
                                url=url,
                                section=doc.metadata.get("section"),
                                page=doc.metadata.get("page_number"),
                                score=score,
                                metadata=doc.metadata
                            )
                            sources.append(source.dict())
                        
                        context = "\n".join(context_parts)
                        
                        # Send sources event
                        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
                
                # Build messages
                system_prompt = """You are a helpful assistant for Canadian Forces members seeking information about travel instructions and policies.
Always provide accurate, specific information based on the official documentation provided.
If you're not certain about something, clearly state that.

IMPORTANT RULES:
1. When multiple sources are present, prioritize the source that provides the most specific and complete information (e.g., actual dollar amounts over references to appendices)
2. NEVER mention source numbers, citations, or reference which source you used
3. Do NOT say things like "according to Source X" or "as stated in the documentation"
4. Give direct, clear answers without referencing the documentation structure
5. If specific values are found, state them directly without qualification
6. Always use proper markdown formatting in your responses:
   - Tables for structured data
   - **Bold** for important values or headers
   - Bullet points or numbered lists for multiple items
   - Clear section headers when appropriate

CRITICAL: When answering questions about rates, allowances, or tables:
- ALWAYS include the actual dollar amounts or specific values found in the documentation
- If you find a table structure (with | characters), preserve and present it as a markdown table
- For meal allowances, include breakfast, lunch, and dinner rates with specific dollar amounts
- For kilometric rates, include the cents per kilometer values
- For incidental allowances, include the daily rates
- If the documentation contains a complete table, reproduce it in your response
- Do not summarize or generalize when specific values are available"""

                # DIAGNOSTIC: Log system prompt comparison
                logger.info(f"[PROMPT_DIAG] Using streaming_chat.py endpoint")
                logger.info(f"[PROMPT_DIAG] System prompt includes table formatting instructions: False")
                logger.info(f"[PROMPT_DIAG] Query: {chat_request.message}")

                messages = [SystemMessage(content=system_prompt)]
                
                # Add chat history
                if chat_request.chat_history:
                    for msg in chat_request.chat_history:
                        if msg.role == "user":
                            messages.append(HumanMessage(content=msg.content))
                        else:
                            messages.append(SystemMessage(content=msg.content))
                
                # Add context or current message
                if context:
                    context_prompt = f"""Based on the following official documentation, answer the user's question:

{context}

User Question: {chat_request.message}"""
                    messages.append(HumanMessage(content=context_prompt))
                else:
                    messages.append(HumanMessage(content=chat_request.message))
                
                # Yield generation start event
                yield f"data: {json.dumps({'type': 'generation_start'})}\n\n"
                
                # Stream the response
                token_count = 0
                full_response = ""
                async for chunk in llm.astream(messages):
                    # Handle different chunk types from different providers
                    content = None
                    if hasattr(chunk, 'content'):
                        content = chunk.content
                    elif isinstance(chunk, dict) and 'content' in chunk:
                        content = chunk['content']
                    elif isinstance(chunk, str):
                        content = chunk
                    
                    if content:
                        # Record first token time
                        if first_token_time is None:
                            first_token_time = datetime.utcnow()
                            first_token_latency = (first_token_time - start_time).total_seconds() * 1000
                            perf_monitor.record_latency("first_token_latency_ms", first_token_latency)
                            yield f"data: {json.dumps({'type': 'first_token', 'latency': first_token_latency})}\n\n"
                        
                        # Send token
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                        full_response += content
                        token_count += 1
                        
                        # Backpressure management - slow down if client is slow
                        if token_count % 10 == 0:
                            await asyncio.sleep(0.001)
                
                # Calculate final metrics
                total_time = (datetime.utcnow() - start_time).total_seconds()
                
                # Record metrics
                perf_monitor.record_latency("streaming_total_time_ms", total_time * 1000)
                perf_monitor.record_token_usage(str(chat_request.provider), token_count)
                
                # Cache the complete response if enabled
                if advanced_cache and context and sources and full_response:
                    # Update context hash with actual retrieved documents
                    context_hash = create_context_hash(
                        query=chat_request.message,
                        documents=[doc for doc, _ in results] if results else [],
                        model=chat_request.model or "default"
                    )
                    
                    # Cache the complete response
                    await advanced_cache.set_response(
                        query=chat_request.message,
                        context_hash=context_hash,
                        response={"response": full_response, "sources": sources},
                        model=chat_request.model or "default"
                    )
                
                # Send completion event
                yield f"data: {json.dumps({'type': 'complete', 'duration': total_time, 'tokens': token_count})}\n\n"
                
        except Exception as pool_error:
            logger.warning(f"Failed to acquire from pool: {pool_error}. Creating new instance.")
            # Fallback to creating new instance
            llm_wrapper = await asyncio.to_thread(get_llm, chat_request.provider, chat_request.model)
            llm = llm_wrapper.llm
            
            # Continue with the same logic as above but without the pool
            # Initialize components
            query_optimizer = QueryOptimizer(llm_wrapper)
            
            # Initialize streaming handlers with queues
            streaming_queue = asyncio.Queue()
            retrieval_queue = asyncio.Queue()
            streaming_handler = StreamingCallbackHandler(streaming_queue)
            retrieval_handler = RetrievalStreamingHandler(retrieval_queue)
            
            # Setup callback manager for streaming (only include LangChain callback handlers)
            callback_manager = AsyncCallbackManager([streaming_handler])
            
            # Configure LLM with streaming
            llm.callbacks = callback_manager
            llm.streaming = True
            
            # Initialize result processor for streaming
            result_processor = StreamingResultProcessor()
            
            # Advanced cache initialization
            advanced_cache = None
            if cache_service:
                advanced_cache = AdvancedCacheService(cache_service)
            
            # Only create retrieval pipeline if RAG is enabled
            retrieval_pipeline = None
            context = ""
            sources = []
            results = []
            
            if chat_request.use_rag:
                # Yield retrieval start event
                yield f"data: {json.dumps({'type': 'retrieval_start'})}\n\n"
                
                # Check cache first
                cached_response = None
                if advanced_cache:
                    context_hash = create_context_hash(
                        query=chat_request.message,
                        documents=[],  # Will be updated after retrieval
                        model=chat_request.model or "default"
                    )
                    cached_response = await advanced_cache.get_response(
                        query=chat_request.message,
                        context_hash=context_hash,
                        model=chat_request.model or "default"
                    )
                
                if cached_response:
                    # Stream cached response
                    yield f"data: {json.dumps({'type': 'cache_hit', 'level': 'l3'})}\n\n"
                    
                    # Split cached response into tokens for streaming effect
                    tokens = cached_response.get("response", "").split()
                    for i, token in enumerate(tokens):
                        if i == 0 and first_token_time is None:
                            first_token_time = datetime.utcnow()
                        yield f"data: {json.dumps({'type': 'token', 'content': token + ' '})}\n\n"
                        await asyncio.sleep(0.01)  # Small delay for streaming effect
                    
                    # Send sources if available
                    if cached_response.get("sources"):
                        yield f"data: {json.dumps({'type': 'sources', 'sources': cached_response['sources']})}\n\n"
                    
                    # Complete event
                    yield f"data: {json.dumps({'type': 'complete'})}\n\n"
                    return
                
                # Query optimization (use rule-based only for speed)
                optimized_query = chat_request.message
                async with perf_monitor.measure_latency("query_optimization_ms"):
                    # Expand abbreviations
                    optimized_query = query_optimizer.expand_abbreviations(chat_request.message)
                    # Use rule-based classification to avoid LLM call
                    classification = query_optimizer._rule_based_classification(optimized_query)
                    if classification and classification.intent != "unknown":
                        expanded_queries = query_optimizer.expand_query(optimized_query, classification.intent)
                        if expanded_queries:
                            optimized_query = expanded_queries[0]
                
                # Use parallel retrieval pipeline (use wrapper for non-streaming operations)
                retrieval_pipeline = await asyncio.to_thread(
                    create_parallel_pipeline,
                    vector_store_manager=vector_store,
                    llm=llm_wrapper
                )
                
                # Retrieve with progress updates
                logger.info("Starting retrieval for streaming query")
                
                # Set up retrieval monitoring
                retrieval_start = time.time()
                
                results = await retrieval_pipeline.retrieve(
                    query=optimized_query,
                    k=settings.max_chunks_per_query
                )
                
                retrieval_time = time.time() - retrieval_start
                yield f"data: {json.dumps({'type': 'retrieval_complete', 'duration': retrieval_time, 'count': len(results)})}\n\n"
                
                # Process results for streaming
                if results:
                    # Stream process results
                    # Process results and collect them
                    processed_docs = []
                    async for doc in result_processor.process_results_stream(
                        documents=[doc for doc, _ in results],
                        query=optimized_query
                    ):
                        processed_docs.append(doc)
                    
                    # Use processed_docs instead of processed_results
                    processed_results = [(doc, doc.metadata.get('score', 0.0)) for doc in processed_docs]
                    
                    # Build context
                    context_parts = []
                    sources = []
                    
                    for i, (doc, score) in enumerate(processed_results):
                        is_table_content = "|" in doc.page_content or "table" in doc.metadata.get("content_type", "").lower()
                        
                        if is_table_content:
                            context_parts.append(f"[Source {i+1} - Table Content]\n{doc.page_content}\n")
                        else:
                            context_parts.append(f"[Source {i+1}]\n{doc.page_content}\n")
                        
                        # Create source object
                        from app.models.query import Source
                        
                        # Handle different metadata field names
                        url = doc.metadata.get("source") or doc.metadata.get("url") or doc.metadata.get("file_path", "Unknown")
                        title = doc.metadata.get("title") or doc.metadata.get("filename") or url
                        
                        source = Source(
                            id=doc.metadata.get("id", f"source_{i}"),
                            text=doc.page_content[:settings.source_preview_max_length] if settings.source_preview_max_length > 0 else doc.page_content,
                            title=title,
                            url=url,
                            section=doc.metadata.get("section"),
                            page=doc.metadata.get("page_number"),
                            score=score,
                            metadata=doc.metadata
                        )
                        sources.append(source.dict())
                    
                    context = "\n".join(context_parts)
                    
                    # Send sources event
                    yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
            
            # Build messages
            system_prompt = """You are a helpful assistant for Canadian Forces members seeking information about travel instructions and policies.
Always provide accurate, specific information based on the official documentation provided.
If you're not certain about something, clearly state that.

IMPORTANT RULES:
1. When multiple sources are present, prioritize the source that provides the most specific and complete information (e.g., actual dollar amounts over references to appendices)
2. NEVER mention source numbers, citations, or reference which source you used
3. Do NOT say things like "according to Source X" or "as stated in the documentation"
4. Give direct, clear answers without referencing the documentation structure
5. If specific values are found, state them directly without qualification
6. Always use proper markdown formatting in your responses:
   - Tables for structured data
   - **Bold** for important values or headers
   - Bullet points or numbered lists for multiple items
   - Clear section headers when appropriate

CRITICAL: When answering questions about rates, allowances, or tables:
- ALWAYS include the actual dollar amounts or specific values found in the documentation
- If you find a table structure (with | characters), preserve and present it as a markdown table
- For meal allowances, include breakfast, lunch, and dinner rates with specific dollar amounts
- For kilometric rates, include the cents per kilometer values
- For incidental allowances, include the daily rates
- If the documentation contains a complete table, reproduce it in your response
- Do not summarize or generalize when specific values are available"""

            # DIAGNOSTIC: Log system prompt comparison (fallback flow)
            logger.info(f"[PROMPT_DIAG] Using streaming_chat.py endpoint (fallback)")
            logger.info(f"[PROMPT_DIAG] System prompt includes table formatting instructions: False")
            logger.info(f"[PROMPT_DIAG] Query: {chat_request.message}")

            messages = [SystemMessage(content=system_prompt)]
            
            # Add chat history
            if chat_request.chat_history:
                for msg in chat_request.chat_history:
                    if msg.role == "user":
                        messages.append(HumanMessage(content=msg.content))
                    else:
                        messages.append(SystemMessage(content=msg.content))
            
            # Add context or current message
            if context:
                context_prompt = f"""Based on the following official documentation, answer the user's question:

{context}

User Question: {chat_request.message}"""
                messages.append(HumanMessage(content=context_prompt))
            else:
                messages.append(HumanMessage(content=chat_request.message))
            
            # Yield generation start event
            yield f"data: {json.dumps({'type': 'generation_start'})}\n\n"
            
            # Stream the response
            token_count = 0
            full_response = ""
            async for chunk in llm.astream(messages):
                # Handle different chunk types from different providers
                content = None
                if hasattr(chunk, 'content'):
                    content = chunk.content
                elif isinstance(chunk, dict) and 'content' in chunk:
                    content = chunk['content']
                elif isinstance(chunk, str):
                    content = chunk
                
                if content:
                    # Record first token time
                    if first_token_time is None:
                        first_token_time = datetime.utcnow()
                        first_token_latency = (first_token_time - start_time).total_seconds() * 1000
                        perf_monitor.record_latency("first_token_latency_ms", first_token_latency)
                        yield f"data: {json.dumps({'type': 'first_token', 'latency': first_token_latency})}\n\n"
                    
                    # Send token
                    yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                    full_response += content
                    token_count += 1
                    
                    # Backpressure management - slow down if client is slow
                    if token_count % 10 == 0:
                        await asyncio.sleep(0.001)
            
            # Calculate final metrics
            total_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Record metrics
            perf_monitor.record_latency("streaming_total_time_ms", total_time * 1000)
            perf_monitor.record_token_usage(str(chat_request.provider), token_count)
            
            # Cache the complete response if enabled
            if advanced_cache and context and sources and full_response:
                # Update context hash with actual retrieved documents
                context_hash = create_context_hash(
                    query=chat_request.message,
                    documents=[doc for doc, _ in results] if results else [],
                    model=chat_request.model or "default"
                )
                
                # Cache the complete response
                await advanced_cache.set_response(
                    query=chat_request.message,
                    context_hash=context_hash,
                    response={"response": full_response, "sources": sources},
                    model=chat_request.model or "default"
                )
            
            # Send completion event
            yield f"data: {json.dumps({'type': 'complete', 'duration': total_time, 'tokens': token_count})}\n\n"
        
    except asyncio.CancelledError:
        # Client disconnected
        logger.info(f"Streaming connection {connection_id} cancelled by client")
        yield f"data: {json.dumps({'type': 'error', 'message': 'Connection cancelled'})}\n\n"
        raise
        
    except Exception as e:
        logger.error(f"Streaming chat error: {e}", exc_info=True)
        perf_monitor.increment_counter("streaming_errors")
        
        error_message = str(e)
        if "rate limit" in error_message.lower():
            error_type = "rate_limit"
        elif "api key" in error_message.lower():
            error_type = "auth_error"
        else:
            error_type = "unknown_error"
        
        yield f"data: {json.dumps({'type': 'error', 'error_type': error_type, 'message': error_message})}\n\n"
        
    finally:
        # Connection cleanup is handled automatically by the async context manager
        logger.info(f"Streaming connection {connection_id} closed")
        perf_monitor.increment_counter("streaming_connections_closed")


@router.post("/streaming_chat")
async def streaming_chat(request: Request, chat_request: ChatRequest):
    """
    Streaming chat endpoint using Server-Sent Events.
    
    Returns real-time token-by-token responses with progress updates.
    """
    # Validate streaming support
    if not hasattr(settings, "enable_streaming") or not settings.enable_streaming:
        raise HTTPException(
            status_code=501,
            detail="Streaming is not enabled in this deployment"
        )
    
    # Create streaming response
    return StreamingResponse(
        generate_sse_events(chat_request, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        }
    )


@router.get("/streaming_chat/test")
async def test_streaming():
    """Test endpoint for streaming functionality."""
    async def generate():
        for i in range(10):
            yield f"data: {json.dumps({'type': 'test', 'count': i})}\n\n"
            await asyncio.sleep(0.5)
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )