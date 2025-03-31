import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import nodemailer from 'nodemailer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { loggingMiddleware } from './middleware/logging.js';
import { initializeRagService, retrieveChunks } from './services/ragService.js'; // Added RAG service import
import { getGenerationConfig } from '../src/api/gemini.js'; // Import config getter

import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config(); // Ensure env vars are loaded

// Setup Gemini Generative Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY environment variable is not set for generative model.');
  // process.exit(1); // Consider exiting if the key is crucial for core functionality
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const generativeModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" }); // Or another suitable model
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON requests
app.use(express.json());

// Constants for direct API call
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_ANSWER_SENTENCES = 3; // Maximum sentences for the chatbot's answer

// Process content with enhanced formatting and semantic structure preservation
const processContent = (html) => {
  try {
    console.log('Starting HTML processing with cheerio...');
    
    // Load HTML with cheerio
    const $ = cheerio.load(html, {
      decodeEntities: true,
      xmlMode: false
    });
    
    // Remove unwanted elements
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
    
    // Clean and format content while preserving structure
    const processedText = mainContent
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Format section numbers
      .replace(/(\d+\.\d+\.?\d*)(\s+)/g, '\n$1$2')
      // Make sure section headings are on their own lines
      .replace(/(SECTION|Chapter|CHAPTER|Part|PART)\s+(\d+)/gi, '\n$1 $2')
      // Fix camelCase to space separated
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Ensure sentence boundaries have newlines
      .replace(/([.!?])\s+/g, '$1\n')
      // Final trim
      .trim();
    
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

// Function to detect and format potential tabular data in text
const detectAndFormatTable = (text) => {
  // Placeholder implementation - Enhance with actual detection logic (regex, heuristics)
  // Example: Detect simple markdown tables
  const markdownTableRegex = /^\|.+\|\n\|[- :|]+\|\n(\|.+\|\n)+/m;
  const match = text.match(markdownTableRegex);

  if (match) {
    const tableLines = match[0].trim().split('\n');
    const headers = tableLines[0].split('|').map(h => h.trim()).filter(h => h); // Extract headers
    const rows = tableLines.slice(2).map(rowLine => {
      const cells = rowLine.split('|').map(c => c.trim()).filter(c => c); // Extract cells
      let rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = cells[index] || ''; // Map cells to headers
      });
      return rowObj;
    });

    return {
      isTable: true,
      tableData: rows,
      // Optionally, return the raw matched text or modify the original text
    };
  }

  // Add more heuristics here (e.g., lists, key-value pairs)

  // Default: Not a table
  return { isTable: false, tableData: null };
};


// Enable CORS and logging middlewares
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Add logging middleware
app.use(loggingMiddleware);

// Removed response logging middleware for chat endpoints

// API routes first with enhanced error handling
// In development and production, we proxy to the proxy server
// If proxy server is unavailable, we'll handle locally
const isDevelopment = process.env.NODE_ENV === 'development';

// Initialize locals for tracking proxy status
app.use((req, res, next) => {
  res.locals.proxyFailed = false;
  next();
});

// In production, proxy all API requests including travel-instructions
console.log(isDevelopment ? 'Development mode' : 'Production mode' + ': Proxying travel instructions to proxy server');

