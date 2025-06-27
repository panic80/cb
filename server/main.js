import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, statSync } from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@googlemaps/google-maps-services-js';
import { loggingMiddleware } from './middleware/logging.js';
import chatLogger from './services/logger.js';
import CacheService from './services/cache.js';
import dotenv from 'dotenv';

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

// Add request logging middleware (without consuming body)
app.use((req, res, next) => {
  console.log(`[Request Logger] ${req.method} ${req.originalUrl || req.url}`);
  console.log('[Request Logger] Headers:', req.headers);
  next();
});

// Parse JSON request bodies with increased limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
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

// Initialize AI clients
let geminiClient = null;
let openaiClient = null;
let anthropicClient = null;

// Helper function to check if API key is valid (not a placeholder)
const isValidApiKey = (key) => {
  return key && 
         !key.includes('your-') && 
         !key.includes('-key-here') && 
         key.length > 10;
};

if (isValidApiKey(process.env.VITE_GEMINI_API_KEY)) {
  geminiClient = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
  console.log('Gemini API client initialized');
} else {
  console.log('Gemini API key not configured or invalid');
}

if (isValidApiKey(process.env.OPENAI_API_KEY)) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('OpenAI API client initialized');
} else {
  console.log('OpenAI API key not configured or invalid');
}

if (isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
  anthropicClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  console.log('Anthropic API client initialized');
} else {
  console.log('Anthropic API key not configured or invalid');
}

// Initialize Google Maps client
let googleMapsClient = null;
if (isValidApiKey(process.env.GOOGLE_MAPS_API_KEY)) {
  googleMapsClient = new Client({});
  console.log('Google Maps API client initialized');
} else {
  console.log('Google Maps API key not configured or invalid');
}

// Helper function to check if a model is an O-series reasoning model
const isOSeriesModel = (model) => {
  return model && (
    model.startsWith('o3') || 
    model.startsWith('o4') ||
    model === 'o1' ||
    model === 'o1-mini'
  );
};

// Helper function to build OpenAI parameters based on model type
const buildOpenAIParams = (model, messages) => {
  const baseParams = {
    model: model,
    messages: messages
  };
  
  const isOSeries = isOSeriesModel(model);
  console.log(`Building OpenAI params for model: ${model}, isOSeries: ${isOSeries}`);
  
  if (isOSeries) {
    // O-series models only support max_completion_tokens
    return {
      ...baseParams,
      max_completion_tokens: 8192
    };
  } else {
    // Standard models support traditional parameters
    return {
      ...baseParams,
      temperature: 0.7
    };
  }
};

// Apply logging middleware conditionally (after static assets)
if (config.loggingEnabled) {
  app.use(loggingMiddleware);
}

// Custom rate limiting middleware (simpler than express-rate-limit)
const rateLimiter = (req, res, next) => {
  if (!config.rateLimitEnabled) {
    return next();
  }
  
  const clientIP = req.ip || req.socket.remoteAddress;
  const requestCount = apiRequestCounts.get(clientIP) || 0;
  
  if (requestCount >= config.rateLimitMax) {
    chatLogger.warn({
      message: 'Rate limit exceeded',
      clientIP,
      path: req.path,
      requestCount
    });
    return res.status(429).json({ 
      error: 'Rate limit exceeded', 
      retryAfter: Math.ceil(config.rateLimitWindow / 1000)
    });
  }
  
  apiRequestCounts.set(clientIP, requestCount + 1);
  next();
};

// Legacy chat middleware for backward compatibility
app.use('/api/chat', async (req, res, next) => {
  if (req.method === 'POST') {
    console.log('Legacy /api/chat endpoint called, redirecting to /api/gemini/generateContent');
    req.url = '/api/gemini/generateContent';
    // Decode URL encoded body params if present
    if (req.body) {
      req.body = decodeUrlParams(req.body);
    }
    
    // Handle both old and new parameter names
    if (req.body.query && !req.body.prompt) {
      req.body.prompt = req.body.query;
    }
    
    return app._router.handle(req, res, next);
  }
  next();
});

