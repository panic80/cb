# API Integration

## Overview

This application integrates with Google's Gemini API to provide AI-powered responses to user queries about Canadian Forces Travel Instructions. The integration is designed to be secure, reliable, and efficient.

## Gemini API Integration

### Client-Side Integration (src/api/gemini.jsx)

The client-side integration provides a clean interface for components to interact with the Gemini API:

```javascript
// Example usage
import { sendToGemini } from '../api/gemini';

const response = await sendToGemini(
  userMessage,
  isSimplifiedMode,
  'gemini-2.0-flash',
  travelInstructionsText
);
```

### Key Features

1. **Dual Access Methods**:
   - Direct SDK access via Google's official library
   - Proxy API access for development and security

2. **Error Handling**:
   - Comprehensive error classification
   - Retry logic with exponential backoff
   - Fallback content for failed requests

3. **Security**:
   - API key validation
   - Secure header-based authentication
   - Environment-aware configuration

### Models

The application supports the following Gemini models:

- `gemini-2.0-flash`: Default model offering a balance of speed and quality
- `gemini-2.0-flash-lite`: Faster, lighter model for simpler queries

## Server-Side Proxy (server/proxy.js)

The server-side proxy provides additional security, caching, and error handling for API requests:

### Endpoints

1. **`/api/gemini/generateContent`**:
   - **Method**: POST
   - **Purpose**: Generate AI content from Gemini
   - **Authentication**: Requires API key

2. **`/api/travel-instructions`**:
   - **Method**: GET
   - **Purpose**: Retrieve travel instructions content
   - **Caching**: Implements TTL-based caching

3. **`/health`**:
   - **Method**: GET
   - **Purpose**: Health check for system status
   - **Authentication**: None (admin mode available with query params)

4. **`/api/config`**:
   - **Method**: GET
   - **Purpose**: Get API configuration
   - **Authentication**: None

### Rate Limiting

The server implements rate limiting to prevent abuse:

- 60 requests per minute per client
- Proper 429 responses with Retry-After headers
- Exponential backoff for retry attempts

### Response Format

Successful responses follow this format:

```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "Generated content from Gemini"
      }]
    }
  }]
}
```

Error responses follow this format:

```json
{
  "error": "Error type (e.g., 'Rate Limit Exceeded')",
  "message": "Human-readable error message",
  "retryAfter": 60 // Optional retry suggestion in seconds
}
```

## Travel Instructions Data

The application fetches travel instructions data from:

1. Primary source: Canadian government website
2. Fallback: Cached version in memory/IndexedDB
3. Final fallback: Built-in default content

The data is structured as a text document with sections and is preprocessed for optimal AI interaction.

## Caching Strategy

The API integration implements a multi-level caching strategy:

1. **Memory Cache**: Ultra-fast in-memory caching during active sessions
2. **IndexedDB**: Persistent client-side caching between sessions
3. **HTTP Caching**: ETag and Cache-Control headers
4. **Stale-While-Revalidate**: Serve stale content while fetching fresh data

## Configuration

API integration can be configured via environment variables:

- `VITE_GEMINI_API_KEY`: Your Gemini API key
- `NODE_ENV`: Environment setting (development/production)
- Other settings via the `/api/config` endpoint