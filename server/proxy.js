import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loggingMiddleware } from './middleware/logging.js';
import chatLogger from './services/logger.js';
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

// Helper function to decode URL encoded values in both GET and POST requests
const decodeUrlParams = (params) => {
  if (!params || typeof params !== 'object') return params;
  
  const result = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === 'string' ? decodeURIComponent(item.replace(/\+/g, ' ')) : item
      );
    } else if (typeof value === 'string') {
      result[key] = decodeURIComponent(value.replace(/\+/g, ' '));
    } else if (typeof value === 'object' && value !== null) {
      result[key] = decodeUrlParams(value); // Handle nested objects
    } else {
      result[key] = value;
    }
  }
  return result;
};

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
      // Format section numbers
      .replace(/(\d+\.\d+\.?\d*)(\s+)/g, '\n$1$2')
      // Make sure section headings are on their own lines
      .replace(/(SECTION|Chapter|CHAPTER|Part|PART)\s+(\d+)/gi, '\n$1 $2')
      // Fix camelCase to space separated
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Preserve meal timing windows
      .replace(/([Ll]unch).+?(\d{1,2}[:\.]\d{2}).+?(\d{1,2}[:\.]\d{2})/g, (match, meal, start, end) => {
        return `${meal} may be claimed when duty travel extends through the period of ${start} to ${end}`;
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

/* Error handling middleware */
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    stack: err.stack
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

// Request rate limiting middleware
const rateLimiter = (req, res, next) => {
  // Get client identifier (IP or a custom header if provided)
  const clientId = req.headers['x-client-id'] || req.ip;
  
  // Get current count for this client
  const currentCount = apiRequestCounts.get(clientId) || 0;
  
  // If over limit, return 429
  if (currentCount >= RATE_LIMIT) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'You have exceeded the API rate limit. Please try again later.',
      retryAfter: Math.floor(RATE_WINDOW / 1000) // Suggest retry after window duration
    });
  }
  
  // Increment counter
  apiRequestCounts.set(clientId, currentCount + 1);
  
  next();
};