// Gemini chat endpoint (existing)
app.post('/api/gemini/generateContent', rateLimiter, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Prompt is required and must be a non-empty string' 
      });
    }

    if (!geminiClient) {
      return res.status(500).json({ 
        error: 'Configuration Error', 
        message: 'Gemini API key is not configured.' 
      });
    }

    const model = geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    res.json({ response: text });
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// RAG-enhanced chat endpoint
app.post('/api/v2/chat/rag', rateLimiter, async (req, res, next) => {
  const { message, model, provider, chatHistory, conversationId, useRAG = true } = req.body;

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Message must be a non-empty string.' 
    });
  }

  try {
    console.log('Processing RAG chat request', {
      message: message?.substring(0, 50),
      model,
      provider,
      hasHistory: !!chatHistory,
      conversationId
    });
    
    // Forward to RAG service
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.post(`${ragServiceUrl}/api/v1/chat`, {
      message: message.trim(),
      chat_history: chatHistory || [],
      conversation_id: conversationId,
      provider: provider || 'openai',
      model: model,
      use_rag: useRAG,
      include_sources: true
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Return RAG response
    res.json(ragResponse.data);

  } catch (error) {
    console.error('RAG chat error:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    
    if (error.response) {
      // Forward error from RAG service
      return res.status(error.response.status).json(error.response.data);
    }
    
    // Fallback to regular chat if RAG service is unavailable
    console.log('RAG service unavailable, falling back to regular chat');
    
    // Call the regular chat endpoint
    const { message, model, provider } = req.body;
    try {
      let response = '';
      
      switch (provider) {
        case 'google':
          if (!geminiClient) {
            return res.status(500).json({ 
              error: 'Configuration Error', 
              message: 'Google API key is not configured.' 
            });
          }
          
          const geminiModel = geminiClient.getGenerativeModel({ model: model });
          const geminiResult = await geminiModel.generateContent(message.trim());
          const geminiResponse = await geminiResult.response;
          response = geminiResponse.text();
          break;
          
        case 'openai':
          if (!openaiClient) {
            return res.status(500).json({ 
              error: 'Configuration Error', 
              message: 'OpenAI API key is not configured.' 
            });
          }
          
          const openaiParams = buildOpenAIParams(
            model,
            [{ role: 'user', content: message.trim() }]
          );
          
          const openaiCompletion = await openaiClient.chat.completions.create(openaiParams);
          
          response = openaiCompletion.choices[0].message.content;
          break;
          
        case 'anthropic':
          if (!anthropicClient) {
            return res.status(500).json({ 
              error: 'Configuration Error', 
              message: 'Anthropic API key is not configured.' 
            });
          }
          
          const anthropicMessage = await anthropicClient.messages.create({
            model: model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: message.trim() }],
          });
          
          response = anthropicMessage.content[0].text;
          break;
          
        default:
          return res.status(400).json({ 
            error: 'Bad Request', 
            message: `Unsupported provider: ${provider}` 
          });
      }
      
      // Send response
      res.json({
        response: response,
        sources: [], // No sources without RAG
        conversation_id: null,
        model: model
      });
    } catch (fallbackError) {
      console.error('Fallback chat error:', fallbackError);
      return res.status(500).json({ 
        error: 'Internal Server Error', 
        message: 'Both RAG and fallback chat services failed.' 
      });
    }
  }
});