/* --- API v2 Chatbot Route --- */
app.post('/api/v2/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: 'Message must be a non-empty string.' });
  }

  try {
    console.log(`Received chat message: "${message}"`);
    // 1. Retrieve relevant chunks using RAG service
    const { chunks: contextChunks, sources } = await retrieveChunks(message);

    if (!contextChunks || contextChunks.length === 0) {
      console.warn(`No relevant context found for message: "${message}"`);
      // Fallback response if no context is found
      return res.json({ reply: "I couldn't find specific information related to your question in the travel instructions." });
    }

    // 2. Construct the prompt for the generative model
    // Construct context using source information
    const contextText = contextChunks.map((chunk) => {
        // Prefer sourceTitle, fallback to sourceUrl if title is missing or generic
        const sourceLabel = (chunk.sourceTitle && chunk.sourceTitle !== 'Untitled Document') ? chunk.sourceTitle : chunk.sourceUrl;
        return `Context from ${sourceLabel}:\n${chunk.text}`;
    }).join('\n\n---\n\n');
    const prompt = `
You are an AI assistant specializing SOLELY in the Canadian Forces Temporary Duty Travel Instructions. Your single purpose is to provide EXHAUSTIVE and DETAILED answers based *strictly* and *exclusively* on the context provided below.

**Critical Instructions - Adhere Strictly:**
1.  **Base Response ENTIRELY on Provided Context:** Do NOT use any external knowledge, assumptions, or information outside the "Context from Travel Instructions" section below.
2.  **Demand for Verbosity:** Provide a THOROUGH, multi-sentence answer. Do NOT be brief. Elaborate significantly. Explain the reasoning clearly and fully.
3.  **Extract Specifics:** If the context contains specific rules, conditions, rates, or examples, INCLUDE them explicitly in your answer.
4.  **Explain Conditions:** If the answer depends on certain conditions mentioned in the context, clearly state those conditions and how they affect the outcome.
5.  **No Context = State Clearly:** If the provided context chunks definitively DO NOT contain the information needed to answer the question, explicitly state that the information is not available *in the provided sections* of the travel instructions. Do not guess or infer.
6.  **Follow Format:** Adhere strictly to the "Required Output Format" below.
7.  **Sentence Limit:** Limit your final "Answer:" to a maximum of ${MAX_ANSWER_SENTENCES} sentences. Be concise but complete within this limit.
8.  **Priotize** Make sure to prioritize rates, dollar amonunts, fees in the beginning of the answer.


**Required Output Format:**
Answer: <Write a comprehensive, detailed, multi-sentence answer here, incorporating specifics and explanations directly from the context. Explicitly state if the context lacks the information.>
Reason: <Provide a detailed, multi-sentence elaboration on WHY the answer is what it is, citing rules, conditions, or lack of information FROM THE CONTEXT. Explain the supporting details thoroughly.>

Context from Travel Instructions:
---
${contextText}
---

User's Question: ${message}

Answer:`; // Ensure the model starts generating the detailed answer here, following the format precisely.

    // 3. Call the Gemini generative model
    console.log(`Generating response for: "${message}" with ${contextChunks.length} context chunks.`);
    // Note: No explicit generationConfig is passed here, so it uses model defaults.
    // Found maxOutputTokens in src/api/gemini.js defaults to 2048, which is sufficient.
    const result = await generativeModel.generateContent(prompt); 
    const response = result.response;
    const replyText = response.text();

    console.log(`Generated reply: "${replyText.substring(0, 100)}..."`);

    // Detect and format potential tables
    const tableDetectionResult = detectAndFormatTable(replyText);

    // Construct the response payload
    let responsePayload = {
      reply: replyText, // Always include the original text
      sources: sources,
      displayAsTable: false,
      tableData: null,
    };

    if (tableDetectionResult.isTable) {
      responsePayload.displayAsTable = true;
      responsePayload.tableData = tableDetectionResult.tableData;
      // Optionally, you could modify responsePayload.reply here if needed,
      // e.g., remove the table part from the main text reply.
      // For now, we keep the full original reply.
      console.log("Tabular data detected and formatted.");
    }

    // Send the potentially modified payload back to the frontend
    res.json(responsePayload);

  } catch (error) {
    console.error('Error handling /api/v2/chat request:', error);
    // Check if the RAG service itself failed initialization or retrieval
    if (error.message.includes('RAG service not initialized')) {
       res.status(503).json({ error: 'Service Unavailable', message: 'Chatbot context is still initializing. Please try again shortly.' });
    } else {
       res.status(500).json({ error: 'Internal Server Error', message: 'Failed to generate chat response.' });
    }
  }
});


