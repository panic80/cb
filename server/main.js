import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, statSync } from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { loggingMiddleware } from './middleware/logging.js';
import chatLogger from './services/logger.js';
import CacheService from './services/cache.js';
import dotenv from 'dotenv';
import multer from 'multer';

// Load environment variables based on NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development';

// Load environment-specific .env file
dotenv.config({ path: `.env.${NODE_ENV}` });

// Fallback to .env if environment-specific file doesn't exist
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies with increased limit for large files
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '100mb',
  parameterLimit: 10000
}));

// Environment-based configuration
const config = {
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 10000, // 10 seconds
  retryDelay: parseInt(process.env.RETRY_DELAY) || 1000, // 1 second in milliseconds
  
  // Cache configuration
  cacheEnabled: process.env.ENABLE_CACHE === 'true',
  cacheTTL: parseInt(process.env.CACHE_TTL) || 3600000, // 1 hour in milliseconds
  cacheCleanupInterval: parseInt(process.env.CACHE_CLEANUP_INTERVAL) || 300000, // 5 minutes
  
  // Rate limiting configuration  
  rateLimitEnabled: process.env.ENABLE_RATE_LIMIT === 'true',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 60, // 60 requests per minute
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute in milliseconds
  
  // Logging configuration
  loggingEnabled: process.env.ENABLE_LOGGING === 'true',
  logLevel: process.env.LOG_LEVEL || 'debug',
  logDir: process.env.LOG_DIR || './logs',
  
  // External services
  canadaCaUrl: process.env.CANADA_CA_URL || 'https://www.canada.ca/en/department-national-defence/services/benefits-military/pay-pension-benefits/benefits/canadian-forces-temporary-duty-travel-instructions.html'
};

console.log('Server configuration:', {
  nodeEnv: NODE_ENV,
  port: PORT,
  cacheEnabled: config.cacheEnabled,
  rateLimitEnabled: config.rateLimitEnabled,
  loggingEnabled: config.loggingEnabled,
  logLevel: config.logLevel
});

// Initialize unified cache service with Redis and in-memory fallback
const cache = config.cacheEnabled ? new CacheService({
  redisUrl: process.env.REDIS_URL,
  redisEnabled: config.cacheEnabled,
  defaultTTL: config.cacheTTL,
  memoryCleanupInterval: config.cacheCleanupInterval,
  enableLogging: config.loggingEnabled
}) : null;

// Rate limiting setup (conditionally enabled)
const apiRequestCounts = config.rateLimitEnabled ? new Map() : null;

if (config.rateLimitEnabled) {
  // Clear rate limit counters periodically
  setInterval(() => {
    apiRequestCounts.clear();
  }, config.rateLimitWindow);
}

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
      .replace(/([Ll]unch).+?(\d{1,2}[:\.:]\d{2}).+?(\d{1,2}[:\.:]\d{2})/g, (match, meal, start, end) => {
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

// API Key Validation
const validateApiKey = (apiKey) => {
  if (!apiKey) return false;
  
  // Google API keys typically start with 'AIza'
  if (!apiKey.startsWith('AIza')) return false;
  
  // Must be at least 20 characters
  return apiKey.length >= 20;
};

// Request rate limiting middleware
const rateLimiter = (req, res, next) => {
  // Skip rate limiting if disabled
  if (!config.rateLimitEnabled || !apiRequestCounts) {
    return next();
  }
  
  // Get client identifier (IP or a custom header if provided)
  const clientId = req.headers['x-client-id'] || req.ip;
  
  // Get current count for this client
  const currentCount = apiRequestCounts.get(clientId) || 0;
  
  // If over limit, return 429
  if (currentCount >= config.rateLimitMax) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'You have exceeded the API rate limit. Please try again later.',
      retryAfter: Math.floor(config.rateLimitWindow / 1000) // Suggest retry after window duration
    });
  }
  
  // Increment counter
  apiRequestCounts.set(clientId, currentCount + 1);
  
  next();
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

// Add logging middleware
app.use(loggingMiddleware);

