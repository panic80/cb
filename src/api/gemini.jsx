import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchTravelInstructions } from './travelInstructions';
import { parseApiResponse } from '../utils/chatUtils';
import { ChatError, ChatErrorType } from '../utils/chatErrors';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Validates API key format
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} Whether the API key is valid
 */
export const validateApiKey = (apiKey) => {
  if (!apiKey) return false;
  
  // Google API keys typically start with 'AIza'
  if (!apiKey.startsWith('AIza')) return false;
  
  // Must be at least 20 characters
  return apiKey.length >= 20;
};

/**
 * Creates a prompt for the Gemini API
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to return simplified output
 * @param {string} instructions - Context for the AI
 * @returns {string} Formatted prompt
 */
export const createPrompt = (message, isSimplified = false, instructions) => {
  return `You are a specialized assistant for Canadian Forces Temporary Duty Travel Instructions. Your ONLY purpose is to provide accurate information from the Canadian Forces travel policy documents.

Here is the ONLY source material you can reference:
${instructions}

IMPORTANT RULES:
1. ONLY answer questions related to Canadian Forces travel policies, allowances, and procedures
2. If the question is about meal allowances, per diems, or dining, look for relevant sections like meal rates, allowances, or per diems
3. If the user asks when they get lunch or other meal times, interpret this as asking about meal ALLOWANCES during travel, not their personal schedule
4. NEVER say "I don't know your schedule" - instead, explain the relevant travel meal allowance policy
5. If you truly cannot find information in the source material, say "I couldn't find specific information about this in the Canadian Forces Travel Instructions. Please try rephrasing your question or ask about travel allowances, accommodations, or transportation."

Question: ${message}

Please provide a response in this EXACT format:

Reference: <provide the section or chapter reference from the source>
Quote: <provide the exact quote that contains the answer>
${isSimplified ?
  'Answer: <provide a concise answer focused on Canadian Forces travel policies in no more than two sentences>' :
  'Answer: <provide a succinct one-sentence reply focused on travel policy>\nReason: <provide a comprehensive explanation about the travel policy drawing upon the source material>'}`;
};

/**
 * Get standard generation config for Gemini API
 * @returns {Object} Generation configuration
 */
export const getGenerationConfig = () => ({
  temperature: 0.1,
  topP: 0.1,
  topK: 1,
  maxOutputTokens: 2048
});

/**
 * Delay helper for retry logic
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Handle API errors with standardized messages
 * @param {Error} error - The error to process
 * @returns {Error} Processed error with standardized message
 */
const handleApiError = (error) => {
  // If it's already a ChatError, return it
  if (error instanceof ChatError) {
    return error;
  }

  // API key validation errors
  if (error.message.includes('API key') || error.message.includes('authentication')) {
    return new ChatError(ChatErrorType.API_KEY, {
      message: error.message,
      details: 'Check VITE_GEMINI_API_KEY in .env file'
    });
  }

  // Rate limiting errors
  if (error.message.includes('quota') ||
      error.message.includes('rate limit') ||
      error.message.includes('429')) {
    return new ChatError(ChatErrorType.RATE_LIMIT, error);
  }
  
  // Network errors
  if (error.message.includes('Network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch')) {
    return new ChatError(ChatErrorType.NETWORK, error);
  }
  
  // Invalid responses
  if (error instanceof SyntaxError ||
      error.message.includes('JSON') ||
      error.message.includes('Invalid response format')) {
    return new ChatError(ChatErrorType.SERVICE, {
      message: 'Invalid API response format',
      details: error.message
    });
  }
  
  // Unknown errors
  return new ChatError(ChatErrorType.UNKNOWN, error);
};

/**
 * Call Gemini API via proxy endpoint in development
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to show simplified response
 * @param {string} model - The model to use
 * @param {string} instructions - Context for the AI
 * @param {boolean} secureMode - Whether to use secure API key handling
 * @param {boolean} enableRetry - Whether to enable retry logic
 * @returns {Promise<Object>} Response with text and sources
 */
