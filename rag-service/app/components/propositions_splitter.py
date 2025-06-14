import logging
import re
from typing import List, Dict, Any, Optional
from haystack import component, Document
from haystack.components.generators import OpenAIGenerator
from haystack.utils import Secret
import tiktoken
import json

from app.core.config import settings

logger = logging.getLogger(__name__)


@component
class PropositionsDocumentSplitter:
    """
    Document splitter that extracts atomic propositions from text.
    Each proposition is a self-contained factoid that can be understood independently.
    """
    
    def __init__(
        self,
        llm_model: str = None,
        max_propositions_per_chunk: int = 5,
        min_chunk_size: int = None,
        max_chunk_size: int = None,
        api_key: str = None,
        temperature: float = 0.1
    ):
        """
        Initialize propositions document splitter.
        
        Args:
            llm_model: Model to use for proposition extraction
            max_propositions_per_chunk: Maximum propositions per chunk
            min_chunk_size: Minimum chunk size in tokens
            max_chunk_size: Maximum chunk size in tokens
            api_key: OpenAI API key
            temperature: LLM temperature for generation
        """
        self.llm_model = llm_model or settings.LLM_MODEL
        self.max_propositions_per_chunk = max_propositions_per_chunk
        self.min_chunk_size = min_chunk_size or settings.MIN_CHUNK_SIZE
        self.max_chunk_size = max_chunk_size or settings.MAX_CHUNK_SIZE
        self.temperature = temperature
        
        # Initialize generator for proposition extraction
        self.generator = OpenAIGenerator(
            api_key=Secret.from_token(api_key or settings.OPENAI_API_KEY),
            model=self.llm_model,
            generation_kwargs={
                "temperature": self.temperature,
                "response_format": {"type": "json_object"}
            }
        )
        
        # Initialize tokenizer
        self.tokenizer = tiktoken.encoding_for_model(self.llm_model)
        
        logger.info("Initialized PropositionsDocumentSplitter")
    
    @component.output_types(documents=List[Document])
    def run(self, documents: List[Document]) -> Dict[str, Any]:
        """
        Split documents into atomic propositions.
        
        Args:
            documents: List of documents to split
            
        Returns:
            Dictionary with 'documents' key containing split documents
        """
        split_documents = []
        
        for doc in documents:
            try:
                if not doc.content or not doc.content.strip():
                    logger.warning(f"Skipping empty document: {doc.id}")
                    continue
                
                # Extract propositions from document
                propositions = self._extract_propositions(doc)
                
                # Group propositions into chunks
                chunks = self._group_propositions(propositions)
                
                for i, chunk_propositions in enumerate(chunks):
                    if chunk_propositions:
                        # Create content from propositions
                        chunk_content = self._format_propositions(chunk_propositions)
                        
                        chunk_doc = Document(
                            content=chunk_content,
                            meta={
                                **doc.meta,
                                "chunk_id": f"{doc.id}_chunk_{i}",
                                "chunk_index": i,
                                "total_chunks": len(chunks),
                                "splitter": "PropositionsDocumentSplitter",
                                "num_propositions": len(chunk_propositions),
                                "propositions": chunk_propositions
                            }
                        )
                        split_documents.append(chunk_doc)
                
                logger.info(f"Extracted {len(propositions)} propositions from document {doc.id}")
                
            except Exception as e:
                logger.error(f"Error splitting document {doc.id}: {e}", exc_info=True)
                # Fall back to including original document
                split_documents.append(doc)
        
        return {"documents": split_documents}
    
    def _extract_propositions(self, doc: Document) -> List[Dict[str, Any]]:
        """Extract atomic propositions from document content."""
        content = doc.content
        
        # Split content into manageable sections
        sections = self._split_into_sections(content)
        all_propositions = []
        
        for section in sections:
            if not section.strip():
                continue
            
            # Create prompt for proposition extraction
            prompt = self._create_extraction_prompt(section)
            
            try:
                # Generate propositions
                result = self.generator.run(prompt=prompt)
                response = result["replies"][0]
                
                # Parse JSON response
                propositions_data = json.loads(response)
                propositions = propositions_data.get("propositions", [])
                
                # Add context to each proposition
                for prop in propositions:
                    prop["source_section"] = section[:100] + "..." if len(section) > 100 else section
                    prop["document_id"] = doc.id
                
                all_propositions.extend(propositions)
                
            except Exception as e:
                logger.error(f"Error extracting propositions from section: {e}")
                # Create a fallback proposition
                fallback_prop = {
                    "text": section,
                    "type": "fallback",
                    "confidence": 0.5,
                    "source_section": section[:100] + "..." if len(section) > 100 else section,
                    "document_id": doc.id
                }
                all_propositions.append(fallback_prop)
        
        return all_propositions
    
    def _split_into_sections(self, content: str) -> List[str]:
        """Split content into sections for processing."""
        # Split by paragraphs first
        paragraphs = re.split(r'\n\s*\n', content)
        
        sections = []
        current_section = ""
        current_tokens = 0
        
        # Group paragraphs into sections that fit within token limits
        for paragraph in paragraphs:
            paragraph_tokens = len(self.tokenizer.encode(paragraph))
            
            if current_tokens + paragraph_tokens <= 1000:  # Keep sections under 1000 tokens
                if current_section:
                    current_section += "\n\n" + paragraph
                else:
                    current_section = paragraph
                current_tokens += paragraph_tokens
            else:
                if current_section:
                    sections.append(current_section)
                current_section = paragraph
                current_tokens = paragraph_tokens
        
        if current_section:
            sections.append(current_section)
        
        return sections
    
    def _create_extraction_prompt(self, section: str) -> str:
        """Create prompt for proposition extraction."""
        return f"""Extract atomic propositions from the following text. Each proposition should be:
1. A self-contained factoid that can be understood independently
2. As specific and precise as possible
3. Free of pronouns or references that require external context
4. Factually accurate to the source text

Return the propositions in JSON format with the following structure:
{{
    "propositions": [
        {{
            "text": "The actual proposition text",
            "type": "fact|definition|claim|instruction|description",
            "confidence": 0.0-1.0,
            "key_entities": ["entity1", "entity2"],
            "relationships": ["relationship1", "relationship2"]
        }}
    ]
}}

Text to analyze:
{section}

Extract all meaningful propositions from this text."""
    
    def _group_propositions(self, propositions: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """Group propositions into chunks based on size constraints."""
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for prop in propositions:
            prop_text = prop.get("text", "")
            prop_tokens = len(self.tokenizer.encode(prop_text))
            
            # Check if adding this proposition would exceed limits
            if current_chunk and (
                len(current_chunk) >= self.max_propositions_per_chunk or
                current_tokens + prop_tokens > self.max_chunk_size
            ):
                # Start a new chunk
                chunks.append(current_chunk)
                current_chunk = [prop]
                current_tokens = prop_tokens
            else:
                current_chunk.append(prop)
                current_tokens += prop_tokens
        
        # Add the last chunk
        if current_chunk:
            chunks.append(current_chunk)
        
        # Merge small chunks if needed
        chunks = self._merge_small_chunks(chunks)
        
        return chunks
    
    def _merge_small_chunks(self, chunks: List[List[Dict[str, Any]]]) -> List[List[Dict[str, Any]]]:
        """Merge chunks that are too small."""
        merged_chunks = []
        current_merged = []
        current_tokens = 0
        
        for chunk in chunks:
            chunk_tokens = sum(len(self.tokenizer.encode(p.get("text", ""))) for p in chunk)
            
            if current_tokens + chunk_tokens <= self.max_chunk_size:
                current_merged.extend(chunk)
                current_tokens += chunk_tokens
            else:
                if current_merged:
                    merged_chunks.append(current_merged)
                current_merged = chunk
                current_tokens = chunk_tokens
        
        if current_merged:
            merged_chunks.append(current_merged)
        
        return merged_chunks
    
    def _format_propositions(self, propositions: List[Dict[str, Any]]) -> str:
        """Format propositions into readable chunk content."""
        formatted_lines = []
        
        # Group by type for better organization
        by_type = {}
        for prop in propositions:
            prop_type = prop.get("type", "unknown")
            if prop_type not in by_type:
                by_type[prop_type] = []
            by_type[prop_type].append(prop)
        
        # Format each type group
        for prop_type, props in by_type.items():
            if props:
                formatted_lines.append(f"## {prop_type.title()}s:")
                for prop in props:
                    text = prop.get("text", "")
                    confidence = prop.get("confidence", 0)
                    entities = prop.get("key_entities", [])
                    
                    # Format the proposition
                    formatted_lines.append(f"- {text}")
                    
                    # Add metadata if highly confident
                    if confidence >= 0.8 and entities:
                        formatted_lines.append(f"  Entities: {', '.join(entities)}")
                
                formatted_lines.append("")  # Empty line between sections
        
        return "\n".join(formatted_lines).strip()