// Add response logging for chat endpoints
app.use('/api/chat', async (req, res, next) => {
  const originalJson = res.json;
  res.json = function(data) {
    if (req.body && req.body.message) {
      chatLogger.logChat(req, req.body.message, data.response || '');
    }
    return originalJson.apply(res, arguments);
  };
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// API routes - Direct implementation (no proxy)
const isDevelopment = process.env.NODE_ENV === 'development';
console.log(isDevelopment ? 'Development mode' : 'Production mode' + ': Using consolidated server architecture');

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

    const ai = new GoogleGenAI({
      apiKey: apiKey,
      apiVersion: "v1"
    });
    
    // Extract model name from request or use default
    const modelName = req.body.model || "gemini-2.5-flash-preview-05-20";
    console.log(`Using model: ${modelName}`);
    
    // Handle different request formats
    let contents;
    if (req.body.contents) {
      console.log('Using contents array format');
      contents = req.body.contents;
    } else if (req.body.prompt) {
      console.log('Using prompt format');
      contents = req.body.prompt;
    } else {
      return res.status(400).json({ error: 'Invalid request format. Missing contents or prompt.' });
    }
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
    });
    
    console.log('Gemini API response received successfully');

    const responseText = response.text;
    
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
    
    // In production, don't expose internal error details
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: 'Gemini API Error',
      message: isProduction ? 'An error occurred while processing your request.' : error.message,
      ...(isProduction ? {} : { stack: error.stack })
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
    
    // Check cache with detailed logging (skip if caching disabled)
    const cachedData = cache ? await cache.get('travel-instructions') : null;
    if (cachedData && cachedData.timestamp && (Date.now() - cachedData.timestamp < config.cacheTTL)) {
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
    console.log(`Current retry count limits: ${config.maxRetries}`);
    
    // Try to fetch from the official source first
    while (retryCount < config.maxRetries) {
      try {
        console.log(`Fetch attempt ${retryCount + 1}/${config.maxRetries} to Canada.ca`);
        response = await axios.get(
          config.canadaCaUrl,
          {
            headers: {
              'Accept-Encoding': 'gzip, deflate, br',
              'User-Agent': 'Mozilla/5.0 (compatible; TravelInstructionsBot/1.0)',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache'
            },
            timeout: config.requestTimeout
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
        
        if (retryCount === config.maxRetries) {
          console.error(`All ${config.maxRetries} retry attempts failed`);
          
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
    
    // Update cache with comprehensive metadata (if caching enabled)
    if (cache) {
      await cache.set('travel-instructions', {
        content,
        timestamp: Date.now(),
        lastModified: response.headers['last-modified'],
        etag,
        source: 'canada.ca',
        fetchTime: Date.now() - startTime
      });
    }

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
    const cachedData = cache ? await cache.get('travel-instructions') : null;
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
app.get('/health', async (req, res) => {
  // Get cache stats
  const cacheStats = cache ? cache.getStats() : null;
  const cacheHealth = cache ? cache.getHealth() : { status: 'disabled' };
  
  // Try to get travel instructions cache info
  const travelInstructionsCache = cache ? await cache.get('travel-instructions') : null;
  const cacheAge = travelInstructionsCache && travelInstructionsCache.timestamp
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
  const activeClients = apiRequestCounts ? apiRequestCounts.size : 0;
  const clientsAtLimit = apiRequestCounts ? Array.from(apiRequestCounts.entries())
    .filter(([_, count]) => count >= config.rateLimitMax).length : 0;
  
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
    cache: config.cacheEnabled ? {
      enabled: true,
      status: cacheHealth.status,
      redis: cacheHealth.redis,
      memory: cacheHealth.memory,
      performance: cacheHealth.performance,
      stats: cacheStats ? {
        totalHits: cacheStats.combined.totalHits,
        totalMisses: cacheStats.combined.totalMisses,
        hitRate: cacheStats.combined.hitRate
      } : null,
      travelInstructions: {
        cached: !!travelInstructionsCache,
        age: cacheAge,
        size: travelInstructionsCache && travelInstructionsCache.content
          ? `${Math.round(travelInstructionsCache.content.length / 1024)} KB` 
          : '0'
      }
    } : { enabled: false },
    rateLimiting: {
      enabled: config.rateLimitEnabled,
      activeClients,
      clientsAtLimit,
      limit: config.rateLimitMax,
      window: `${config.rateLimitWindow / 1000}s`
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
  const responseConfig = {
    version: '1.0.0',
    buildTime: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    features: {
      aiChat: true,
      travelInstructions: true,
      rateLimit: config.rateLimitMax
    },
    models: {
      default: 'gemini-2.0-flash',
      available: ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
    },
    caching: {
      enabled: config.cacheEnabled,
      duration: Math.floor(config.cacheTTL / 1000 / 60) + ' minutes'
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
      maxRetries: config.maxRetries,
      retryDelay: config.retryDelay
    },
    timestamp: new Date().toISOString()
  };
  
  // Return the safe config
  res.json(responseConfig);
});

// Deployment verification endpoint (for debugging cache issues)
app.get('/api/deployment-info', (req, res) => {
  const fs = require('fs');
  const buildInfo = {
    timestamp: new Date().toISOString(),
    buildTime: process.env.BUILD_TIMESTAMP,
    nodeEnv: process.env.NODE_ENV,
    processUptime: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    // Try to read package.json version
    version: '1.0.0'
  };

  // Try to get build info from dist directory
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      buildInfo.version = pkg.version;
    }
  } catch (err) {
    console.log('Could not read package.json:', err.message);
  }

  // Add cache-busting headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.json(buildInfo);
});

// Cache-busting endpoint for forcing client refresh
app.post('/api/clear-cache', (req, res) => {
  // This endpoint helps with cache busting by providing a new timestamp
  const cacheBreaker = Date.now();
  
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  res.json({
    message: 'Cache busting initiated',
    timestamp: new Date().toISOString(),
    cacheBreaker,
    buildTime: process.env.BUILD_TIMESTAMP,
    instructions: {
      manual: 'Press Ctrl+F5 (or Cmd+Shift+R on Mac) to force reload',
      programmatic: `Add ?v=${cacheBreaker} to URLs to bypass cache`
    }
  });
});

// Helper function to validate that follow-up questions are grounded in source content
const validateSourceGrounding = async (questions, sourceContent) => {
  if (!sourceContent || sourceContent.trim().length === 0) {
    // If no source content, only keep high-confidence questions
    return questions.filter(q => q.confidence >= 0.8);
  }

  const validatedQuestions = [];
  
  for (const question of questions) {
    try {
      // Simple validation: check if key terms from the question appear in source content
      const questionWords = question.question.toLowerCase()
        .replace(/[?.,!]/g, '')
        .split(' ')
        .filter(word => word.length > 3); // Filter out short words
      
      const sourceWords = sourceContent.toLowerCase();
      const matchingWords = questionWords.filter(word => sourceWords.includes(word));
      
      // Calculate grounding score based on word overlap
      const groundingScore = matchingWords.length / Math.max(questionWords.length, 1);
      
      // Only include questions with reasonable grounding (>30% word overlap or high confidence with grounding info)
      if (groundingScore > 0.3 || (question.confidence > 0.8 && question.sourceGrounding)) {
        validatedQuestions.push({
          ...question,
          groundingScore: groundingScore
        });
      } else {
        console.log(`Filtered out question due to poor grounding: "${question.question}" (score: ${groundingScore})`);
      }
    } catch (error) {
      console.error('Error validating question grounding:', error);
      // If validation fails, keep the question but mark it as uncertain
      validatedQuestions.push({
        ...question,
        confidence: Math.min(question.confidence, 0.6),
        groundingScore: 0
      });
    }
  }
  
  return validatedQuestions;
};

// Follow-up Questions endpoint - generates contextual follow-up questions
app.post('/api/v2/followup', rateLimiter, async (req, res) => {
  const { userQuestion, aiResponse, sources, conversationHistory } = req.body;

  // Validate input
  if (!userQuestion || !aiResponse) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'userQuestion and aiResponse are required.' 
    });
  }

  try {
    console.log('Generating follow-up questions for:', userQuestion.substring(0, 50) + '...');

    // Create a specialized prompt for follow-up question generation with strict source grounding
    const MAX_SOURCE_CONTENT_LENGTH = 2000; // Limit source content to prevent token overflow
    
    const sourceContentSnippets = sources && sources.length > 0 
      ? sources.map(s => {
          const content = s.text || '';
          const truncatedContent = content.length > MAX_SOURCE_CONTENT_LENGTH 
            ? content.substring(0, MAX_SOURCE_CONTENT_LENGTH) + '...'
            : content;
          return `Source: ${s.reference || 'Document'}\nContent: ${truncatedContent}`;
        }).join('\n\n')
      : '';

    const followUpPrompt = `You are a helpful assistant specialized in generating contextual follow-up questions that are STRICTLY GROUNDED in the provided source material. You must ONLY generate questions that can be answered using the exact content provided below.

CRITICAL CONSTRAINTS:
- ONLY create questions that can be answered from the provided source content
- DO NOT generate questions about topics not covered in the sources
- DO NOT create questions that would require external knowledge or speculation
- Each question must be answerable using specific text from the provided sources

USER'S ORIGINAL QUESTION: "${userQuestion}"

AI RESPONSE PROVIDED: "${aiResponse}"

AVAILABLE SOURCE CONTENT (this is the ONLY information you may reference):
${sourceContentSnippets || 'No source content available. Generate only general clarification questions about the provided response.'}

${conversationHistory && conversationHistory.length > 0 ? `CONVERSATION CONTEXT:\n${conversationHistory.slice(-4).map(h => `${h.role}: ${h.content.substring(0, 100)}...`).join('\n')}` : ''}

TASK: Generate 2-3 follow-up questions that are:
1. ANSWERABLE using only the provided source content above
2. Would help the user explore the available information more deeply
3. Lead to specific, factual responses (not speculation)

QUESTION TYPES TO PRIORITIZE:
- Clarification about specific details mentioned in the sources
- Questions about related topics explicitly covered in the provided content
- Practical applications mentioned in the source material
- Specific requirements, procedures, or examples found in the sources

AVOID:
- Questions about topics not in the source content
- Hypothetical scenarios not covered by sources
- Questions requiring external knowledge
- Generic questions not grounded in the specific content

Return ONLY this JSON format:
{
  "questions": [
    {
      "question": "Specific question answerable from source content",
      "category": "clarification|related|practical|explore",
      "confidence": 0.9,
      "sourceGrounding": "Brief indication of which source content supports this question"
    }
  ]
}

If the source content is insufficient to generate meaningful grounded questions, return an empty questions array.`;

    // Use the same model and provider as the main conversation
    const model = req.body.model || 'gpt-4';
    const provider = req.body.provider || 'openai';

    // Call the RAG service for question generation
    const ragServiceUrl = process.env.RAG_SERVICE_URL + '/chat';
    
    const response = await axios.post(ragServiceUrl, {
      message: followUpPrompt,
      model: model,
      provider: provider,
      stream: false
    }, {
      timeout: 15000, // 15 second timeout for follow-up generation
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const followUpText = response.data.response || '';
    
    // Parse the response to extract follow-up questions
    let followUpQuestions = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = followUpText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const questions = parsed.questions || [];
        
        followUpQuestions = questions.map((q, index) => ({
          id: `followup-${Date.now()}-${index}`,
          question: q.question || '',
          category: q.category || 'related',
          confidence: q.confidence || 0.7,
          sourceGrounding: q.sourceGrounding || null
        })).filter(q => q.question.trim().length > 0);
      }
    } catch (parseError) {
      console.log('Failed to parse JSON, trying text extraction');
      // Fallback: extract questions from plain text
      const lines = followUpText.split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.endsWith('?') && trimmed.length > 10) {
          const cleanQuestion = trimmed
            .replace(/^\d+\.\s*/, '')
            .replace(/^[-*]\s*/, '')
            .replace(/^Q:\s*/i, '')
            .trim();
          
          if (cleanQuestion.length > 10) {
            // Determine category based on question content
            let category = 'related';
            const questionLower = cleanQuestion.toLowerCase();
            
            if (questionLower.includes('how') || questionLower.includes('what steps') || questionLower.includes('process')) {
              category = 'practical';
            } else if (questionLower.includes('what') || questionLower.includes('explain') || questionLower.includes('clarify')) {
              category = 'clarification';
            } else if (questionLower.includes('more') || questionLower.includes('additional') || questionLower.includes('other')) {
              category = 'explore';
            }
            
            followUpQuestions.push({
              id: `followup-text-${Date.now()}-${index}`,
              question: cleanQuestion,
              category: category,
              confidence: 0.6,
              sourceGrounding: 'Extracted from AI response'
            });
          }
        }
      });
    }

    // Validate questions to ensure they are source-grounded
    const validatedQuestions = await validateSourceGrounding(followUpQuestions, sourceContentSnippets);
    
    // Limit to 3 questions and send response
    const finalQuestions = validatedQuestions.slice(0, 3);
    
    console.log(`Generated ${followUpQuestions.length} questions, validated ${finalQuestions.length} as source-grounded`);

    res.json({
      followUpQuestions: finalQuestions
    });

  } catch (error) {
    console.error('Error generating follow-up questions:', error.message);
    
    // Return empty array on error rather than failing the whole request
    res.json({
      followUpQuestions: []
    });
  }
});