// New unified chat endpoint that supports multiple providers
app.post('/api/v2/chat', rateLimiter, async (req, res) => {
  const { message, model, provider } = req.body;

  // Validate input message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Message must be a non-empty string.' 
    });
  }

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

  try {
    console.log('Processing chat request with model:', model, 'provider:', provider);
    
    let response = '';
    
    // Process based on provider
    switch (provider) {
      case 'google':
        if (!geminiClient) {
          return res.status(500).json({ 
            error: 'Configuration Error', 
            message: 'Google API key is not configured.' 
          });
        }
        
        const geminiModel = geminiClient.getGenerativeModel({ model: model });
        const geminiResult = await geminiModel.generateContent(message.trim());
        const geminiResponse = await geminiResult.response;
        response = geminiResponse.text();
        break;
        
      case 'openai':
        if (!openaiClient) {
          return res.status(500).json({ 
            error: 'Configuration Error', 
            message: 'OpenAI API key is not configured.' 
          });
        }
        
        const openaiParams = buildOpenAIParams(
          model,
          [{ role: 'user', content: message.trim() }]
        );
        
        const openaiCompletion = await openaiClient.chat.completions.create(openaiParams);
        
        response = openaiCompletion.choices[0].message.content;
        break;
        
      case 'anthropic':
        if (!anthropicClient) {
          return res.status(500).json({ 
            error: 'Configuration Error', 
            message: 'Anthropic API key is not configured.' 
          });
        }
        
        const anthropicMessage = await anthropicClient.messages.create({
          model: model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: message.trim() }],
        });
        
        response = anthropicMessage.content[0].text;
        break;
        
      default:
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: `Unsupported provider: ${provider}` 
        });
    }
    
    // Send response
    res.json({
      response: response,
      sources: [], // No sources without RAG
      conversation_id: null,
      model: model
    });

  } catch (error) {
    console.error('Error processing chat request:', error);
    
    // Handle specific error cases
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: 'Too many requests to the AI provider. Please try again later.'
      });
    }
    
    if (error.status === 401) {
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'Invalid API key for the selected provider.'
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'An error occurred while processing your request.' 
    });
  }
});

// Document ingestion endpoints
// Proxy route for /api/rag/ingest to /api/v2/ingest
app.post('/api/rag/ingest', rateLimiter, async (req, res) => {
  const { url, content, type = 'web', metadata, forceRefresh = false } = req.body;

  // Validate input
  if (!url && !content) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Either URL or content must be provided.' 
    });
  }

  try {
    // Forward to RAG service
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    console.log('Forwarding ingestion request to RAG service:', {
      url: url || 'N/A',
      type,
      hasContent: !!content,
      forceRefresh
    });
    
    const ragResponse = await axios.post(`${ragServiceUrl}/api/v1/ingest`, {
      url,
      content,
      type,
      metadata: metadata || {},
      force_refresh: forceRefresh
    }, {
      timeout: 300000, // 5 minute timeout for complex documents
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Document ingestion error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to ingest document.' 
    });
  }
});

// SSE endpoint for ingestion progress - proxy to RAG service
app.get('/api/rag/ingest/progress', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  
  try {
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    
    // Proxy the SSE request to RAG service with URL parameter
    const response = await axios.get(
      `${ragServiceUrl}/api/v1/ingest/progress`,
      {
        params: { url },
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });
    
    // Pipe the response
    response.data.pipe(res);
    
    // Clean up on client disconnect
    req.on('close', () => {
      response.data.destroy();
    });
    
  } catch (error) {
    console.error('Progress streaming error:', error);
    res.status(500).json({ error: 'Failed to connect to progress stream' });
  }
});

app.post('/api/v2/ingest', rateLimiter, async (req, res) => {
  const { url, content, type = 'web', metadata, forceRefresh = false } = req.body;

  // Validate input
  if (!url && !content) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Either URL or content must be provided.' 
    });
  }

  try {
    // Forward to RAG service
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    console.log('Forwarding ingestion request to RAG service:', {
      url: url || 'N/A',
      type,
      hasContent: !!content,
      forceRefresh
    });
    
    const ragResponse = await axios.post(`${ragServiceUrl}/api/v1/ingest`, {
      url,
      content,
      type,
      metadata: metadata || {},
      force_refresh: forceRefresh
    }, {
      timeout: 300000, // 5 minute timeout for complex documents
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Document ingestion error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to ingest document.' 
    });
  }
});

