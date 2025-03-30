// src/api/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseApiResponse } from '../utils/chatUtils.js'; // Assuming this utility exists and works as mocked in tests

// Constants (potentially useful for retry logic, though not fully implemented here)
// const MAX_RETRIES = 3;
// const INITIAL_RETRY_DELAY = 1000; // ms

/**
 * Validates the format of a Gemini API key.
 * @param {string} apiKey - The API key to validate.
 * @returns {boolean} True if the key format is valid, false otherwise.
 */
export const validateApiKey = (apiKey) => {
  // Basic check: Starts with "AIza" and has a reasonable length (e.g., > 30 chars)
  // This is a basic client-side check; server-side validation is more robust.
  return typeof apiKey === "string" && apiKey.startsWith("AIza") && apiKey.length > 30;
};

/**
 * Creates the prompt string for the Gemini API call.
 * @param {string} question - The user's question.
 * @param {boolean} isSimplified - Whether to request a simplified response.
 * @param {string} instructions - Contextual instructions for the model.
 * @returns {string} The formatted prompt string.
 */
export const createPrompt = (question, isSimplified, instructions) => {
  const basePrompt = `
Context/Instructions:
${instructions}

User Question: ${question}

Required Output Format:
Reference: <list the source reference ID, e.g., Section 1.2>
Quote: <provide a direct quote from the source that supports the answer>
${
  isSimplified
    ? "Answer: <provide a concise answer in no more than two sentences>"
    : `Answer: <provide a detailed and comprehensive answer based ONLY on the provided context/instructions.>
Reason: <provide further explanation, elaboration, or supporting details based ONLY on the provided context/instructions>`
}
`;
  return basePrompt.trim();
};

/**
 * Gets the generation configuration for the Gemini API.
 * @returns {object} The generation configuration object.
 */
export const getGenerationConfig = () => {
  // Based on test values and common configurations
  return {
    temperature: 0.1,
    topK: 1,
    maxOutputTokens: 2048, // Default from docs, adjust as needed
  };
};

/**
 * Provides a standard fallback response object.
 * @param {boolean} isSimplified - Determines the detail level of the fallback text.
 * @returns {object} Fallback response object with text, sources, and fallback flag.
 */
export const getFallbackResponse = (isSimplified) => {
  const text = isSimplified
    ? "Sorry, I couldn't generate a response right now. Please try again later."
    : "I encountered an issue trying to generate a response. Please check the connection or API key and try again. If the problem persists, contact support.";
  return {
    text: text,
    sources: [], // No sources for a fallback
    fallback: true,
  };
};

// Helper to extract model name (e.g., "gemini-1.5-flash" from "models/gemini-1.5-flash-001")
const extractModelName = (modelString) => {
  if (!modelString) return "gemini-1.5-flash"; // Default model
  const parts = modelString.split('/');
  // Basic extraction, might need refinement based on actual model strings used
  return parts[parts.length - 1].replace(/-[0-9]+$/, '');
};

/**
 * Calls the Gemini API via the Google Generative AI SDK.
 * @param {string} question - The user's question.
 * @param {boolean} isSimplified - Whether to request a simplified response.
 * @param {string} model - The model name (e.g., "models/gemini-1.5-flash-001").
 * @param {string} instructions - Contextual instructions for the model.
 * @returns {Promise<object>} The parsed API response.
 * @throws {Error} If the API call fails or the response is invalid.
 */
export const callGeminiViaSDK = async (
  question,
  isSimplified,
  model,
  instructions
) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!validateApiKey(apiKey)) {
    throw new Error("Invalid or missing Gemini API Key for SDK call.");
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generationConfig = getGenerationConfig();
    const prompt = createPrompt(question, isSimplified, instructions);
    const generativeModel = genAI.getGenerativeModel({
      model: extractModelName(model), // Extract base model name
    });

    console.log("Calling Gemini SDK with model:", extractModelName(model));
    const result = await generativeModel.generateContent(prompt, generationConfig);
    const response = result.response; // Access the response property

    if (!response || typeof response.text !== 'function') {
       console.error("Invalid SDK response structure:", response);
       throw new Error("Invalid response format from Gemini SDK");
    }

    const text = response.text(); // Call the text() function to get the string
    if (!text) {
        console.warn("Empty text response from Gemini SDK");
        // Decide whether to throw or return empty structure - let's throw for now
        throw new Error("Empty response text from Gemini SDK");
    }
    console.log("Raw SDK response text:", text);


    return parseApiResponse(text, isSimplified);
  } catch (error) {
    console.error("Error calling Gemini via SDK:", error);
    // Re-throw a more generic error or handle specific error types
     if (error.message.includes('API key not valid')) {
        throw new Error("Gemini API key is not valid. Please check your configuration.");
     }
    throw new Error(`Gemini SDK request failed: ${error.message}`);
  }
};

/**
 * Calls the Gemini API via the backend proxy.
 * @param {string} question - The user's question.
 * @param {boolean} isSimplified - Whether to request a simplified response.
 * @param {string} model - The model name (e.g., "models/gemini-1.5-flash-001").
 * @param {string} instructions - Contextual instructions for the model.
 * @param {boolean} [secureMode=false] - If true, send API key via header (for production/server-side proxy). If false, send via query param (for local dev proxy).
 * @returns {Promise<object>} The parsed API response.
 * @throws {Error} If the API call fails or the response is invalid.
 */