// RAG Chat endpoint - proxies to Python RAG service
app.post('/api/v2/chat', rateLimiter, async (req, res) => {
  const { message, model, provider } = req.body;

  // Validate input message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Message must be a non-empty string.' 
    });
  }

  try {
    console.log('Proxying chat request to RAG service with model:', model, 'provider:', provider);
    // Validate required parameters
    if (!model) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Model parameter is required.' 
      });
    }
    
    if (!provider) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Provider parameter is required.' 
      });
    }
    
    console.log('Model:', model, 'Provider:', provider);
    
    // RAG Service URL (Python FastAPI service)
    if (!process.env.RAG_SERVICE_URL) {
      return res.status(500).json({ 
        error: 'Configuration Error', 
        message: 'RAG_SERVICE_URL environment variable is not configured.' 
      });
    }
    
    const ragServiceUrl = process.env.RAG_SERVICE_URL + '/chat';
    
    // Forward the request to the Python RAG service with stream: false for JSON response
    const response = await axios.post(ragServiceUrl, {
      message: message.trim(),
      model: model,
      provider: provider,
      stream: false
    }, {
      timeout: 30000, // 30 second timeout for RAG responses
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('RAG service responded with data');

    // Get the JSON response
    const ragResponse = response.data;
    
    // Send JSON response directly
    res.json({
      response: ragResponse.response || '',
      sources: ragResponse.sources || [],
      conversation_id: ragResponse.conversation_id || null,
      model: ragResponse.model || model
    });

  } catch (error) {
    console.error('Error proxying chat request to RAG service:', error.message);
    
    // Handle specific error cases
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Service Unavailable', 
        message: 'The RAG service is not running. Please ensure the Python service is started at http://localhost:8000' 
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message: 'The RAG service took too long to respond. Please try again.'
      });
    }
    
    if (error.response?.status === 400) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request sent to RAG service.'
      });
    }
    
    if (error.response?.status === 500) {
      return res.status(502).json({
        error: 'Bad Gateway',
        message: 'The RAG service encountered an internal error.'
      });
    }
    
    // Generic error response
    res.status(503).json({ 
      error: 'Service Unavailable', 
      message: 'The AI service is currently unavailable. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Serve static files for React app - with fallback paths
const possibleDistPaths = [
  path.join(__dirname, '../dist'),
  path.join(process.cwd(), 'dist'),
  path.join(__dirname, 'dist')
];

let distPath = null;

for (const testPath of possibleDistPaths) {
  try {
    console.log(`Checking dist path: ${testPath}`);
    const exists = existsSync(testPath);
    console.log(`  Path exists: ${exists}`);
    if (exists) {
      // Double-check it's actually a directory
      const stats = statSync(testPath);
      if (stats.isDirectory()) {
        distPath = testPath;
        console.log(`Found dist directory at: ${distPath}`);
        break;
      } else {
        console.log(`  Path exists but is not a directory`);
      }
    }
  } catch (err) {
    console.log(`  Error checking path: ${err.message}`);
  }
}

if (distPath) {
  // Serve static files with appropriate cache headers
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      // Cache JS/CSS files for longer, but allow revalidation
      if (path.endsWith('.js') || path.endsWith('.css')) {
        res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
      }
      // Don't cache HTML files to ensure updates are visible
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  console.log(`Serving static files from: ${distPath}`);
} else {
  console.error('Could not find dist directory at any of these paths:', possibleDistPaths);
}

// Serve the landing page under /landing path
const possiblePublicPaths = [
  path.join(__dirname, '../public_html'),
  path.join(process.cwd(), 'public_html'),
  path.join(__dirname, 'public_html')
];

let publicPath = null;
for (const testPath of possiblePublicPaths) {
  try {
    console.log(`Checking public_html path: ${testPath}`);
    const exists = existsSync(testPath);
    console.log(`  Path exists: ${exists}`);
    if (exists) {
      // Double-check it's actually a directory
      const stats = statSync(testPath);
      if (stats.isDirectory()) {
        publicPath = testPath;
        console.log(`Found public_html directory at: ${publicPath}`);
        break;
      } else {
        console.log(`  Path exists but is not a directory`);
      }
    }
  } catch (err) {
    console.log(`  Error checking path: ${err.message}`);
  }
}

if (publicPath) {
  app.use('/landing', express.static(publicPath));
  
  // Handle landing page route explicitly (before catch-all)
  app.get('/landing', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  console.error('Could not find public_html directory at any of these paths:', possiblePublicPaths);
}

// RAG Configuration API endpoints
if (!process.env.RAG_SERVICE_URL) {
  console.error('RAG_SERVICE_URL environment variable is required');
  process.exit(1);
}
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'text/html',
      'application/json'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// RAG Status endpoint
app.get('/api/rag/status', rateLimiter, async (req, res) => {
  try {
    // Call the actual RAG service status endpoint
    const statusResponse = await axios.get(`${RAG_SERVICE_URL}/status`, {
      timeout: 5000
    });
    
    // Forward the actual status from RAG service
    res.json(statusResponse.data);
  } catch (error) {
    console.error('Failed to get RAG status:', error.message);
    
    // Return mock data if RAG service is unavailable
    const fallbackStatus = {
      totalVectors: 0,
      totalSources: 0,
      averageQueryTime: 0,
      storageUsed: '0 MB',
      isHealthy: false,
      lastUpdate: new Date().toISOString()
    };
    
    res.json(fallbackStatus);
  }
});

// RAG Sources endpoint
app.get('/api/rag/sources', rateLimiter, async (req, res) => {
  try {
    // Call the actual RAG service sources endpoint
    const sourcesResponse = await axios.get(`${RAG_SERVICE_URL}/sources`, {
      timeout: 5000
    });
    
    // Forward the actual sources from RAG service
    res.json(sourcesResponse.data);
  } catch (error) {
    console.error('Failed to get RAG sources:', error.message);
    
    // Return empty array if RAG service is unavailable
    res.json([]);
  }
});

// URL Ingestion endpoint
app.post('/api/rag/ingest/url', rateLimiter, async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'URL is required and must be a string'
      });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'Please provide a valid URL'
      });
    }
    
    // Forward to RAG service
    const response = await axios.post(`${RAG_SERVICE_URL}/ingest/url`, {
      url: url
    }, {
      timeout: 30000 // 30 seconds for ingestion
    });
    
    res.json({
      success: true,
      message: 'URL ingestion started successfully',
      data: response.data
    });
    
  } catch (error) {
    console.error('URL ingestion error:', error.message);
    if (error.response) {
      res.status(error.response.status).json({
        error: 'RAG service error',
        message: error.response.data?.message || error.message
      });
    } else {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Could not connect to RAG service'
      });
    }
  }
});

