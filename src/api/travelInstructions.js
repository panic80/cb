import { formatText } from '../utils/chatUtils';
import { ChatError, ChatErrorType } from '../utils/chatErrors';

// Cache configuration
export const CACHE_CONFIG = {
  DB_NAME: 'travel-instructions-cache',
  STORE_NAME: 'instructions',
  CACHE_KEY: 'travel-data',
  CACHE_DURATION: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
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
      const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readonly');
      const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
      const request = store.get(CACHE_CONFIG.CACHE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const data = request.result;
        if (data && (Date.now() - data.timestamp < CACHE_CONFIG.CACHE_DURATION)) {
          resolve(data.content);
        } else {
          resolve(null);
        }
      };
    });
  } catch (error) {
    console.error('Error accessing cache:', error);
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
      const transaction = db.transaction(CACHE_CONFIG.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(CACHE_CONFIG.STORE_NAME);
      const request = store.put({
        content,
        timestamp: Date.now()
      }, CACHE_CONFIG.CACHE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Error updating cache:', error);
  }
};

/**
 * Fetch data from the API with retry logic
 * @param {string} apiUrl - The API URL to fetch from
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Response>} The fetch response
 */
export const fetchWithRetry = async (apiUrl, maxRetries = 3) => {
  let retries = maxRetries;
  let response;
  
  while (retries > 0) {
    try {
      response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) return response;
      
      // Handle 404 errors immediately without retry
      if (response.status === 404) {
        throw new ChatError(
          ChatErrorType.ENDPOINT_NOT_FOUND,
          { status: response.status, url: apiUrl }
        );
      }
      
      console.warn(`Retry attempt ${maxRetries - retries + 1}: Server responded with ${response.status}`);
      retries--;
      
      if (retries === 0) {
        if (response.status >= 500) {
          throw new ChatError(ChatErrorType.SERVICE, { status: response.status });
        } else {
          throw new ChatError(ChatErrorType.UNKNOWN, {
            status: response.status,
            message: `Server responded with ${response.status} after multiple attempts`
          });
        }
      }
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, maxRetries - retries)));
    } catch (error) {
      console.error(`Fetch error (attempt ${maxRetries - retries + 1}):`, error);
      retries--;
      
      if (retries === 0) {
        if (error instanceof ChatError) {
          throw error; // Pass through our custom error types
        }
        
        // Convert other errors to appropriate ChatError types
        if (error.name === 'TypeError' || error.message.includes('network')) {
          throw new ChatError(ChatErrorType.NETWORK, error);
        }
        
        throw new ChatError(ChatErrorType.UNKNOWN, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, maxRetries - retries)));
    }
  }
  
  throw new Error('Failed to fetch after maximum retries');
};

/**
 * Process API response with content type checking and fallbacks
 * @param {Response} response - The fetch response
 * @returns {Promise<string>} The processed instructions
 */
export const processApiResponse = async (response) => {
  // Clone the response before reading it to avoid "body stream already read" error
  const responseClone = response.clone();
  
  try {
    // Check content type to avoid trying to parse HTML as JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      
      if (data && data.content) {
        return formatText(data.content);
      } else {
        console.error('Invalid JSON response format:', data);
        return DEFAULT_INSTRUCTIONS;
      }
    } else {
      // Not JSON, read as text and log
      const textData = await response.text();
      console.error('Response is not JSON:', textData.substring(0, 200));
      return DEFAULT_INSTRUCTIONS;
    }
  } catch (error) {
    console.error('Failed to parse API response:', error);
    
    try {
      // Use the cloned response for text() if json() fails
      const textData = await responseClone.text();
      console.error('Response content:', textData.substring(0, 200));
      return DEFAULT_INSTRUCTIONS;
    } catch (textError) {
      console.error('Failed to read response as text:', textError);
      throw new Error(`Failed to process response: ${error.message}`);
    }
  }
};

// Memory cache for ultra-fast access during active sessions
let memoryCache = null;
let memoryCacheTimestamp = 0;
let isInitializing = false;
let initializationPromise = null;

/**
 * Main function to fetch travel instructions with better initialization handling
 * @returns {Promise<string>} The travel instructions
 */
export const fetchTravelInstructions = async () => {
  // If already initializing, wait for that to complete
  if (isInitializing) {
    return initializationPromise;
  }

  // Check memory cache first
  if (memoryCache && (Date.now() - memoryCacheTimestamp < CACHE_CONFIG.CACHE_DURATION)) {
    return memoryCache;
  }

  try {
    isInitializing = true;
    initializationPromise = (async () => {
      // Try IndexedDB cache first
      const cachedData = await getCachedData();
      if (cachedData) {
        memoryCache = cachedData;
        memoryCacheTimestamp = Date.now();
        return cachedData;
      }

      // Fetch from server
      console.log('Fetching fresh travel instructions...');
      const apiUrl = '/api/travel-instructions';
      console.log(`Using travel instructions API URL: ${apiUrl}`);
      
      try {
        const response = await fetchWithRetry(apiUrl);
        const instructions = await processApiResponse(response);
        
        // Update caches
        memoryCache = instructions;
        memoryCacheTimestamp = Date.now();
        await setCachedData(instructions);
        
        return instructions;
      } catch (error) {
        console.error('Error fetching from API:', error);
        
        // Add specific handling for endpoint not found
        if (error instanceof ChatError && error.type === ChatErrorType.ENDPOINT_NOT_FOUND) {
          console.warn('Travel instructions API endpoint not found. Ensure the server is running on port 3003');
        }
        
        // Log detailed error info for all chat errors
        if (error instanceof ChatError) {
          const { title, message, suggestion } = error.getErrorMessage();
          console.error(`${title}: ${message}\n${suggestion}`);
        }
        
        return DEFAULT_INSTRUCTIONS;
      }
    })();

    return await initializationPromise;
  } catch (error) {
    console.error('Error fetching travel instructions:', error);
    
    // First try to use memory cache
    if (memoryCache) {
      console.log('Using memory cache as fallback due to error');
      return memoryCache;
    }
    
    // If no memory cache, provide default instructions
    console.log('Using default travel instructions as fallback');
    return DEFAULT_INSTRUCTIONS;
  } finally {
    isInitializing = false;
    initializationPromise = null;
  }
};