// Ingest Canada.ca travel instructions
app.post('/api/v2/ingest/canada-ca', rateLimiter, async (req, res) => {
  try {
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.post(`${ragServiceUrl}/api/v1/ingest/canada-ca`, {}, {
      timeout: 300000, // 5 minute timeout for full scraping
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Canada.ca ingestion error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to ingest Canada.ca content.' 
    });
  }
});

// List indexed sources
app.get('/api/v2/sources', rateLimiter, async (req, res) => {
  try {
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.get(`${ragServiceUrl}/api/v1/sources`, {
      params: req.query,
      timeout: 10000
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Sources listing error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to list sources.' 
    });
  }
});

// Get source statistics
app.get('/api/v2/sources/stats', rateLimiter, async (req, res) => {
  try {
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.get(`${ragServiceUrl}/api/v1/sources/stats`, {
      timeout: 10000
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Source stats error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to get source statistics.' 
    });
  }
});

// Get source count
app.get('/api/v2/sources/count', rateLimiter, async (req, res) => {
  try {
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.get(`${ragServiceUrl}/api/v1/sources/count`, {
      timeout: 10000
    });

    res.json(ragResponse.data);

  } catch (error) {
    console.error('Source count error:', error);
    
    // Return a default response instead of erroring
    res.json({ count: 0, status: 'error', message: 'Unable to get count' });
  }
});

// Purge database endpoint
app.post('/api/v2/database/purge', rateLimiter, async (req, res) => {
  try {
    console.log('Database purge requested');
    
    // Forward to RAG service
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const ragResponse = await axios.post(`${ragServiceUrl}/api/v1/database/purge`, {}, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Database purge completed:', ragResponse.data);
    res.json(ragResponse.data);

  } catch (error) {
    console.error('Database purge error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to purge database.' 
    });
  }
});

// SSE Streaming chat endpoint - proxy to RAG service
app.post('/api/v2/chat/stream', rateLimiter, async (req, res) => {
  const { message, model, provider, chatHistory, conversationId, useRAG = true } = req.body;

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Message must be a non-empty string.'
    });
  }

  try {
    console.log('Processing streaming chat request', {
      message: message?.substring(0, 50),
      model,
      provider,
      hasHistory: !!chatHistory,
      conversationId
    });
    
    // Forward to RAG service streaming endpoint
    const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.post(
      `${ragServiceUrl}/api/v1/streaming_chat`,
      {
        message: message.trim(),
        chat_history: chatHistory || [],
        conversation_id: conversationId,
        provider: provider || 'openai',
        model: model,
        use_rag: useRAG,
        include_sources: true
      },
      {
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        }
      }
    );

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });

    // Pipe the response
    response.data.pipe(res);

    // Clean up on client disconnect
    req.on('close', () => {
      response.data.destroy();
    });

  } catch (error) {
    console.error('Streaming chat error:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // For streaming errors, we need to send SSE formatted error
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
    }
    
    const errorEvent = {
      type: 'error',
      error_type: error.response?.status === 401 ? 'auth_error' : 'unknown_error',
      message: error.message || 'Streaming chat failed'
    };
    
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
  }
});

