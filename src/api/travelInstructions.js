// Removed imports from deleted chat utils
// import { ChatError, ChatErrorType } from "../utils/chatErrors";
// import { formatText } from "../utils/chatUtils";

// Cache configuration
export const CACHE_CONFIG = {
  DB_NAME: "travel-instructions-cache",
  STORE_NAME: "instructions",
  CACHE_KEY: "travel-data",
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

// Default fallback travel instructions
export const DEFAULT_INSTRUCTIONS = `
Canadian Forces Temporary Duty Travel Instructions

1. General Information
1.1 These instructions apply to all Canadian Forces members on temporary duty travel.
1.2 Travel arrangements should be made in the most economical manner possible.

2. Authorization
2.1 All temporary duty travel must be authorized in advance.
2.2 Travel claims must be submitted within 30 days of completion of travel.

3. Transportation
3.1 The most economical means of transportation should be used.
3.2 Use of private motor vehicle requires prior approval.

4. Accommodation
4.1 Government approved accommodations should be used when available.
4.2 Commercial accommodations require receipts for reimbursement.

5. Meals and Incidentals
5.1 Meal allowances are provided for duty travel.
5.2 Incidental expenses are covered as per current rates.
`;

/**
 * Initialize IndexedDB with robust error handling and version management
 * @returns {Promise<IDBDatabase>} A promise that resolves to the database
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_CONFIG.DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CACHE_CONFIG.STORE_NAME)) {
        db.createObjectStore(CACHE_CONFIG.STORE_NAME);
      }
    };
  });
};

/**
 * Get cached data from IndexedDB with timestamp validation
 * @returns {Promise<string|null>} The cached data or null if not found or expired
 */
export const getCachedData = async () => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, "readonly");
      const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
      const request = store.get(CACHE_CONFIG.CACHE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const data = request.result;
        if (data && Date.now() - data.timestamp < CACHE_CONFIG.CACHE_DURATION) {
          resolve(data.content);
        } else {
          resolve(null);
        }
      };
    });
  } catch (error) {
    console.error("Error accessing cache:", error);
    return null;
  }
};

/**
 * Store data in IndexedDB with comprehensive error handling
 * @param {string} content - The content to cache
 * @returns {Promise<void>}
 */
export const setCachedData = async (content) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
      const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
      const data = {
        content,
        timestamp: Date.now(),
      };
      
      const request = store.put(data, CACHE_CONFIG.CACHE_KEY);
      
      request.onerror = () => {
        console.error("[setCachedData] Error storing data:", request.error);
        reject(request.error);
      };
      
      transaction.oncomplete = () => {
        console.log("[setCachedData] Data stored successfully:", data);
        resolve(data);
      };
      
      transaction.onerror = () => {
        console.error("[setCachedData] Transaction error:", transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error("[setCachedData] Error:", error);
    throw error;  // Re-throw to ensure errors are not silently caught
  }
};

/**
 * Fetch data from the API with retry logic
 * @param {string} apiUrl - The API URL to fetch from
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Response>} The fetch response
 */
export const fetchWithRetry = async (apiUrl, maxRetries = 3) => {
  console.log(`[fetchWithRetry] Starting with maxRetries: ${maxRetries}`);
  let retries = maxRetries;
  let response;
  let attemptCount = 0;

  while (retries > 0) {
    attemptCount++;
    console.log(`[fetchWithRetry] Attempt ${attemptCount} of ${maxRetries}`);
    try {
      console.log(`[fetchWithRetry] Calling fetch for ${apiUrl}`);
      response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) return response;

      // Handle 404 errors immediately without retry
      if (response.status === 404) {
        throw new Error(`Endpoint not found: ${response.status} at ${apiUrl}`);
      }

      console.warn(
        `Retry attempt ${maxRetries - retries + 1}: Server responded with ${response.status}`
      );
      retries--;

      if (retries === 0) {
        if (response.status >= 500) {
          throw new Error(`Service error: Server responded with ${response.status}`);
        } else {
          throw new Error(`Unknown error: Server responded with ${response.status} after multiple attempts`);
        }
      }

      // Wait before retrying with exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, maxRetries - retries))
      );
    } catch (error) {
      console.error(
        `Fetch error (attempt ${maxRetries - retries + 1}):`,
        error
      );
      retries--;

      if (retries === 0) {
        // No longer need specific ChatError check
        // if (error instanceof ChatError) {
        //   throw error; // Pass through our custom error types
        // }

         // Convert other errors to standard Error
         if (error.name === "TypeError" || error.message.includes("network")) {
           // Throw a generic network error
           throw new Error(`Network error during fetch: ${error.message}`);
         }
         // Rethrow other errors as standard Error
         throw new Error(`Unknown fetch error: ${error.message || error}`);
       }

      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, maxRetries - retries))
      );
    }
  }

  throw new Error("Failed to fetch after maximum retries");
};

