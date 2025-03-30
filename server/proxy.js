import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url'; // Needed for main module check
import path from 'path';            // Needed for main module check
import { loggingMiddleware } from './middleware/logging.js';
// import chatLogger from './services/logger.js'; // Removed chat logger import
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();
const app = express();

// Parse JSON request bodies with increased limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 10000
}));

// Add logging middleware
app.use(loggingMiddleware);

// Enable CORS for production
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins in production
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Process content with enhanced formatting and semantic structure preservation
const processContent = (html) => {
  try {
    console.log('Starting HTML processing with cheerio...');
    
    // Load HTML with cheerio
    const $ = cheerio.load(html, {
      decodeEntities: true,
      xmlMode: false
    });
    
    console.log('Cheerio loaded HTML successfully');
    
    // Debug: Count elements before removal
    const scriptCount = $('script').length;
    const styleCount = $('style').length;
    const headerCount = $('header').length;
    const footerCount = $('footer').length;
    const navCount = $('nav').length;
    
    console.log(`Element counts before removal: scripts=${scriptCount}, styles=${styleCount}, headers=${headerCount}, footers=${footerCount}, navs=${navCount}`);
    
    // Remove unwanted elements such as scripts, styles, headers, footers, and navigation
    $('script, style, header, footer, nav').remove();
    
    // Focus on main content areas
    let mainContent = '';
    
    // Try different content selectors that might contain the main content
    const contentSelectors = [
      'main', 
      'article', 
      '.content',
      '#content',
      '.main-content',
      '.article-content',
      'div[role="main"]'
    ];
    
    for (const selector of contentSelectors) {
      if ($(selector).length > 0) {
        console.log(`Found content using selector: ${selector}`);
        mainContent = $(selector).text();
        break;
      }
    }
    
    // If we couldn't find content in common content areas, fall back to body
    if (!mainContent || mainContent.trim().length < 100) {
      console.log('Content selectors did not yield sufficient content, falling back to body');
      mainContent = $('body').text();
    }
    
    console.log(`Raw extracted text length: ${mainContent.length} characters`);
    
    // Clean and format content while preserving newlines, semantic structure, and timing details
    const processedText = mainContent
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Format section numbers (Temporarily commented out for debugging context issue)
      // .replace(/(\d+\.\d+\.?\d*)(\s+)/g, '\n$1$2')
      // Make sure section headings are on their own lines (Temporarily commented out)
      // .replace(/(SECTION|Chapter|CHAPTER|Part|PART)\s+(\d+)/gi, '\n$1 $2')
      // Fix camelCase to space separated (Temporarily commented out)
      // .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Preserve meal timing windows
       .replace(/([Ll]unch).+?(\d{1,2}[:\.]\d{2}).+?(\d{1,2}[:\.]\d{2})/g, (match, meal, start, end) => {
         return `\n${meal} may be claimed when duty travel extends through the period of ${start} to ${end}.\n`; // Add newlines for clarity
       })
      // Ensure sentence boundaries have newlines
       .replace(/([.!?])\s+/g, '$1\n')
      // Final trim
      .trim();
    
    console.log(`Processed text length: ${processedText.length} characters`);
    
    return processedText;
  } catch (error) {
    console.error('Error processing HTML content:', error);
    // Return a simplified version as fallback
    try {
      // Simple regex-based approach as fallback
      return html
        .replace(/<[^>]*>/g, ' ') // Strip HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/(\d+\.\d+\.?\d*)/g, '\n$1') // Format section numbers
        .trim();
    } catch (fallbackError) {
      console.error('Even fallback processing failed:', fallbackError);
      throw new Error('Content processing failed completely');
    }
  }
};

const PORT = process.env.PORT || 3001;

// Start the server and log the status
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('API Key present:', !!process.env.GEMINI_API_KEY);
});