// Follow-up questions endpoint (simplified without RAG context)
app.post('/api/v2/followup', rateLimiter, async (req, res) => {
  const { userQuestion, aiResponse, model, provider } = req.body;

  // Validate input
  if (!userQuestion || !aiResponse) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'userQuestion and aiResponse are required.' 
    });
  }

  try {
    const prompt = `Based on this conversation, generate 2-3 relevant follow-up questions:

User Question: "${userQuestion}"
AI Response: "${aiResponse}"

Generate follow-up questions that would help the user learn more or get specific information. Return as a JSON array of questions.`;

    let followUpQuestions = [];
    
    // Use the specified provider or fall back to Google
    const actualProvider = provider || 'google';
    const actualModel = model || 'gemini-2.0-flash';
    
    switch (actualProvider) {
      case 'google':
        if (geminiClient) {
          const geminiModel = geminiClient.getGenerativeModel({ model: actualModel });
          const result = await geminiModel.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          
          // Try to parse JSON from response
          try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const questions = JSON.parse(jsonMatch[0]);
              followUpQuestions = questions.map((q, idx) => ({
                id: `followup-${Date.now()}-${idx}`,
                question: q,
                category: 'related',
                confidence: 0.7
              }));
            }
          } catch (e) {
            console.error('Failed to parse follow-up questions:', e);
          }
        }
        break;
        
      case 'openai':
        if (openaiClient) {
          const completion = await openaiClient.chat.completions.create({
            model: actualModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          });
          
          const text = completion.choices[0].message.content;
          
          // Try to parse JSON from response
          try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const questions = JSON.parse(jsonMatch[0]);
              followUpQuestions = questions.map((q, idx) => ({
                id: `followup-${Date.now()}-${idx}`,
                question: q,
                category: 'related',
                confidence: 0.7
              }));
            }
          } catch (e) {
            console.error('Failed to parse follow-up questions:', e);
          }
        }
        break;
    }
    
    // Fallback questions if generation failed
    if (followUpQuestions.length === 0) {
      followUpQuestions = [
        {
          id: `followup-${Date.now()}-0`,
          question: 'Can you provide more specific examples?',
          category: 'clarification',
          confidence: 0.5
        },
        {
          id: `followup-${Date.now()}-1`,
          question: 'What are the next steps I should take?',
          category: 'practical',
          confidence: 0.5
        }
      ];
    }

    res.json({ followUpQuestions });

  } catch (error) {
    console.error('Error generating follow-up questions:', error);
    
    // Return empty array on error
    res.json({ followUpQuestions: [] });
  }
});

// Travel instructions proxy endpoint with caching and error handling
app.get('/api/travel-instructions', rateLimiter, async (req, res) => {
  try {
    const startTime = Date.now();
    const ifNoneMatch = req.headers['if-none-match'];
    
    // Check cache first (if caching enabled)
    if (cache) {
      const cachedData = await cache.get('travel-instructions');
      if (cachedData && cachedData.content && cachedData.etag) {
        console.log('Cache hit for travel instructions, age:', Date.now() - cachedData.timestamp, 'ms');
        
        // Handle conditional requests
        if (ifNoneMatch && ifNoneMatch === cachedData.etag) {
          return res.status(304).send(); // Not Modified
        }
        
        // Set cache headers
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('ETag', cachedData.etag);
        if (cachedData.lastModified) {
          res.setHeader('Last-Modified', cachedData.lastModified);
        }
        
        return res.json({ 
          content: cachedData.content, 
          fresh: false,
          cacheAge: Date.now() - cachedData.timestamp,
          timestamp: new Date(cachedData.timestamp).toISOString()
        });
      }
    }

    // Fetch from canada.ca with retry mechanism
    console.log('Fetching fresh travel instructions from:', config.canadaCaUrl);
    let response;
    let lastError;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        response = await axios.get(config.canadaCaUrl, {
          timeout: config.requestTimeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CFTravelBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-CA,en;q=0.9',
            'Cache-Control': 'no-cache'
          },
          validateStatus: function (status) {
            return status < 500; // Accept any status < 500
          }
        });
        
        // If successful, break out of retry loop
        if (response.status === 200) {
          break;
        }
        
        // If 404 or other client error, don't retry
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Canada.ca returned status ${response.status}`);
        }
        
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${attempt} failed:`, error.message);
        if (attempt < config.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay * attempt));
        }
      }
    }
    
    // If all retries failed, throw the last error
    if (!response || response.status !== 200) {
      throw lastError || new Error('Failed to fetch travel instructions after all retries');
    }

    // Process HTML content
    const content = processContent(response.data);
    
    // Generate ETag from content
    const etag = `"${Buffer.from(content).toString('base64').substring(0, 27)}"`;
    
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