// File Upload endpoint
// File upload endpoint - handles both multipart and JSON base64
app.post('/api/rag/ingest/file', rateLimiter, async (req, res, next) => {
  // Check if this is a JSON request with base64 content
  if (req.headers['content-type']?.includes('application/json') && req.body.content) {
    try {
      console.log('Processing JSON base64 file upload:', {
        filename: req.body.filename,
        mimetype: req.body.mimetype,
        size: req.body.size
      });
      
      // Forward the JSON directly to RAG service
      const response = await axios.post(`${RAG_SERVICE_URL}/ingest/file`, req.body, {
        timeout: 60000, // 60 seconds for file processing
        headers: {
          'Content-Type': 'application/json'
        },
        maxContentLength: 100 * 1024 * 1024, // 100MB
        maxBodyLength: 100 * 1024 * 1024 // 100MB
      });
      
      res.json({
        success: true,
        message: 'File uploaded and ingestion started successfully',
        ...response.data
      });
    } catch (error) {
      console.error('File upload error:', error.message);
      
      if (error.response) {
        return res.status(error.response.status).json({
          error: error.response.data?.detail || 'Upload failed',
          message: error.response.data?.detail || error.message
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    }
  } else {
    // Handle multipart form data with multer
    upload.single('file')(req, res, next);
  }
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload'
      });
    }
    
    const file = req.file;
    
    // Convert buffer to base64 for transmission to RAG service
    const fileData = {
      filename: file.originalname,
      mimetype: file.mimetype,
      content: file.buffer.toString('base64'),
      size: file.size
    };
    
    // Forward to RAG service
    const response = await axios.post(`${RAG_SERVICE_URL}/ingest/file`, fileData, {
      timeout: 60000, // 60 seconds for file processing
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      success: true,
      message: 'File uploaded and ingestion started successfully',
      data: response.data
    });
    
  } catch (error) {
    console.error('File upload error:', error.message);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
    
    if (error.message === 'Unsupported file type') {
      return res.status(400).json({
        error: 'Unsupported file type',
        message: 'Please upload TXT, MD, PDF, HTML, or JSON files only'
      });
    }
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'RAG service error',
        message: error.response.data?.message || error.message
      });
    } else {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Could not connect to RAG service'
      });
    }
  }
});

