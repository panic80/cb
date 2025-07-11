import { GoogleGenAI } from '@google/genai';
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
  return `You are a helpful assistant for Canadian Forces Travel Instructions.

SPECIAL CALCULATION INSTRUCTIONS:
When a question involves travel entitlement calculations (e.g., "what are my entitlements", "total dollar amount", mentioning travel dates, mileage, R&Q, POMV, etc.), you MUST calculate the following components:

1. INCIDENTALS: Calculate daily incidentals for each day the member is away from home
2. MILEAGE: If POMV (Privately Owned Motor Vehicle) is authorized, calculate mileage costs based on distance provided
3. MEALS EN ROUTE: Calculate meal entitlements for travel days based on travel times:
   - If no specific times are provided, assume:
     * Departure from home: 10:00 AM on first travel day
     * Arrival home: 8:00 PM on last travel day  
     * Departure from tasked location: after lunch timing on last day
   - Calculate meal entitlements based on these travel hours according to regulations

Provide a breakdown showing each component and the total dollar amount.

Here is the ONLY source material you can reference:
${instructions}

Question: ${message}


Please provide a response in this EXACT format:

Reference: <provide the section or chapter reference from the source>
Quote: <provide the exact quote that contains the answer>
${isSimplified ?
  'Answer: <provide a concise answer in no more than two sentences>' :
  'Answer: <provide a succinct one-sentence reply>\nReason: <provide a comprehensive explanation and justification drawing upon the source material>'}`;
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
 * Call consolidated Gemini API endpoint
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to show simplified response
 * @param {string} model - The model to use
 * @param {string} instructions - Context for the AI
 * @param {boolean} enableRetry - Whether to enable retry logic
 * @returns {Promise<Object>} Response with text and sources
 */
export const callGeminiAPI = async (
  message, 
  isSimplified, 
  model, 
  instructions,
  enableRetry = true
) => {
  const promptText = createPrompt(message, isSimplified, instructions);
  const modelName = "gemini-2.5-flash-preview-05-20";
  const requestBody = {
    model: modelName,
    prompt: promptText,
    generationConfig: getGenerationConfig()
  };
  
  // Use consolidated API endpoint
  const url = '/api/gemini/generateContent';
  const headers = {
    "Content-Type": "application/json"
  };

  let retries = 0;
  
  while (true) {
    try {
      console.log('[DEBUG] Sending request to consolidated Gemini API:', {
        url,
        method: "POST"
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
        return parseApiResponse(text, isSimplified);
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
      
      console.error('Consolidated API error:', error);
      throw handleApiError(error);
    }
  }
};

// Backward compatibility aliases
export const callGeminiViaProxy = callGeminiAPI;
export const callGeminiViaSDK = callGeminiAPI;

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
  model = 'gemini-2.5-flash-preview-05-20',
  preloadedInstructions = null,
  useFallback = false
) => {
  try {
    // Ensure we have travel instructions
    if (!preloadedInstructions) {
      throw new Error('Travel instructions not loaded');
    }

    // Use consolidated API method for both development and production
    // This simplifies our code and ensures consistent behavior
    try {
      return await callGeminiAPI(message, isSimplified, model, preloadedInstructions, true);
    } catch (error) {
      console.error('Gemini API Error via consolidated server:', error);
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
      const chatError = new ChatError(ChatErrorType.SERVICE, {
        message: 'The service is temporarily unavailable.',
        originalError: error
      });
      throw chatError;
    }
    
    throw error;
  }
};