// Sophisticated in-memory cache with TTL and automatic cleanup
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const CLEANUP_INTERVAL = 300000; // 5 minutes in milliseconds
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 seconds in milliseconds
const RETRY_DELAY = 1000; // 1 second in milliseconds

// Intelligent cache cleanup with logging and error handling
setInterval(() => {
  try {
    const now = Date.now();
    let cleanedEntries = 0;

    for (const [key, { timestamp }] of cache.entries()) {
      if (now - timestamp > CACHE_TTL) {
        cache.delete(key);
        cleanedEntries++;
      }
    }

    if (cleanedEntries > 0) {
      console.log(`Cache cleanup: removed ${cleanedEntries} expired entries`);
    }
  } catch (error) {
    console.error('Cache cleanup error:', error);
  }
}, CLEANUP_INTERVAL);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// API Key Validation
const validateApiKey = (apiKey) => {
  if (!apiKey) return false;
  
  // Google API keys typically start with 'AIza'
  if (!apiKey.startsWith('AIza')) return false;
  
  // Must be at least 20 characters
  return apiKey.length >= 20;
};

// Rate limiting setup
const apiRequestCounts = new Map();
const RATE_LIMIT = 60; // 60 requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Clear rate limit counters periodically
setInterval(() => {
  apiRequestCounts.clear();
}, RATE_WINDOW);

// Rate limiter removed for now. Add back if needed.

// --- Reusable Function for Travel Instructions ---

const TRAVEL_INSTRUCTIONS_URL = 'https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html';
const USER_AGENT = 'Mozilla/5.0 (compatible; TravelInstructionsBot/1.0)'; // Use a descriptive user agent

async function getTravelInstructionsContent() {
  const cacheKey = 'travel-instructions';
  const cachedData = cache.get(cacheKey);

  // Check fresh cache
  if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) {
    console.log('Using fresh cached travel instructions data, age:', Date.now() - cachedData.timestamp, 'ms');
    return cachedData.content;
  }

  console.log('Cache stale or missing, fetching fresh travel instructions from source');
  let response;
  let retryCount = 0;
  const startTime = Date.now();

  while (retryCount < MAX_RETRIES) {
    try {
      console.log(`Fetch attempt ${retryCount + 1}/${MAX_RETRIES} to ${TRAVEL_INSTRUCTIONS_URL}`);
      response = await axios.get(TRAVEL_INSTRUCTIONS_URL, {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache' // Ensure no intermediate caches interfere
        },
        timeout: REQUEST_TIMEOUT
      });

      console.log(`Fetch succeeded after ${retryCount} retries, took ${Date.now() - startTime}ms. Status: ${response.status}`);
      break; // Exit loop on success
    } catch (error) {
      retryCount++;
      console.error(`Fetch attempt ${retryCount} failed:`, error.message);

      if (retryCount === MAX_RETRIES) {
        console.error(`All ${MAX_RETRIES} retry attempts failed for ${TRAVEL_INSTRUCTIONS_URL}`);
        // If retries fail, try using stale cache before throwing error
        if (cachedData) {
           console.warn('Serving stale cached travel instructions due to fetch failure.');
           return cachedData.content;
        }
        // Log the final error before throwing - chatLogger removed
        // chatLogger.logError({
        //   timestamp: new Date().toISOString(),
        //   endpoint: '/api/chat or /api/travel-instructions', // Called from either
        //   errorType: 'FETCH_FAILURE',
        //   message: `Failed to fetch ${TRAVEL_INSTRUCTIONS_URL} after ${MAX_RETRIES} attempts: ${error.message}`,
        //   details: { code: error.code, status: error.response?.status }
        // });
        throw new Error(`Failed to retrieve travel instructions after ${MAX_RETRIES} attempts.`);
      }

      // Exponential backoff with jitter
      const delay = RETRY_DELAY * Math.pow(2, retryCount - 1) * (0.75 + Math.random() * 0.5);
      console.log(`Waiting ${Math.round(delay)}ms before retry ${retryCount}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Validate response
  if (!response || response.status !== 200 || !response.data) {
     // Should have been caught by axios error handling, but as a safeguard
     if (cachedData) {
        console.warn(`Invalid response received (Status: ${response?.status}), serving stale cache.`);
        return cachedData.content;
     }
     throw new Error(`Invalid or empty response received from ${TRAVEL_INSTRUCTIONS_URL} (Status: ${response?.status})`);
  }

  // Process content
  console.log('Processing HTML content for travel instructions...');
  const content = processContent(response.data);
  console.log(`Processed travel instructions content length: ${content?.length || 0} bytes`);

  if (!content || content.trim().length < 100) {
      console.error('Processed travel instructions content validation failed (too short).');
       if (cachedData) {
          console.warn('Serving stale cached travel instructions due to processing failure.');
          return cachedData.content;
       }
      throw new Error('Processed content validation failed - insufficient content length.');
  }

  // Update cache
  console.log('Updating cache with fresh travel instructions.');
  cache.set(cacheKey, {
    content,
    timestamp: Date.now(),
    // Add other metadata if needed (e.g., ETag, Last-Modified from headers)
    fetchTime: Date.now() - startTime
  });

  return content;
}

// --- API Endpoints ---
// Proxy endpoint for Gemini API requests
// Modified /api/chat endpoint

// Test endpoint for URL parsing validation (supports both GET and POST)
app.all('/api/test-url-encoding', (req, res) => {
  try {
    // The body and query are already decoded by Express middleware
    // Return them directly for comparison purposes
    const decodedBody = req.body;
    const decodedQuery = req.query;

    // Return both raw and decoded components for comparison
    res.json({
      // Raw values as parsed by Express
      body: req.body,
      query: req.query,
      // Properly decoded values
      decodedBody,
      decodedQuery,
      // URL components
      originalUrl: decodeURIComponent(req.originalUrl),
      fullUrl: `${req.protocol}://${req.get('host')}${decodeURIComponent(req.originalUrl)}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Decoding failed', message: error.message });
  }
});

