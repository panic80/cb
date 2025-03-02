import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defaultTravelInstructions } from './travelData.js';
const app = express();

// Parse JSON request bodies with increased limit
app.use(express.json({ limit: '10mb' }));

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
  const $ = cheerio.load(html);
  // Remove unwanted elements such as scripts, styles, headers, footers, and navigation
  $('script, style, header, footer, nav').remove();
  const text = $('body').text();
  // Clean and format content while preserving newlines
  return text
    .replace(/\s+/g, ' ')
    .replace(/(\d+\.\d+\.\d+)/g, '\n$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([.!?])\s+/g, '$1\n')
    .trim();
};

const PORT = process.env.PORT || 3001;

// Sophisticated in-memory cache with TTL and automatic cleanup
const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour in milliseconds
const CLEANUP_INTERVAL = 300000; // 5 minutes in milliseconds
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 seconds in milliseconds

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
    
    // Get API key from header or query param (preferring header for security)
    const apiKey = req.headers['x-api-key'] || req.query.key;
    
    // Validate API key
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    if (!validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Invalid API key format' });
    }

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

    res.json({
      candidates: [{
        content: {
          parts: [{
            text: response.text()
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
    
    // In production, don't expose internal error details
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: 'Gemini API Error',
      message: isProduction ? 'An error occurred while processing your request.' : error.message,
      ...(isProduction ? {} : { stack: error.stack })
    });
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

    while (retryCount < MAX_RETRIES) {
      try {
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
        break;
      } catch (error) {
        retryCount++;
        console.log(`Retry attempt ${retryCount} after error:`, error.message);
        
        if (retryCount === MAX_RETRIES) {
          console.error(`All ${MAX_RETRIES} retry attempts failed`);
          throw error;
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
    
    const content = processContent(response.data);
    if (!content || content.trim().length < 100) {
      console.error('Processed content too short or empty:', content);
      throw new Error('Processed content validation failed');
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