/**
 * Process API response with content type checking and fallbacks
 * @param {Response} response - The fetch response
 * @returns {Promise<string>} The processed instructions
 */
export const processApiResponse = async (response) => {
  // Clone the response before reading it to avoid "body stream already read" error
  const responseClone = response.clone();
  const contentType = response.headers.get("content-type");
  console.log(`[processApiResponse] Received content type: ${contentType}`);

  try {
    if (contentType && contentType.includes("application/json")) {
      console.log("[processApiResponse] Attempting to parse response as JSON...");
      const data = await response.json();
      console.log("[processApiResponse] Parsed JSON data:", data); // Log the entire parsed structure

      if (data && typeof data.content === 'string') {
        console.log("[processApiResponse] Found 'content' field. Length:", data.content.length);
        // console.log("[processApiResponse] Content before formatText:", data.content.substring(0, 500) + (data.content.length > 500 ? '...' : '')); // Log content before formatting
        // formatText removed, return raw content
        // const formattedContent = formatText(data.content);
        // console.log("[processApiResponse] Content after formatText:", formattedContent.substring(0, 500) + (formattedContent.length > 500 ? '...' : '')); // Log content after formatting
        return data.content;
      } else {
        console.error("[processApiResponse] Invalid JSON structure or missing 'content' string field. Data:", data);
        return DEFAULT_INSTRUCTIONS; // Fallback
      }
    } else {
      console.warn("[processApiResponse] Response content type is not application/json. Attempting to read as text.");
      const textData = await response.text();
      console.log("[processApiResponse] Response read as text (first 500 chars):", textData.substring(0, 500));
      // Decide if text response *could* be instructions or if it's an error page
      if (textData.toLowerCase().includes('</html>') || textData.length < 100) {
         console.error("[processApiResponse] Text response appears to be HTML or too short. Falling back.");
         return DEFAULT_INSTRUCTIONS; // Fallback if it looks like an error page or is too short
      } else {
         console.warn("[processApiResponse] Using raw text response as instructions (unexpected content type).");
         return textData; // formatText removed, return raw text
      }
    }
  } catch (error) {
    console.error("[processApiResponse] Error processing response:", error);

    try {
      // Log the raw text content if parsing failed
      const textData = await responseClone.text();
      console.error("[processApiResponse] Raw response text on error:", textData.substring(0, 500));
    } catch (textError) {
      console.error("[processApiResponse] Failed to even read response as text on error:", textError);
    }

    // Fallback after logging
    console.error("[processApiResponse] Falling back to DEFAULT_INSTRUCTIONS due to processing error.");
    return DEFAULT_INSTRUCTIONS;
  }
};

// Memory cache state
let _memoryCache = null;
let _memoryCacheTimestamp = 0;
let _isInitializing = false;
let _initializationPromise = null;

// Getters for testing
export const getMemoryCache = () => _memoryCache;
export const getMemoryCacheTimestamp = () => _memoryCacheTimestamp;
export const getIsInitializing = () => _isInitializing;
export const getInitializationPromise = () => _initializationPromise;

// Function to reset state (for testing)
export const resetState = () => {
  _memoryCache = null;
  _memoryCacheTimestamp = 0;
  _isInitializing = false;
  _initializationPromise = null;
  if (typeof global !== 'undefined') {
    global.memoryCache = null;
    global.memoryCacheTimestamp = 0;
  }
};