// Proxy endpoint for travel instructions with comprehensive error handling and retry logic
// /api/travel-instructions endpoint now uses the reusable function
app.get('/api/travel-instructions', async (req, res) => {
  try {
    const content = await getTravelInstructionsContent();
    res.setHeader('Cache-Control', 'public, max-age=' + CACHE_TTL / 1000); // Use cache TTL
    res.json({
      content,
      source: 'canada.ca', // Indicate source
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error serving /api/travel-instructions:', error.message);
    res.status(503).json({ // Service Unavailable seems appropriate
      error: 'Service Unavailable',
      message: 'Failed to retrieve or process travel instructions at this time.',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced health check endpoint with detailed system stats
app.get('/health', async (req, res) => {
  // Get cache stats
  const travelInstructionsCache = cache.get('travel-instructions');
  const cacheAge = travelInstructionsCache 
    ? Math.floor((Date.now() - travelInstructionsCache.timestamp) / 1000) + 's'
    : 'not cached';
  
  // Basic memory usage information
  const memoryUsage = process.memoryUsage();
  const formatMemory = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
    
  // Format uptime
  const uptime = process.uptime();
  let uptimeStr;
  if (uptime < 60) {
    uptimeStr = `${Math.floor(uptime)}s`;
  } else if (uptime < 3600) {
    uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;
  } else {
    uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
  }
  
  // Rate limiting stats
  const activeClients = apiRequestCounts.size;
  const clientsAtLimit = Array.from(apiRequestCounts.entries())
    .filter(([_, count]) => count >= RATE_LIMIT).length;
  
  // For detailed health checks, add API connectivity test
  const isAdmin = req.query.admin === 'true';
  const testApi = req.query.test === 'true';
  
  // Check chat API connectivity if requested
  // chatApiStatus removed as the feature is disabled
  
  // Get error statistics if admin
  let errorStats = null;
  if (isAdmin) {
    try {
      // errorStats = await chatLogger.getErrorStats('24h'); // chatLogger removed
      errorStats = { status: 'logging_disabled' }; // Indicate logger is removed
    } catch (error) {
      console.error('Error getting error statistics:', error);
      errorStats = { error: 'Failed to retrieve error statistics' };
    }
  }
  
  const healthData = {
    status: 'healthy',
    version: '1.0.0',
    uptime: uptimeStr,
    memory: {
      rss: formatMemory(memoryUsage.rss),
      heapTotal: formatMemory(memoryUsage.heapTotal),
      heapUsed: formatMemory(memoryUsage.heapUsed)
    },
    cache: {
      entries: cache.size,
      travelInstructions: {
        cached: !!travelInstructionsCache,
        age: cacheAge,
        size: travelInstructionsCache 
          ? `${Math.round(travelInstructionsCache.content.length / 1024)} KB` 
          : '0'
      }
    },
    rateLimiting: {
      activeClients,
      clientsAtLimit,
      limit: RATE_LIMIT,
      window: `${RATE_WINDOW / 1000}s`
    },
    // chatApi: { status: 'disabled' }, // Feature disabled
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  };
  
  // Add error stats if admin
  if (isAdmin && errorStats) {
    healthData.errors = errorStats;
  }
  
  // Only show detailed system info for admin requests
  if (!isAdmin) {
    delete healthData.memory;
    delete healthData.rateLimiting;
  }
  
  res.json(healthData);
});

// API configuration endpoint with environment-specific settings
app.get('/api/config', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Safe configuration that doesn't expose sensitive info
  const config = {
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    features: {
      aiChat: false, // Disabled chat feature flag
      travelInstructions: true,
      rateLimit: RATE_LIMIT
    },
    models: {
      default: 'gemini-2.0-flash-lite',
      available: ['gemini-2.0-flash-lite']
    },
    caching: {
      enabled: true,
      duration: Math.floor(CACHE_TTL / 1000 / 60) + ' minutes'
    },
    // Public-facing URLs and endpoints
    api: {
      base: '/api',
      travelInstructions: '/api/travel-instructions',
      gemini: '/api/gemini/generateContent',
      health: '/health'
    },
    // Client-side configuration
    client: {
      retryEnabled: true,
      maxRetries: 2,
      retryDelay: RETRY_DELAY
    },
    timestamp: new Date().toISOString()
  };
  
  // Return the safe config
  res.json(config);
});

// Enhanced 404 error handler with helpful suggestions
app.use((req, res) => {
  const requestedUrl = req.url;
  let suggestions = [];
  
  // Check if URL might be close to a valid endpoint and suggest alternatives
  if (requestedUrl.includes('gemini') || requestedUrl.includes('chat')) {
    suggestions.push('/api/gemini/generateContent');
  }
  
  if (requestedUrl.includes('travel') || requestedUrl.includes('instructions')) {
    suggestions.push('/api/travel-instructions');
  }
  
  if (requestedUrl.includes('health') || requestedUrl.includes('status')) {
    suggestions.push('/health');
  }
  
  if (requestedUrl.includes('config') || requestedUrl.includes('settings')) {
    suggestions.push('/api/config');
  }
  
  const response = {
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    timestamp: new Date().toISOString()
  };
  
  // Add suggestions if available
  if (suggestions.length > 0) {
    response.suggestions = suggestions;
    response.message += `. Available endpoints that might help: ${suggestions.join(', ')}`;
  } else {
    // Generic suggestion
    response.message += '. Try /api/config for available endpoints.';
  }
  
  res.status(404).json(response);
});

// The server startup logic remains the same, just ensure it's at the very end after all route definitions.
// The previous apply_diff block moved this logic after the endpoint definitions.

// Add critical error handlers only outside of test environment
if (process.env.NODE_ENV !== 'test') {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Perform any cleanup if needed
    // In a real app, consider more graceful shutdown steps
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging or cleanup here
  });
}
