"""Chat API endpoints with RAG support."""

import asyncio
import hashlib
from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any, Optional
from datetime import datetime
import uuid

from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.core.config import settings
from app.core.logging import get_logger
from app.models.query import (
    ChatRequest, ChatResponse, FollowUpRequest, 
    FollowUpResponse, FollowUpQuestion, Provider
)
from app.pipelines.enhanced_retrieval import EnhancedRetrievalPipeline
from app.pipelines.query_optimizer import QueryOptimizer
from app.services.cache import QueryCache
from app.services.advanced_cache import AdvancedCacheService, create_context_hash
from app.services.performance_monitor import get_performance_monitor
from app.utils.langchain_utils import RetryableLLM, handle_llm_error
from app.api.streaming import create_streaming_response
from app.components.result_processor import ResultProcessor
from app.components.ensemble_retriever import WeightedEnsembleRetriever
from app.components.contextual_compressor import TravelContextualCompressor
from app.components.reranker import CrossEncoderReranker
from app.components.table_query_rewriter import TableQueryRewriter
from app.services.llm_pool import LLMPool

logger = get_logger(__name__)

router = APIRouter()


def get_llm(provider: Provider, model: Optional[str] = None):
    """Get LLM instance based on provider."""
    # Handle both enum and string inputs
    if isinstance(provider, str):
        provider = Provider(provider)
    
    if provider == Provider.OPENAI:
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        
        # Log API key info for debugging
        logger.info(f"OpenAI API key starts with: {settings.openai_api_key[:10]}...")
        logger.info(f"OpenAI API key length: {len(settings.openai_api_key)}")
        
        # Check if it's an O-series reasoning model
        model_name = model or settings.openai_chat_model
        is_o_series = (model_name and (
            model_name.startswith('o3') or 
            model_name.startswith('o4') or
            model_name == 'o1' or
            model_name == 'o1-mini'
        ))
        
        # O-series models don't support temperature parameter
        try:
            if is_o_series:
                logger.info(f"Using O-series model {model_name}, temperature parameter disabled")
                llm = ChatOpenAI(
                    api_key=settings.openai_api_key,
                    model=model_name,
                    max_tokens=8192  # O-series models require max_tokens
                )
            else:
                logger.info(f"Creating OpenAI LLM for model: {model_name}")
                llm = ChatOpenAI(
                    api_key=settings.openai_api_key,
                    model=model_name,
                    temperature=0.7
                )
            logger.info(f"Successfully created OpenAI LLM for model: {model_name}")
            return RetryableLLM(llm)
        except Exception as e:
            logger.error(f"Failed to create OpenAI LLM: {type(e).__name__}: {str(e)}")
            raise
        
    elif provider == Provider.GOOGLE:
        if not settings.google_api_key:
            raise ValueError("Google API key not configured")
        llm = ChatGoogleGenerativeAI(
            google_api_key=settings.google_api_key,
            model=model or settings.google_chat_model,
            temperature=0.7
        )
        return RetryableLLM(llm)
        
    elif provider == Provider.ANTHROPIC:
        if not settings.anthropic_api_key:
            raise ValueError("Anthropic API key not configured")
        
        # Check if this is Claude Sonnet 4 and enable thinking mode
        model_name = model or settings.anthropic_chat_model
        extra_kwargs = {}
        
        if model_name == "claude-sonnet-4-20250514":
            # Enable extended thinking for Claude Sonnet 4
            # Note: thinking parameter is not directly supported by langchain-anthropic yet
            # We'll need to use the beta API directly or wait for langchain support
            logger.info(f"Claude Sonnet 4 detected - thinking mode requires direct API usage")
            # For now, use standard settings
            temperature = 1.0
        else:
            temperature = 0.7
        
        llm = ChatAnthropic(
            api_key=settings.anthropic_api_key,
            model=model_name,
            temperature=temperature
        )
        return RetryableLLM(llm)
        
    else:
        raise ValueError(f"Unsupported provider: {provider}")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, chat_request: ChatRequest) -> ChatResponse:
    """Chat endpoint with RAG support."""
    start_time = datetime.utcnow()
    perf_monitor = get_performance_monitor()
    
    # Record request
    perf_monitor.increment_counter("total_requests")
    
    try:
        # Get services from app state
        app = request.app
        vector_store = app.state.vector_store_manager
        document_store = app.state.document_store
        cache_service = getattr(app.state, "cache_service", None)
        
        # Initialize advanced cache if available
        advanced_cache = None
        if cache_service:
            advanced_cache = AdvancedCacheService(cache_service)
        
        # Initialize components using asyncio.to_thread for blocking operations
        logger.info("Creating LLM...")
        llm = await asyncio.to_thread(get_llm, chat_request.provider, chat_request.model)
        logger.info(f"LLM created: {type(llm)}")
        
        # Initialize query optimizer
        query_optimizer = QueryOptimizer(llm)
        
        # Initialize result processor
        result_processor = ResultProcessor()
        
        # Only create retrieval pipeline if RAG is enabled
        retrieval_pipeline = None
        if chat_request.use_rag:
            # Check L3 cache first (full response cache)
            cached_response = None
            if advanced_cache:
                # Create a simple context hash for cache key (will be updated after retrieval)
                context_hash = hashlib.md5(f"{chat_request.message}:{chat_request.provider}".encode()).hexdigest()
                cached_response = await advanced_cache.get_response(
                    query=chat_request.message,
                    context_hash=context_hash,
                    model=chat_request.model or "default"
                )
                
            if cached_response:
                perf_monitor.record_cache_hit("l3", True)
                logger.info("L3 cache hit - returning cached response")
                # Convert cached response to proper format if it's a dict
                if isinstance(cached_response, dict):
                    return ChatResponse(**cached_response)
                return cached_response
            else:
                if advanced_cache:
                    perf_monitor.record_cache_hit("l3", False)
                
            # Optimize query
            optimized_query = chat_request.message
            async with perf_monitor.measure_latency("query_optimization_ms"):
                # Use the query optimizer's expand_abbreviations and classify methods
                optimized_query = query_optimizer.expand_abbreviations(chat_request.message)
                # Classify intent first
                classification = await query_optimizer.classify_query(optimized_query)
                if classification and classification.intent != "unknown":
                    # Expand query based on intent
                    expanded_queries = query_optimizer.expand_query(optimized_query, classification.intent)
                    if expanded_queries:
                        # Use the first expanded query as optimized
                        optimized_query = expanded_queries[0]
                        logger.info(f"Query optimized: '{chat_request.message}' -> '{optimized_query}'")
            
            # Create components for EnhancedRetrievalPipeline
            logger.info("Creating EnhancedRetrievalPipeline components...")
            
            # Get embeddings from vector store
            embeddings = vector_store.embeddings
            
            # Debug logging for vector store
            logger.info(f"VectorStoreManager type: {type(vector_store)}")
            logger.info(f"VectorStoreManager.vector_store: {type(vector_store.vector_store) if hasattr(vector_store, 'vector_store') else 'No vector_store attribute'}")
            logger.info(f"VectorStoreManager.vector_store is None: {vector_store.vector_store is None if hasattr(vector_store, 'vector_store') else 'N/A'}")
            
            # Create ensemble retriever with multiple retrievers
            base_retriever = vector_store.get_retriever(
                search_kwargs={
                    "search_type": "similarity",
                    "k": settings.max_chunks_per_query * 2
                }
            )
            
            # Debug logging for retriever
            logger.info(f"base_retriever type: {type(base_retriever)}")
            logger.info(f"base_retriever is None: {base_retriever is None}")
            
            # Create weighted ensemble retriever
            if base_retriever is None:
                logger.error("base_retriever is None! This will cause issues.")
                raise ValueError("Failed to create retriever from vector store")
            
            logger.info(f"Creating WeightedEnsembleRetriever with base_retriever: {type(base_retriever)}")
            ensemble_retriever = WeightedEnsembleRetriever(
                retrievers=[base_retriever],
                weights=[1.0]
            )
            logger.info(f"WeightedEnsembleRetriever created successfully")
            
            # Create contextual compressor
            compressor = TravelContextualCompressor(
                base_retriever=ensemble_retriever,
                llm=llm.llm if hasattr(llm, 'llm') else llm,
                embeddings=embeddings
            )
            
            # Create reranker
            reranker = CrossEncoderReranker()
            
            # Table query rewriter
            table_rewriter = TableQueryRewriter(
                llm=llm.llm if hasattr(llm, 'llm') else llm
            )
            
            # Get LLM pool from app state
            llm_pool = getattr(app.state, "llm_pool", None) or LLMPool()
            
            # Create enhanced retrieval pipeline
            retrieval_pipeline = EnhancedRetrievalPipeline(
                retriever=ensemble_retriever,
                compressor=compressor,
                reranker=reranker,
                processor=result_processor,
                table_rewriter=table_rewriter,
                cache_service=cache_service,
                llm_pool=llm_pool
            )
            
            logger.info("EnhancedRetrievalPipeline created successfully")
        
        # Generate conversation ID if not provided
        conversation_id = chat_request.conversation_id or str(uuid.uuid4())
        
        # Retrieve context if RAG is enabled
        context = ""
        sources = []
        
        if chat_request.use_rag:
            logger.info("Retrieving context for query")
            
            # Use enhanced retrieval
            if retrieval_pipeline:
                # Use optimized query if available
                query = optimized_query if optimized_query != chat_request.message else chat_request.message
                
                # Build conversation history format for the pipeline
                conversation_history = []
                if chat_request.chat_history:
                    for msg in chat_request.chat_history:
                        conversation_history.append({
                            "role": msg.role,
                            "content": msg.content
                        })
                
                # Retrieve using enhanced pipeline
                retrieval_result = await retrieval_pipeline.retrieve(
                    query=query,
                    conversation_history=conversation_history
                )
                
                # Extract documents and context from the result
                if retrieval_result.get("answer"):
                    # Pipeline already generated an answer, but we'll regenerate with our prompts
                    logger.info("EnhancedRetrievalPipeline provided synthesized answer")
                
                # Convert sources to documents for context building
                results = []
                if retrieval_result.get("sources"):
                    for i, source in enumerate(retrieval_result["sources"]):
                        # Create a document from the source
                        from langchain_core.documents import Document
                        doc = Document(
                            page_content=source.get("title", "") + "\n" + source.get("page_content", ""),
                            metadata=source
                        )
                        # Add score if available
                        score = source.get("relevance_score", 0.8)
                        results.append((doc, score))
                else:
                    # Fall back to empty results
                    results = []
                    logger.warning("No sources returned from EnhancedRetrievalPipeline")
            else:
                # This shouldn't happen, but handle it gracefully
                logger.error("Retrieval pipeline not initialized despite RAG being enabled")
                results = []
            
            # Convert results to context and sources
            context_parts = []
            sources = []
            
            for i, (doc, score) in enumerate(results):
                # Check if this is table content
                is_table_content = "|" in doc.page_content or "table" in doc.metadata.get("content_type", "").lower()
                
                # DIAGNOSTIC: Log table detection details
                logger.info(f"[TABLE_DIAG] Source {i+1} analysis:")
                logger.info(f"  - Contains pipe chars: {'|' in doc.page_content}")
                logger.info(f"  - Content type: {doc.metadata.get('content_type', 'unknown')}")
                logger.info(f"  - Is table content: {is_table_content}")
                logger.info(f"  - Content preview (first 200 chars): {doc.page_content[:200]}")
                logger.info(f"  - Source: {doc.metadata.get('source', 'unknown')}")
                
                # Add to context with special handling for tables
                if is_table_content:
                    # Ensure table formatting is preserved
                    context_parts.append(f"[Source {i+1} - Table Content]\n{doc.page_content}\n")
                    logger.debug(f"Added table content from source {i+1}, length: {len(doc.page_content)}")
                else:
                    context_parts.append(f"[Source {i+1}]\n{doc.page_content}\n")
                    
                # Log if this contains specific values
                if "$" in doc.page_content:
                    logger.info(f"Source {i+1} contains dollar values")
                
                # Create source
                from app.models.query import Source
                
                # Check if content has table structure
                is_table_content = "|" in doc.page_content or "table" in doc.metadata.get("content_type", "").lower()
                
                # Get max preview length from settings (0 = no limit)
                max_length = settings.source_preview_max_length
                
                # Never truncate table content
                if is_table_content:
                    text_preview = doc.page_content
                elif max_length == 0:
                    # No truncation
                    text_preview = doc.page_content
                else:
                    # Smart truncation at sentence boundary
                    if len(doc.page_content) <= max_length:
                        text_preview = doc.page_content
                    else:
                        # Find the last sentence boundary before max_length
                        truncated = doc.page_content[:max_length]
                        
                        # Look for sentence endings
                        last_period = truncated.rfind(". ")
                        last_exclaim = truncated.rfind("! ")
                        last_question = truncated.rfind("? ")
                        last_newline = truncated.rfind("\n")
                        
                        # Find the latest sentence boundary
                        boundaries = [b for b in [last_period, last_exclaim, last_question, last_newline] if b > max_length * 0.8]
                        
                        if boundaries:
                            # Truncate at sentence boundary
                            boundary = max(boundaries)
                            text_preview = doc.page_content[:boundary + 1].strip() + "..."
                        else:
                            # No good boundary found, truncate at word
                            last_space = truncated.rfind(" ")
                            if last_space > max_length * 0.9:
                                text_preview = doc.page_content[:last_space] + "..."
                            else:
                                text_preview = truncated + "..."
                
                source = Source(
                    id=doc.metadata.get("id", f"source_{i}"),
                    text=text_preview,
                    title=doc.metadata.get("title"),
                    url=doc.metadata.get("source"),
                    section=doc.metadata.get("section"),
                    page=doc.metadata.get("page_number"),
                    score=score,
                    metadata=doc.metadata
                )
                sources.append(source)
            
            context = "\n".join(context_parts)
            
            # Log context size for debugging
            logger.info(f"Retrieved {len(sources)} sources, total context length: {len(context)} characters")
            
            # Log if we found table content
            has_tables = any("|" in part for part in context_parts)
            if has_tables:
                logger.info("Context contains table-formatted content")
            if sources and len(sources) > 0:
                logger.info(f"Top source: {sources[0].metadata.get('source', 'Unknown')}")
                logger.info(f"Source type: {sources[0].metadata.get('source_type', 'Unknown')}")
                logger.info(f"Content preview: {sources[0].text[:100]}...")
            
        # Build prompt
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
        
        # DIAGNOSTIC: Log system prompt details
        logger.info(f"[PROMPT_DIAG] Using chat.py endpoint")
        logger.info(f"[PROMPT_DIAG] System prompt includes table formatting instructions: True")
        logger.info(f"[PROMPT_DIAG] Query: {chat_request.message}")

        messages = [SystemMessage(content=system_prompt)]
        
        # Add chat history
        if chat_request.chat_history:
            for msg in chat_request.chat_history:
                if msg.role == "user":
                    messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    messages.append(AIMessage(content=msg.content))
                # Skip system messages from history to avoid consecutive system messages
                
        # Add context if available
        if context:
            context_prompt = f"""Based on the following official documentation, answer the user's question:

{context}

User Question: {chat_request.message}

Instructions:
1. Provide a clear, accurate answer based ONLY on the documentation above
2. If multiple sources discuss the same item, use the source that provides the most specific information (e.g., actual values over references)
3. Do NOT mention source numbers, citations, or which source you used
4. Give a direct answer without referencing the documentation structure
5. If the documentation doesn't contain the answer, simply state that the information is not available
6. Format your response using proper markdown:
   - Use tables (|column|column|) for tabular data
   - Use **bold** for emphasis
   - Use bullet points or numbered lists where appropriate
   - Use headers (##) to organize sections
   - Preserve any formatting that makes the information clearer"""
            messages.append(HumanMessage(content=context_prompt))
        else:
            # If RAG is enabled but no context found, inform the user
            if chat_request.use_rag:
                no_context_prompt = f"""No documentation was found in the knowledge base to answer this question.

User Question: {chat_request.message}

Please inform the user that no relevant information is available in the current database and suggest they may need to ingest the appropriate documents first."""
                messages.append(HumanMessage(content=no_context_prompt))
            else:
                messages.append(HumanMessage(content=chat_request.message))
            
        # Generate response
        logger.info(f"Generating response with {chat_request.provider}")
        
        # Build kwargs based on model type
        invoke_kwargs = {}
        if hasattr(llm, "model_name"):
            model_name = llm.model_name
            is_o_series = (model_name and (
                model_name.startswith('o3') or 
                model_name.startswith('o4') or
                model_name == 'o1' or
                model_name == 'o1-mini'
            ))
            if not is_o_series:
                # Only add temperature for non-O-series models
                invoke_kwargs["temperature"] = chat_request.temperature
                if chat_request.max_tokens:
                    invoke_kwargs["max_tokens"] = chat_request.max_tokens
        else:
            # For non-OpenAI models, include temperature
            invoke_kwargs["temperature"] = chat_request.temperature
            if chat_request.max_tokens:
                invoke_kwargs["max_tokens"] = chat_request.max_tokens
        
        response = await llm.ainvoke(messages, **invoke_kwargs)
        
        # Handle response content - it might be a string or a list of content blocks (for thinking mode)
        if isinstance(response.content, str):
            response_text = response.content
        elif isinstance(response.content, list):
            # Extract text content from thinking response blocks
            response_text = ""
            for block in response.content:
                if hasattr(block, 'type') and block.type == 'text':
                    response_text += block.text if hasattr(block, 'text') else str(block)
                elif hasattr(block, 'type') and block.type == 'thinking':
                    # Log thinking content but don't include in response
                    logger.info(f"[THINKING] {getattr(block, 'thinking', 'No thinking content')}")
                elif isinstance(block, str):
                    response_text += block
        else:
            response_text = str(response.content)
        
        # DIAGNOSTIC: Log response analysis
        logger.info(f"[RESPONSE_DIAG] Response length: {len(response_text)}")
        logger.info(f"[RESPONSE_DIAG] Response contains pipe chars: {'|' in response_text}")
        logger.info(f"[RESPONSE_DIAG] Response contains markdown table indicators: {any(indicator in response_text for indicator in ['|', '---', '| ---'])}")
        
        # Calculate processing time
        processing_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Extract token usage if available
        tokens_used = None
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            # Handle both dict and object cases
            if isinstance(response.usage_metadata, dict):
                tokens_used = response.usage_metadata.get("total_tokens")
            elif hasattr(response.usage_metadata, "total_tokens"):
                tokens_used = response.usage_metadata.total_tokens
            
        return ChatResponse(
            response=response_text,
            sources=sources if chat_request.include_sources else [],
            conversation_id=conversation_id,
            model=chat_request.model or getattr(llm, 'model_name', 'unknown'),
            provider=chat_request.provider,  # Already a string due to use_enum_values=True
            processing_time=processing_time,
            tokens_used=tokens_used,
            confidence_score=0.8 if sources else 0.5  # Higher confidence with sources
        )
        
    except Exception as e:
        # Log the full error with traceback
        logger.error(f"Chat request failed: {e}", exc_info=True)
        
        # Check if the error is the specific LLM .get() error
        if "'ChatOpenAI' object has no attribute 'get'" in str(e):
            logger.error("LLM .get() error detected - this usually means the LLM object is being used incorrectly somewhere")
            try:
                logger.error(f"LLM type: {type(llm)}")
            except NameError:
                logger.error("LLM was not created before error occurred")
            logger.error(f"Provider: {chat_request.provider}")
            logger.error(f"Model: {chat_request.model}")
        
        # Use our error handler for better user messages
        error_message = handle_llm_error(
            e,
            provider=str(chat_request.provider) if chat_request else "unknown"
        )
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": error_message,
                "details": str(e) if settings.debug else None
            }
        )