/* Proxy setup for the backend server with error handling that enables direct fallback */
// Only apply the API proxy if NOT in development mode
if (!isDevelopment) {
  console.log('Applying API proxy middleware (Non-Development mode).');
  app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying request to: ${req.method} ${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        // If this is a travel instructions request, check for error status codes
        if (req.path === '/api/travel-instructions' && proxyRes.statusCode >= 400) {
            console.log(`Proxy returned error status ${proxyRes.statusCode} for travel instructions, will use direct fallback`);
            res.locals.proxyFailed = true;
        } else {
            console.log(`Proxy response from: ${req.method} ${req.path}, status: ${proxyRes.statusCode}`);
        }
    },
    // Note: The 4th argument from http-proxy's 'error' event is 'target', not 'next'.
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
        
        // If this is a travel instructions request, trigger the direct fallback
        if (req.path === '/api/travel-instructions') {
            console.log('Proxy server unreachable for travel instructions, will use direct fallback');
            res.locals.proxyFailed = true;
            // Do NOT call next() here - it's not the Express next function.
            // Do NOT end the response here; allow middleware to potentially call the real next()
            // to reach the fallback handler defined below.
        } else {
            // For other API endpoints, return a standard error
            res.status(503).json({
                error: 'Proxy Service Unavailable',
                message: 'The API proxy service is currently unavailable',
                timestamp: new Date().toISOString()
            });
        }
    }
  }));
} else {
  console.log('Skipping API proxy middleware (Development mode).');
}

// Fallback handler if proxy fails for travel instructions - makes direct API call
app.all('/api/travel-instructions*', async (req, res) => {
  // Only process if proxy failed
  if (res.locals.proxyFailed) {
    try {
      // Make direct API call to Canada.ca
      console.log('Proxy failed, making direct API call to Canada.ca');
      
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
      
      // Setup for retries
      let retryCount = 0;
      let content = null;
      
      while (retryCount < MAX_RETRIES && !content) {
        try {
          console.log(`Direct API call attempt ${retryCount + 1}/${MAX_RETRIES}`);
          
          const response = await axios.get(
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
          
          if (response.status === 200 && response.data) {
            console.log('Direct API call successful, processing content');
            content = processContent(response.data);
            
            if (!content || content.trim().length < 100) {
              console.error('Processed content too short or empty, retrying');
              content = null; // Reset to trigger retry
              throw new Error('Content validation failed');
            }
          }
        } catch (fetchError) {
          console.error(`Direct API fetch error (attempt ${retryCount + 1}):`, fetchError.message);
          retryCount++;
          
          if (retryCount < MAX_RETRIES) {
            // Wait before retrying with exponential backoff
            const delay = 1000 * Math.pow(2, retryCount - 1);
            console.log(`Waiting ${delay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If we still don't have content after all retries, return error
      if (!content) {
        console.log('All direct API call attempts failed, returning error');
        throw new Error('Failed to retrieve travel instructions from Canada.ca after multiple attempts');
      }
      
      // Return the content
      res.json({
        content: content,
        timestamp: new Date().toISOString(),
        source: 'canada.ca-direct'
      });
      
      console.log('Travel instructions API request served through direct API call');
    } catch (error) {
      console.error('Error in direct API call handler:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve travel instructions (direct fallback)',
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Serve the main landing page
app.use(express.static(path.join(__dirname, '../public_html')));

// Removed chatbot serving (static files and route handler)


// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public_html/index.html'));
});

// Export the app instance for testing or programmatic use
export default app;

// Only start the server if this script is run directly (not imported as a module for testing)
// if (process.env.NODE_ENV !== 'test') {
// The check below is slightly more robust if NODE_ENV isn't reliably set during testing phases
// Determine if the module is the main module being run
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
// A common pattern is also to check NODE_ENV, which Vitest usually sets. Let's use that for simplicity with Vitest.
if (process.env.NODE_ENV !== 'test') {
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

    // Initialize the RAG service asynchronously after server starts
    console.log('Triggering RAG service initialization...');
    initializeRagService().catch(err => {
        console.error("Background RAG service initialization failed:", err);
        // Keep the server running, but the RAG features might be unavailable.
        // Monitor logs for recurring failures.
    });
    });
}
