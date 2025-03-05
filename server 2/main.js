import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import nodemailer from 'nodemailer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Constants for direct API call
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000; // 10 seconds

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

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

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

/* Proxy setup for the backend server with error handling that enables direct fallback */
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
    onError: (err, req, res, next) => {
        console.error('Proxy error:', err);
        
        // If this is a travel instructions request, trigger the direct fallback
        if (req.path === '/api/travel-instructions') {
            console.log('Proxy server unreachable for travel instructions, will use direct fallback');
            res.locals.proxyFailed = true;
            next(); // Continue to the fallback handler
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

// Serve the React app under /chatbot path
app.use('/chatbot', express.static(path.join(__dirname, '../dist')));

// Handle React app routes
app.get('/chatbot/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});


// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public_html/index.html'));
});

//app.listen(PORT, () => {
//    console.log(`Server running on port ${PORT}`);
//});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