@router.post("/followup", response_model=FollowUpResponse)
async def generate_followup(
    request: Request,
    followup_request: FollowUpRequest
) -> FollowUpResponse:
    """Generate follow-up questions."""
    try:
        # Get default LLM with async wrapper
        llm = await asyncio.to_thread(get_llm, Provider.OPENAI)  # Use OpenAI for follow-ups
        
        # Build prompt
        sources_text = ""
        if followup_request.sources:
            sources_text = "\n\nBased on these sources:\n" + "\n".join([
                f"- {s.title or 'Document'}: {s.text[:100]}..."
                for s in followup_request.sources[:3]
            ])
            
        prompt = f"""Based on this conversation, generate {followup_request.max_questions} relevant follow-up questions that would help the user learn more:

User Question: "{followup_request.user_question}"
AI Response: "{followup_request.ai_response}"{sources_text}

Generate follow-up questions that:
1. Explore related topics mentioned in the response
2. Clarify specific details
3. Ask about practical applications

Format each question on a new line, starting with "Q:"."""

        # Generate questions
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        
        # Parse questions
        questions = []
        lines = response.content.split("\n")
        
        for i, line in enumerate(lines):
            line = line.strip()
            if line.startswith("Q:"):
                question_text = line[2:].strip()
            elif line and not line.startswith("Q:") and i > 0:
                # Handle multi-line format
                question_text = line
            else:
                continue
                
            if question_text:
                # Categorize question
                category = "general"
                if any(word in question_text.lower() for word in ["how", "steps", "process"]):
                    category = "procedural"
                elif any(word in question_text.lower() for word in ["why", "reason", "purpose"]):
                    category = "explanatory"
                elif any(word in question_text.lower() for word in ["when", "deadline", "time"]):
                    category = "temporal"
                    
                question = FollowUpQuestion(
                    id=f"followup_{uuid.uuid4().hex[:8]}",
                    question=question_text,
                    category=category,
                    confidence=0.7
                )
                questions.append(question)
                
                if len(questions) >= followup_request.max_questions:
                    break
                    
        # Fallback questions if generation failed
        if not questions:
            questions = [
                FollowUpQuestion(
                    id="followup_default_1",
                    question="Can you provide more specific examples?",
                    category="clarification",
                    confidence=0.5
                ),
                FollowUpQuestion(
                    id="followup_default_2",
                    question="What are the key requirements I should know?",
                    category="requirements",
                    confidence=0.5
                ),
                FollowUpQuestion(
                    id="followup_default_3",
                    question="Where can I find the official documentation?",
                    category="resources",
                    confidence=0.5
                )
            ]
            
        return FollowUpResponse(questions=questions[:followup_request.max_questions])
        
    except Exception as e:
        logger.error(f"Follow-up generation failed: {e}", exc_info=True)
        
        # Use our error handler for better user messages
        error_message = handle_llm_error(e, provider="openai")
        
        # Return default questions on error with error message
        return FollowUpResponse(questions=[
            FollowUpQuestion(
                id="followup_error",
                question="Could you clarify your question?",
                category="clarification",
                confidence=0.3
            )
        ])