// Delete source endpoint (alternative POST method for complex IDs)
app.post('/api/rag/sources/delete', rateLimiter, async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Source ID is required in request body and must be a string'
      });
    }
    
    console.log(`Deleting source via POST: ${id}`);
    
    // Forward to RAG service's POST delete endpoint
    const response = await axios.post(`${RAG_SERVICE_URL}/sources/delete`, {
      id: id
    }, {
      timeout: 30000, // 30 seconds for deletion
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Source ${id} deleted successfully`);
    
    res.json({
      success: true,
      message: `Source ${id} deleted successfully`,
      data: response.data
    });
    
  } catch (error) {
    console.error('Source deletion error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'RAG service error',
        message: error.response.data?.detail || error.message
      });
    } else {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Could not connect to RAG service'
      });
    }
  }
});

// Delete source endpoint
app.delete('/api/rag/sources/:id', rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Source ID is required and must be a string'
      });
    }
    
    // Decode the URL-encoded source ID
    const decodedId = decodeURIComponent(id);
    console.log(`Deleting source: ${decodedId}`);
    
    // Forward to RAG service with properly encoded ID
    const response = await axios.delete(`${RAG_SERVICE_URL}/sources/${encodeURIComponent(decodedId)}`, {
      timeout: 30000 // 30 seconds for deletion
    });
    
    console.log(`Source ${decodedId} deleted successfully`);
    
    res.json({
      success: true,
      message: `Source ${decodedId} deleted successfully`,
      data: response.data
    });
    
  } catch (error) {
    console.error('Source deletion error:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'RAG service error',
        message: error.response.data?.detail || error.message
      });
    } else {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Could not connect to RAG service'
      });
    }
  }
});

// Handle React app routes (catch-all for client-side routing)
// This must come after specific routes but before the 404 handler
app.get('*', (req, res, next) => {
    // Skip API routes and landing routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/landing')) {
        return next();
    }
    
    // Serve React app for all other routes
    if (distPath) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        return next(); // Let 404 handler take over
    }
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
  
  // If it looks like an API request, provide JSON response
  if (requestedUrl.startsWith('/api/')) {
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
    
    return res.status(404).json(response);
  }
  
  // For non-API requests, serve the React app if available (which will handle its own 404)
  if (distPath) {
    res.status(404).sendFile(path.join(distPath, 'index.html'));
  } else {
    // If no dist directory found, send a plain 404 response
    res.status(404).send('Not Found - Application files not available');
  }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Consolidated server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    console.log('Environment:', process.env.NODE_ENV || 'production');
    console.log('Server architecture: Consolidated (no proxy)');
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