// Google Maps distance calculation endpoint
app.post('/api/maps/distance', rateLimiter, async (req, res) => {
  try {
    const { origin, destination, mode = 'driving' } = req.body;
    
    if (!origin || !destination) {
      return res.status(400).json({
        error: 'Both origin and destination are required'
      });
    }

    if (!googleMapsClient) {
      return res.status(503).json({
        error: 'Google Maps service is not configured'
      });
    }

    console.log(`[Maps API] Calculating distance from ${origin} to ${destination} via ${mode}`);

    // Call Google Maps Distance Matrix API
    const response = await googleMapsClient.distancematrix({
      params: {
        origins: [origin],
        destinations: [destination],
        mode: mode,
        units: 'metric',
        key: process.env.GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const result = response.data.rows[0]?.elements[0];
    
    if (!result || result.status !== 'OK') {
      return res.status(404).json({
        error: 'Could not calculate distance between the specified locations',
        details: result?.status || 'Unknown error'
      });
    }

    // Extract distance and duration
    const distanceData = {
      distance: {
        text: result.distance.text,
        value: result.distance.value // meters
      },
      duration: {
        text: result.duration.text,
        value: result.duration.value // seconds
      },
      origin: response.data.origin_addresses[0],
      destination: response.data.destination_addresses[0],
      mode: mode
    };

    console.log(`[Maps API] Distance calculated successfully: ${distanceData.distance.text}`);

    res.json(distanceData);
  } catch (error) {
    console.error('[Maps API] Error calculating distance:', error);
    res.status(500).json({
      error: 'Failed to calculate distance',
      message: error.message
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
    
  // Check RAG service health
  let ragHealth = { status: 'unknown' };
  if (process.env.RAG_SERVICE_URL || req.query.checkRag === 'true') {
    try {
      const ragServiceUrl = process.env.RAG_SERVICE_URL || 'http://localhost:8000';
      const ragResponse = await axios.get(`${ragServiceUrl}/api/v1/health`, { timeout: 5000 });
      ragHealth = ragResponse.data;
    } catch (error) {
      ragHealth = { status: 'unhealthy', error: error.message };
    }
  }
  
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
    ragService: ragHealth,
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
      default: 'gpt-4.1-mini',
      providers: {
        google: !!geminiClient,
        openai: !!openaiClient,
        anthropic: !!anthropicClient
      }
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
      chat: '/api/v2/chat',
      chatRag: '/api/v2/chat/rag',
      followup: '/api/v2/followup',
      ingest: '/api/v2/ingest',
      ingestCanada: '/api/v2/ingest/canada-ca',
      sources: '/api/v2/sources',
      sourcesStats: '/api/v2/sources/stats',
      health: '/health'
    },
    // RAG service info
    rag: {
      enabled: !!process.env.RAG_SERVICE_URL || true,
      serviceUrl: process.env.RAG_SERVICE_URL || 'http://localhost:8000'
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

// Core middleware to handle serving the app
app.use(express.static('public_html'));

// Use absolute paths relative to server directory
const possiblePaths = [
  path.join(__dirname, '..', 'public_html'),
  path.join(__dirname, '..', 'dist'),
  path.join(process.cwd(), 'public_html'),
  path.join(process.cwd(), 'dist')
];

// Find the first existing directory
let distPath = null;
for (const testPath of possiblePaths) {
  if (existsSync(testPath)) {
    try {
      const stats = statSync(testPath);
      if (stats.isDirectory()) {
        distPath = testPath;
        console.log(`Found static assets at: ${distPath}`);
        break;
      }
    } catch (err) {
      console.error(`Error checking path ${testPath}:`, err.message);
    }
  }
}

// Improved static file serving for landing page
const possiblePublicPaths = [
  path.join(__dirname, '..', 'public_html', 'landing'),
  path.join(__dirname, '..', 'dist', 'landing'),
  path.join(process.cwd(), 'public_html', 'landing'),
  path.join(process.cwd(), 'dist', 'landing'),
  // Additional fallback paths
  path.join(__dirname, 'public_html', 'landing'),
  path.join(__dirname, 'dist', 'landing')
];

let landingPath = null;
for (const testPath of possiblePublicPaths) {
  if (existsSync(testPath)) {
    try {
      const stats = statSync(testPath);
      if (stats.isDirectory()) {
        landingPath = testPath;
        console.log(`Found landing page at: ${landingPath}`);
        break;
      }
    } catch (err) {
      console.error(`Error checking landing path ${testPath}:`, err.message);
    }
  }
}

if (landingPath) {
  // Serve landing page files with proper MIME types
  app.use('/landing', express.static(landingPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      }
    }
  }));
  
  // Explicit route for landing page
  app.get('/landing', (req, res) => {
    const indexPath = path.join(landingPath, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Landing page not found');
    }
  });
} else {
  console.error('Could not find public_html directory at any of these paths:', possiblePublicPaths);
}

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
    suggestions.push('/api/gemini/generateContent', '/api/v2/chat');
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
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    // Plain text 404 for non-API requests when no React app is available
    res.status(404).send('404 - Page not found');
  }
});

// Global error handler with detailed logging
app.use((err, req, res, next) => {
  const errorId = Date.now().toString(36);
  const errorDetails = {
    id: errorId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body ? JSON.stringify(req.body).substring(0, 1000) : undefined,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    },
    error: {
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      code: err.code,
      statusCode: err.statusCode || err.status
    },
    timestamp: new Date().toISOString()
  };
  
  // Log the error with structured data
  console.error('Global error handler:', JSON.stringify(errorDetails, null, 2));
  if (chatLogger && config.loggingEnabled) {
    chatLogger.error(errorDetails);
  }
  
  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Send appropriate response based on content type
  if (req.path.startsWith('/api/')) {
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal Server Error' : err.message,
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred. Please try again later.' 
        : err.message,
      errorId,
      timestamp: new Date().toISOString()
    });
  } else {
    // For non-API routes, send a simple error page
    res.status(statusCode).send(`
      <html>
        <head><title>Error ${statusCode}</title></head>
        <body>
          <h1>Error ${statusCode}</h1>
          <p>${statusCode === 500 ? 'Internal Server Error' : err.message}</p>
          <p>Error ID: ${errorId}</p>
          <p><a href="/">Go to Homepage</a></p>
        </body>
      </html>
    `);
  }
});

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Close cache connections
  if (cache) {
    await cache.close();
    console.log('Cache connections closed');
  }
  
  // Allow existing connections to finish (with timeout)
  setTimeout(() => {
    console.log('Forcing shutdown after timeout');
    process.exit(0);
  }, 10000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`);
  console.log(`Rate Limiting: ${config.rateLimitEnabled ? `Enabled (${config.rateLimitMax} req/min)` : 'Disabled'}`);
  console.log(`Static assets: ${distPath || 'Not found'}`);
  console.log(`Landing page: ${landingPath || 'Not found'}`);
  
  // Log available endpoints
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /api/config');
  console.log('  GET  /api/travel-instructions');
  console.log('  POST /api/gemini/generateContent');
  console.log('  POST /api/v2/chat');
  console.log('  POST /api/v2/followup');
  console.log('  POST /api/clear-cache');
  console.log('  GET  /api/deployment-info');
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (chatLogger && config.loggingEnabled) {
    chatLogger.error({
      type: 'unhandledRejection',
      reason: reason?.toString(),
      stack: reason?.stack,
      timestamp: new Date().toISOString()
    });
  }
});

export default app;