// Synchronize global and module cache states
export const setMemoryCache = (content) => {
  _memoryCache = content;
  _memoryCacheTimestamp = Date.now();
  if (typeof global !== 'undefined') {
    global.memoryCache = content;
    global.memoryCacheTimestamp = _memoryCacheTimestamp;
  }
};

export const clearMemoryCache = () => {
  _memoryCache = null;
  _memoryCacheTimestamp = 0;
  if (typeof global !== 'undefined') {
    global.memoryCache = null;
    global.memoryCacheTimestamp = 0;
  }
};

// Initialize promise reference
_initializationPromise = Promise.resolve();

/**
 * Main function to fetch travel instructions with better initialization handling
 * @returns {Promise<string>} The travel instructions
 */
export const fetchTravelInstructions = async () => {
  console.log("[fetchTravelInstructions] Starting fetch");
  
  // If already initializing, wait for that to complete
  if (_isInitializing) {
    console.log("[fetchTravelInstructions] Already initializing, waiting for completion");
    return _initializationPromise;
  }

  // Check memory cache first
  console.log("[fetchTravelInstructions] Checking memory cache state:", {
    hasCache: !!_memoryCache,
    timestamp: _memoryCacheTimestamp,
    age: Date.now() - _memoryCacheTimestamp,
    maxAge: CACHE_CONFIG.CACHE_DURATION
  });

  if (
    _memoryCache &&
    Date.now() - _memoryCacheTimestamp < CACHE_CONFIG.CACHE_DURATION
  ) {
    console.log("[fetchTravelInstructions] Using memory cache");
    return _memoryCache;
  }

  try {
    _isInitializing = true;
    // Create new promise and store reference
    const promise = (async () => {
      // Try IndexedDB cache first
      console.log("[fetchTravelInstructions] Checking IndexedDB cache");
      const cachedData = await getCachedData();
      if (cachedData) {
        console.log("[fetchTravelInstructions] Found valid IndexedDB cache");
        setMemoryCache(cachedData);
        return memoryCache;
      }
      console.log("[fetchTravelInstructions] No valid IndexedDB cache found");

      // Fetch from server
      console.log("Fetching fresh travel instructions...");
      const apiUrl = "/api/travel-instructions";
      console.log(`Using travel instructions API URL: ${apiUrl}`);

      try {
        const response = await fetchWithRetry(apiUrl);
        const instructions = await processApiResponse(response);

        // Update caches
        setMemoryCache(instructions);
        await setCachedData(instructions);
        console.log("[fetchTravelInstructions] Updated caches with new instructions");

        return instructions;
      } catch (error) {
        console.error("Error fetching from API:", error);

        // Add specific handling for endpoint not found
        // Removed specific ChatError checks
        // if (
        //   error instanceof ChatError &&
        //   error.type === ChatErrorType.ENDPOINT_NOT_FOUND
        // ) {
        //   console.warn(
        //     "Travel instructions API endpoint not found. Ensure the server is running on port 3003"
        //   );
        // }

        // Log standard error message
        console.error(`Error fetching/processing instructions: ${error.message}`);
        // if (error instanceof ChatError) {
        //   const { title, message, suggestion } = error.getErrorMessage();
        //   console.error(`${title}: ${message}\n${suggestion}`);
        // }

        return DEFAULT_INSTRUCTIONS;
      }
    })();

    // Store promise reference before awaiting
    _initializationPromise = promise;
    return await promise;
  } catch (error) {
    console.error("Error fetching travel instructions:", error);

    // First try to use memory cache
    if (_memoryCache) {
      console.log("[fetchTravelInstructions] Using memory cache as fallback due to error");
      return _memoryCache;
    }

    // If no memory cache, provide default instructions
    console.log("Using default travel instructions as fallback");
    return DEFAULT_INSTRUCTIONS;
  } finally {
    _isInitializing = false;
    _initializationPromise = null;
  }
};
