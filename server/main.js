import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import nodemailer from 'nodemailer';
import { defaultTravelInstructions } from './travelData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// API routes first with enhanced error handling
// In development mode, we use a local fallback
// In production, we proxy to the proxy server
const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
  // In development, use local fallback for faster testing
  app.all('/api/travel-instructions*', (req, res) => {
    try {
      res.header('Content-Type', 'application/json');
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
      res.json({
        content: defaultTravelInstructions,
        timestamp: new Date().toISOString()
      });
      console.log('Travel instructions API request served successfully (dev fallback)');
    } catch (error) {
      console.error('Error serving travel instructions:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve travel instructions'
      });
    }
  });
} else {
  // In production, proxy all API requests including travel-instructions
  console.log('Production mode: Proxying travel instructions to proxy server');
}

// Serve the main landing page
app.use(express.static(path.join(__dirname, '../public_html')));

// Serve the React app under /chatbot path
app.use('/chatbot', express.static(path.join(__dirname, '../dist')));


/* Proxy setup for the backend server */
app.use('/api', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req, res) => {
        console.log(`Proxying request to: ${req.method} ${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`Proxy response from: ${req.method} ${req.path}, status: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err);
    }
}));

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