// Proxy endpoint for Gemini API requests
app.post('/api/gemini/generateContent', rateLimiter, async (req, res) => {
  try {
    console.log('Received Gemini API request');
    
    // Get API key from environment variable
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    console.log('[DEBUG] API Key Check:', {
      present: !!apiKey,
      length: apiKey?.length || 0,
      startsWithAIza: apiKey?.startsWith('AIza') || false
    });
    
    // Validate API key
    if (!apiKey) {
      console.error('[DEBUG] No API key found in environment variables');
      return res.status(500).json({ error: 'API key not found in environment variables' });
    }
    
    if (!validateApiKey(apiKey)) {
      console.error('[DEBUG] Invalid API key format:', {
        length: apiKey.length,
        startsWithAIza: apiKey.startsWith('AIza')
      });
      return res.status(500).json({ error: 'Invalid API key format in environment variables' });
    }
    
    console.log('[DEBUG] API key validation passed');

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Extract model name from request or use default
    const modelName = req.body.model || "gemini-2.0-flash";
    console.log(`Using model: ${modelName}`);
    
    const generationConfig = req.body.generationConfig || {
      temperature: 0.1,
      topP: 0.1,
      topK: 1,
      maxOutputTokens: 2048
    };
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: generationConfig
    });

    // Handle different request formats
    let result;
    if (req.body.contents) {
      console.log('Using contents array format');
      result = await model.generateContent(req.body.contents);
    } else if (req.body.prompt) {
      console.log('Using prompt format');
      result = await model.generateContent(req.body.prompt);
    } else {
      return res.status(400).json({ error: 'Invalid request format. Missing contents or prompt.' });
    }
    
    const response = await result.response;
    console.log('Gemini API response received successfully');

    const responseText = await response.text();
    
    // Process question and answer
    const promptLines = req.body.prompt.split('\n');
    const responseLines = responseText.split('\n');
    
    const questionIndex = promptLines.findIndex(line => line.toLowerCase().startsWith('question:'));
    const answerIndex = responseLines.findIndex(line => line.startsWith('Answer:'));
    
    const cleanedPrompt = questionIndex >= 0 ?
      promptLines[questionIndex].replace(/^question:\s*/i, '').trim() :
      promptLines[promptLines.length - 1].trim();
    
    const cleanedResponse = answerIndex >= 0 ?
      responseLines[answerIndex].replace(/^Answer:\s*/, '').trim() :
      responseText;
    
    console.log('Logging chat:', { // Debug log
      timestamp: new Date().toISOString(),
      question: cleanedPrompt,
      answer: cleanedResponse
    });
    
    chatLogger.logChat(null, { // Use logChat method with null for req
      timestamp: new Date().toISOString(),
      question: cleanedPrompt,
      answer: cleanedResponse
    });
    console.log('Logged chat data'); // Debug log
    
    res.json({
      candidates: [{
        content: {
          parts: [{
            text: responseText
          }]
        }
      }]
    });
  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Check for specific error types and return appropriate status codes
    if (error.message.includes('Resource exhausted') || error.message.includes('quota')) {
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: 'The AI service rate limit has been exceeded. Please try again later.',
        retryAfter: 60 // Suggest retry after 1 minute
      });
    }
    
    if (error.message.includes('authentication') || error.message.includes('key')) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: 'Failed to authenticate with the AI service. Please check your API key.'
      });
    }
    
    if (error.message.includes('not found') || error.message.includes('model')) {
      return res.status(404).json({
        error: 'Model Not Found',
        message: 'The requested AI model was not found or is not available.'
      });
    }
    
    res.status(500).json({
      error: 'Gemini API Error',
      message: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint for URL parsing validation (supports both GET and POST)
app.all('/api/test-url-encoding', (req, res) => {
  try {
    // Process and properly decode URL-encoded body values
    const decodedBody = {};
    for (const [key, value] of Object.entries(req.body)) {
      // Handle both string and array values
      if (Array.isArray(value)) {
        decodedBody[key] = value.map(item =>
          typeof item === 'string' ? decodeURIComponent(item.replace(/\+/g, ' ')) : item
        );
      } else if (typeof value === 'string') {
        decodedBody[key] = decodeURIComponent(value.replace(/\+/g, ' '));
      } else {
        decodedBody[key] = value;
      }
    }

    // Process and properly decode query parameters
    const decodedQuery = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        decodedQuery[key] = value.map(item =>
          typeof item === 'string' ? decodeURIComponent(item) : item
        );
      } else if (typeof value === 'string') {
        decodedQuery[key] = decodeURIComponent(value);
      } else {
        decodedQuery[key] = value;
      }
    }

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
app.get('/api/travel-instructions', rateLimiter, async (req, res) => {
  try {
    // Add request validation
    const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
    if (!acceptsJson) {
      console.warn('Client requested non-JSON response type:', req.headers.accept);
      // Continue anyway but log the warning
    }
    
    // Check cache with detailed logging
    const cachedData = cache.get('travel-instructions');
    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) {
      console.log('Serving fresh cached data, age:', Date.now() - cachedData.timestamp, 'ms');
      
      // Set appropriate headers
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('ETag', cachedData.etag || `W/"${Date.now().toString(36)}"`);
      if (cachedData.lastModified) {
        res.setHeader('Last-Modified', cachedData.lastModified);
      }
      
      return res.json({ 
        content: cachedData.content, 
        cached: true,
        timestamp: new Date(cachedData.timestamp).toISOString()
      });
    }

    console.log('Initiating fresh data fetch from source');
    let response;
    let retryCount = 0;
    const startTime = Date.now();

    // For debugging purposes
    console.log(`Attempting to fetch travel instructions from Canada.ca website`);
    console.log(`Current environment: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`Current retry count limits: ${MAX_RETRIES}`);
    
    // Try to fetch from the official source first
    while (retryCount < MAX_RETRIES) {
      try {
        console.log(`Fetch attempt ${retryCount + 1}/${MAX_RETRIES} to Canada.ca`);
        response = await axios.get(
          'https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html',
          {
            headers: {
              'Accept-Encoding': 'gzip, deflate, br',
              'User-Agent': 'Mozilla/5.0 (compatible; TravelInstructionsBot/1.0)',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache'
            },
            timeout: REQUEST_TIMEOUT
          }
        );
        
        console.log(`Fetch succeeded after ${retryCount} retries, took ${Date.now() - startTime}ms`);
        console.log(`Response status: ${response.status}, content length: ${response.data?.length || 'unknown'}`);
        break;
      } catch (error) {
        retryCount++;
        console.log(`Retry attempt ${retryCount} after error:`, error.message);
        
        // Log detailed error information for debugging
        console.error(`Detailed fetch error:`, {
          message: error.message,
          code: error.code,
          isAxiosError: error.isAxiosError,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data?.substring?.(0, 200) || 'No data'
        });
        
        if (retryCount === MAX_RETRIES) {
          console.error(`All ${MAX_RETRIES} retry attempts failed`);
          
          console.error('All retry attempts to official Canada.ca source failed');
          // Don't use default content, let the error propagate
          throw new Error('Failed to retrieve travel instructions from Canada.ca after multiple attempts');
        }
        
        // Exponential backoff with jitter
        const delay = 1000 * Math.pow(2, retryCount - 1) * (0.5 + Math.random() * 0.5);
        console.log(`Waiting ${Math.round(delay)}ms before retry ${retryCount}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Validate response
    if (!response || !response.data) {
      throw new Error('Empty response received from source');
    }
    
    console.log('Processing HTML content...');
    const dataLength = response?.data?.length || 0;
    console.log(`Raw response data length: ${dataLength} bytes`);
    
    // Take a sample of the HTML for debugging
    if (typeof response.data === 'string') {
      const sample = response.data.substring(0, 300);
      console.log(`HTML sample: ${sample.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}`);
    }
    
    const content = processContent(response.data);
    console.log(`Processed content length: ${content?.length || 0} bytes`);
    
    // Log the first 500 characters of processed content for debugging
    if (content) {
      const contentSample = content.substring(0, 500);
      console.log(`Processed content sample: ${contentSample.replace(/\n/g, '\\n')}`);
    }
    
    if (!content || content.trim().length < 100) {
      console.error('Processed content too short or empty:', content);
      
      // Create a more detailed failure record
      const contentInfo = {
        contentLength: content?.length || 0,
        contentEmpty: !content,
        firstChars: content?.substring(0, 50) || 'N/A',
        responseStatus: response?.status,
        responseType: response?.headers?.['content-type'] || 'unknown'
      };
      console.error('Content validation failed with details:', contentInfo);
      
      // Don't use default content, throw an error
      throw new Error('Processed content validation failed - insufficient content length');
    }
    
    console.log('Content processed successfully, length:', content.length);

    // Generate unique ETag
    const etag = response.headers.etag || `W/"${Date.now().toString(36)}"`;
    
    // Update cache with comprehensive metadata
    cache.set('travel-instructions', {
      content,
      timestamp: Date.now(),
      lastModified: response.headers['last-modified'],
      etag,
      source: 'canada.ca',
      fetchTime: Date.now() - startTime
    });

    // Set appropriate cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', etag);
    if (response.headers['last-modified']) {
      res.setHeader('Last-Modified', response.headers['last-modified']);
    }

    res.json({ 
      content, 
      fresh: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Proxy error:', error.message, '\nStack:', error.stack);

    // Log detailed error information
    const errorDetail = {
      message: error.message,
      code: error.code,
      isAxiosError: error.isAxiosError,
      status: error.response?.status,
      endpoint: '/api/travel-instructions',
      timestamp: new Date().toISOString()
    };
    console.error('Structured error log:', JSON.stringify(errorDetail));

    // Sophisticated fallback strategy
    const cachedData = cache.get('travel-instructions');
    if (cachedData) {
      console.log('Serving stale cache due to error, cache age:', Date.now() - cachedData.timestamp, 'ms');
      
      // Set headers indicating stale content
      res.setHeader('Cache-Control', 'max-age=0, must-revalidate');
      if (cachedData.etag) {
        res.setHeader('ETag', `W/"${cachedData.etag}-stale"`);
      }
      
      return res.json({
        content: cachedData.content,
        stale: true,
        cacheAge: Date.now() - cachedData.timestamp,
        timestamp: new Date(cachedData.timestamp).toISOString()
      });
    }

    // Finally, if all else fails, return error
    // Use appropriate status code based on the error
    let statusCode = 500;
    let retryAfter = 60;
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
      statusCode = 503; // Service Unavailable
      retryAfter = 300; // 5 minutes
    } else if (error.response?.status === 429) {
      statusCode = 429; // Too Many Requests
      retryAfter = 600; // 10 minutes
    } else if (error.response?.status === 404) {
      statusCode = 404; // Not Found
    }
    
    // In production, don't expose detailed error info
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(statusCode).json({
      error: 'Failed to fetch travel instructions',
      message: isProduction ? 'Unable to retrieve travel information at this time.' : error.message,
      retryAfter,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced health check endpoint with detailed system stats
app.get('/health', (req, res) => {
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
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  };
  
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
      aiChat: true,
      travelInstructions: true,
      rateLimit: RATE_LIMIT
    },
    models: {
      default: 'gemini-2.0-flash',
      available: ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
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

app.listen(PORT, () => {
 console.log(`Proxy server running on port ${PORT}`);
 console.log(`Health check available at http://localhost:${PORT}/health`);
 console.log('Environment:', process.env.NODE_ENV || 'production');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Perform any cleanup if needed
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Perform any cleanup if needed
});
