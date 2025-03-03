import { fetchTravelInstructions } from './travelInstructions';
import { parseApiResponse } from '../utils/chatUtils';

// Use environment variable for API key
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
  // Check for rate limiting errors
  if (error.message.includes('quota') || 
      error.message.includes('rate limit') ||
      error.message.includes('429')) {
    return new Error('Rate limit exceeded. Please try again later.');
  }
  
  // Network errors
  if (error.message.includes('Network') || 
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch')) {
    return new Error('Network error while calling Gemini API. Please check your connection.');
  }
  
  // Invalid JSON responses
  if (error instanceof SyntaxError || error.message.includes('JSON')) {
    return new Error('Invalid JSON response from Gemini API');
  }
  
  // Malformed API response
  if (error.message.includes('Invalid response format')) {
    return new Error('The API returned a response in an unexpected format');
  }
  
  // General API error with enhanced message
  if (error.message.includes('Gemini API Error')) {
    return error;
  }
  
  return new Error(`Gemini API Error: ${error.message}`);
};

/**
 * Call Gemini API through the proxy endpoint
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to show simplified response
 * @param {string} model - The model to use
 * @param {string} instructions - Context for the AI
 * @param {boolean} secureMode - Whether to use secure API key handling (defaults to true)
 * @param {boolean} enableRetry - Whether to enable retry logic
 * @returns {Promise<Object>} Response with text and sources
 */
export const callGeminiAPI = async (
  message,
  isSimplified,
  instructions,
  enableRetry = true
) => {
  // Validate API key
  if (!validateApiKey(API_KEY)) {
    throw new Error('API key is missing or invalid');
  }
  
  const promptText = createPrompt(message, isSimplified, instructions);
  const modelName = "gemini-2.0-flash";
  const requestBody = {
    model: modelName,
    prompt: promptText,
    generationConfig: getGenerationConfig()
  };
  
  let url = '/api/gemini/generateContent';
  let headers = {
    "Content-Type": "application/json",
    "X-API-KEY": API_KEY
  };

  let retries = 0;
  
  while (true) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });

      // Handle different error status codes
      if (!response.ok) {
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
        console.log('Gemini API Response (Proxy):', JSON.stringify(data, null, 2));

        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error('Invalid response format from Gemini API');
        }

        const text = data.candidates[0].content.parts[0].text;
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
      
      console.error('Proxy API error:', error);
      throw handleApiError(error);
    }
  }
};

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
 * Send message to Gemini API using the unified proxy endpoint
 * @param {string} message - User message
 * @param {boolean} isSimplified - Whether to show simplified response
 * @param {string} model - The model to use (defaults to gemini-2.0-flash)
 * @param {string} preloadedInstructions - Preloaded travel instructions
 * @param {boolean} useFallback - Whether to return fallback content on error
 * @returns {Promise<Object>} Response with text and sources
 *
 * This function uses a unified approach through our proxy endpoint for all environments,
 * providing consistent error handling, monitoring, and security across development and production.
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

    // Always use the proxy endpoint for consistent handling across environments
    return await callGeminiAPI(message, isSimplified, preloadedInstructions);

  } catch (error) {
    console.error('Gemini API Error:', {
      message: error.message,
      stack: error.stack
    });
    
    // Return fallback content if enabled, otherwise propagate the error
    if (useFallback) {
      console.log('Returning fallback response due to error');
      return getFallbackResponse(isSimplified);
    }
    
    throw new Error('Could not connect to Gemini API after multiple attempts');
  }
};
