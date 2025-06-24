#!/usr/bin/env python3
"""Test script to find the LLM .get() error."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.api.chat import get_llm
from app.models.query import Provider

# Test LLM creation
try:
    print("Testing OpenAI LLM creation...")
    llm = get_llm(Provider.OPENAI, "gpt-4.1-mini")
    print(f"LLM type: {type(llm)}")
    print(f"LLM attributes: {dir(llm)}")
    
    # Check if it has model_name
    if hasattr(llm, 'model_name'):
        print(f"model_name attribute: {llm.model_name}")
    else:
        print("No model_name attribute")
        
    # Try to access it as a dict
    try:
        llm.get('something')
        print("LLM has .get() method")
    except AttributeError as e:
        print(f"Expected error: {e}")
        
except Exception as e:
    print(f"Error creating LLM: {e}")
    import traceback
    traceback.print_exc()