export const callGeminiViaProxy = async (
  question,
  isSimplified,
  model,
  instructions,
  secureMode = false // Default to dev mode (key in URL)
) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!validateApiKey(apiKey)) {
    throw new Error("Invalid or missing Gemini API Key for Proxy call.");
  }

  const proxyUrl = "/api/gemini/generateContent";
  const generationConfig = getGenerationConfig();
  const prompt = createPrompt(question, isSimplified, instructions);

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      generationConfig,
      model: extractModelName(model), // Send base model name
    }),
  };

  let targetUrl = proxyUrl;
  if (secureMode) {
    // Production/Secure mode: Key in header
    requestOptions.headers["X-API-KEY"] = apiKey;
  } else {
    // Development mode: Key in query param (assuming proxy expects it)
    targetUrl = `${proxyUrl}?key=${encodeURIComponent(apiKey)}`;
  }

  // --- Retry Logic Placeholder ---
  // let attempt = 0;
  // while (attempt < MAX_RETRIES) {
  // try { ... fetch call ... break if successful ...}
  // catch (error) { ... handle specific retryable errors ... attempt++; await delay ...}
  // }
  // --- End Retry Logic Placeholder ---

  try {
    console.log(`Calling Gemini via Proxy (${secureMode ? 'Secure' : 'Dev'}): ${targetUrl}`);
    const response = await fetch(targetUrl, requestOptions);

    if (!response.ok) {
      // Handle specific HTTP errors
      if (response.status === 429) {
        console.warn("Rate limit exceeded calling Gemini proxy.");
        throw new Error("Rate limit exceeded. Please try again later.");
      }
       let errorBody = '';
        try {
            errorBody = await response.text(); // Try to get more details
        } catch (_e) { /* ignore */}
      console.error(`Proxy API Error: ${response.status} ${response.statusText}`, errorBody);
      throw new Error(
        `Failed to fetch from Gemini API via proxy: ${response.status} ${response.statusText}`
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error("Failed to parse JSON response from proxy:", error);
      throw new Error("Invalid JSON response from Gemini API via proxy");
    }

     // Validate response structure based on tests
     const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
     if (typeof text !== 'string') { // Check if text is a string (allows empty string)
       console.error("Invalid response structure from proxy:", data);
       throw new Error("Invalid response format from Gemini API via proxy");
     }
      if (!text) {
        console.warn("Empty text response from Gemini Proxy");
        // Decide whether to throw or return empty structure - let's throw for now
        throw new Error("Empty response text from Gemini Proxy");
    }
     console.log("Raw Proxy response text:", text);

    return parseApiResponse(text, isSimplified);
  } catch (error) {
    // Log fetch/network errors or re-throw specific errors from above
    console.error("Error calling Gemini via Proxy:", error.message);
     // Avoid re-wrapping errors we already threw with specific messages
     if (error.message.startsWith("Failed to fetch") ||
         error.message.startsWith("Invalid JSON") ||
         error.message.startsWith("Invalid response format") ||
         error.message.startsWith("Rate limit exceeded") ||
         error.message.startsWith("Empty response text")) {
         throw error;
     }
    // Throw a generic error for other unexpected issues
    throw new Error(`Gemini Proxy request failed: ${error.message}`);
  }
};

/**
 * Sends the question to the Gemini API, choosing the appropriate method (SDK or Proxy).
 * @param {string} question - The user's question.
 * @param {boolean} [isSimplified=false] - Whether to request a simplified response.
 * @param {string} [model="models/gemini-1.5-flash-001"] - The model name.
 * @param {string | null} instructions - Contextual instructions. MUST be provided.
 * @returns {Promise<object>} The parsed API response.
 * @throws {Error} If instructions are missing, API key is invalid, or the API call fails.
 */
export const sendToGemini = async (
  question,
  isSimplified = false,
  model = "models/gemini-2.0-flash-001", // Default model
  instructions = null
) => {
  console.log("sendToGemini: Called with", { question: !!question, isSimplified, model, instructions: !!instructions }); // Log whether inputs are present

  if (!instructions) {
    console.error("sendToGemini: ERROR - Instructions are missing.");
    throw new Error("Travel instructions not loaded"); // Match test error message
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const apiKeyValid = validateApiKey(apiKey);
  console.log("sendToGemini: API Key validation result:", apiKeyValid);
  if (!apiKeyValid) {
    console.error("sendToGemini: ERROR - Invalid or missing VITE_GEMINI_API_KEY.");
     // Use fallback here instead of throwing? Tests expect throw.
    throw new Error("Invalid or missing Gemini API Key.");
  }

  const isDevelopment = import.meta.env.DEV;

  try {
    if (isDevelopment) {
      // In development, try the proxy first (non-secure mode)
      console.log("Development mode: Trying Gemini via Proxy...");
      try {
        return await callGeminiViaProxy(
          question,
          isSimplified,
          model,
          instructions,
          false // secureMode = false for dev proxy
        );
      } catch (proxyError) {
        console.warn(
          `Proxy call failed: ${proxyError.message}. Falling back to SDK.`
        );
        // Fallback to SDK if proxy fails
        return await callGeminiViaSDK(
          question,
          isSimplified,
          model,
          instructions
        );
      }
    } else {
      // In production, use the SDK directly
      console.log("Production mode: Calling Gemini via SDK...");
      return await callGeminiViaSDK(
        question,
        isSimplified,
        model,
        instructions
      );
       // OR If a secure production proxy is preferred:
       // console.log("Production mode: Calling Gemini via Secure Proxy...");
       // return await callGeminiViaProxy(question, isSimplified, model, instructions, true);
    }
  } catch (error) {
    console.error(`sendToGemini failed after trying ${isDevelopment ? 'Proxy and SDK' : 'SDK'}:`, error);
    // Optional: Return fallback content on final failure? Tests don't explicitly cover this, they expect throws.
    // return getFallbackResponse(isSimplified);
    throw error; // Re-throw the error from the failed attempt(s)
  }
};

// Note: bubbleExtractor is not used directly in these functions based on tests,
// but parseApiResponse (from chatUtils) might use it internally.