export const callGeminiViaProxy = async (
  message, 
  isSimplified, 
  model, 
  instructions,
  secureMode = false,
  enableRetry = true
) => {
  // Validate API key
  console.log('[DEBUG] Validating API key:', API_KEY ? 'Present' : 'Missing');
  if (!validateApiKey(API_KEY)) {
    console.error('[DEBUG] API key validation failed');
    throw new ChatError(ChatErrorType.API_KEY, {
      message: 'Missing or invalid Gemini API key',
      details: 'Please check that VITE_GEMINI_API_KEY is properly set in your .env file'
    });
  }
  console.log('[DEBUG] API key validation passed');
  
  // Check if instructions are sufficient
  if (!instructions || instructions.length < 100) {
    console.error('[DEBUG] Insufficient instructions length:', instructions?.length || 0);
    throw new Error('Travel instructions content is too short or missing');
  }
  
  // Check if instructions contain any information about meals
  const hasMealInfo = instructions.toLowerCase().includes('meal') || 
                     instructions.toLowerCase().includes('lunch') ||
                     instructions.toLowerCase().includes('dinner') ||
                     instructions.toLowerCase().includes('breakfast') ||
                     instructions.toLowerCase().includes('per diem');
                     
  console.log('[DEBUG] Instructions check:', {
    length: instructions.length,
    hasMealInfo,
    previewStart: instructions.substring(0, 100) + '...'
  });
  
  const promptText = createPrompt(message, isSimplified, instructions);
  console.log('[DEBUG] Prompt created:', {
    promptLength: promptText.length,
    promptPreview: promptText.substring(0, 200) + '...' + promptText.substring(promptText.length - 100)
  });
  
  const modelName = "gemini-2.0-flash";
  const requestBody = {
    model: modelName,
    prompt: promptText,
    generationConfig: getGenerationConfig()
  };
  
  // In secure mode, pass API key in request headers instead of URL
  let url, headers;
  if (secureMode) {
    url = '/api/gemini/generateContent';
    headers = {
      "Content-Type": "application/json",
      "X-API-KEY": API_KEY
    };
  } else {
    url = `/api/gemini/generateContent?key=${API_KEY}`;
    headers = {
      "Content-Type": "application/json"
    };
  }

  let retries = 0;
  
  while (true) {
    try {
      console.log('[DEBUG] Sending request to Gemini API:', {
        url,
        method: "POST",
        headers: { ...headers, "X-API-KEY": "[REDACTED]" }
      });
      
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });

      console.log('[DEBUG] Received response:', {
        status: response.status,
        statusText: response.statusText
      });

      // Handle different error status codes
      if (!response.ok) {
        console.error('[DEBUG] Response not OK:', response.status, response.statusText);
        // Special handling for rate limiting
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        // If we shouldn't retry or have exhausted retries, throw error
        if (!enableRetry || retries >= MAX_RETRIES) {
          throw new Error(`Failed to fetch from Gemini API: ${response.status} ${response.statusText}`);
        }
        
        // Retry with exponential backoff
        retries++;
        await delay(RETRY_DELAY * Math.pow(2, retries - 1));
        continue;
      }

      try {
        const data = await response.json();
        console.log('[DEBUG] Parsing response data:', {
          hasData: !!data,
          hasCandidates: !!data?.candidates,
          candidateCount: data?.candidates?.length
        });

        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          console.error('[DEBUG] Invalid response structure:', JSON.stringify(data, null, 2));
          throw new Error('Invalid response format from Gemini API');
        }

        const text = data.candidates[0].content.parts[0].text;
        console.log('[DEBUG] Successfully parsed response text:', text.substring(0, 50) + '...');
        
        try {
          return parseApiResponse(text, isSimplified);
        } catch (formatError) {
          // Log the parsing error, but still try to return something meaningful
          console.error('[DEBUG] Error parsing response format:', formatError.message);
          console.error('[DEBUG] Raw response text:', text);
          
          // Log this error
          const errorData = {
            timestamp: new Date().toISOString(),
            endpoint: '/api/gemini/generateContent',
            errorType: 'RESPONSE_FORMAT',
            message: 'Failed to parse AI response format',
            userMessage: req?.body?.prompt?.substring(0, 200) || '(unknown)',
            details: { 
              error: formatError.message,
              responsePreview: text.substring(0, 500)
            }
          };
          
          try {
            chatLogger.logError(errorData);
          } catch (logError) {
            console.error('Failed to log error:', logError);
          }
          
          // Return a simplified response as fallback
          return {
            text: "I understand your question about Canadian Forces travel policies, but I'm having trouble formatting my response. Please try asking your question again, focusing specifically on travel allowances, accommodations, or transportation.",
            sources: [],
            fallback: true
          };
        }
      } catch (parseError) {
        if (parseError instanceof SyntaxError) {
          throw new Error('Invalid JSON response from Gemini API');
        }
        throw parseError;
      }
    } catch (error) {
      // If we should retry and haven't exhausted retries, do so
      if (enableRetry && retries < MAX_RETRIES && 
          !error.message.includes('API key') && 
          !error.message.includes('Invalid response format')) {
        retries++;
        await delay(RETRY_DELAY * Math.pow(2, retries - 1));
        continue;
      }
      
      console.error('Proxy API error:', error);
      throw handleApiError(error);
    }
  }
};

// We use the callGeminiViaProxy method exclusively for simplicity and consistency

/**
 * Default fallback response when all API methods fail
 * @param {boolean} isSimplified - Whether to show simplified response
 * @returns {Object} A fallback response object
 */
export const getFallbackResponse = (isSimplified) => ({
  text: isSimplified 
    ? "Unable to generate response. Please try again later."
    : "Unable to generate response. Please try again later. Our AI service may be experiencing temporary issues.",
  sources: [{
    reference: "System",
    text: "Fallback response when API is unavailable."
  }],
  fallback: true
});

/**
 * Send message to Gemini API
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to show simplified response
 * @param {string} model - The model to use
 * @param {string} preloadedInstructions - Preloaded travel instructions
 * @param {boolean} useFallback - Whether to return fallback content on error
 * @returns {Promise<Object>} Response with text and sources
 */
export const sendToGemini = async (
  message,
  isSimplified = false,
  model = 'gemini-2.0-flash',
  preloadedInstructions = null,
  useFallback = false
) => {
  try {
    // Ensure we have travel instructions
    if (!preloadedInstructions) {
      throw new Error('Travel instructions not loaded');
    }

    // Use proxy method for both development and production
    // This simplifies our code and ensures consistent behavior
    try {
      return await callGeminiViaProxy(message, isSimplified, model, preloadedInstructions, true);
    } catch (error) {
      console.error('Gemini API Error via proxy:', error);
      throw error;
    }

  } catch (error) {
    console.error('Gemini API Error:', {
      type: error instanceof ChatError ? error.type : 'UNKNOWN',
      message: error.message,
      stack: error.stack
    });
    
    // Return fallback content if enabled, otherwise propagate the error
    if (useFallback) {
      console.log('Returning fallback response due to error');
      return getFallbackResponse(isSimplified);
    }
    
    // Transform any remaining errors into ChatErrors
    if (!(error instanceof ChatError)) {
      throw new ChatError(ChatErrorType.SERVICE, {
        message: 'Could not connect to Gemini API after multiple attempts',
        originalError: error
      });
    }
    
    throw error;
  }
};
