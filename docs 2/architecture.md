# System Architecture

## Overall Architecture

This application follows a client-server architecture with the following components:

1. **React Frontend**: A Vite-powered React application with TypeScript that provides the user interface
2. **Main Server**: Express server that serves the static React build and handles basic routing
3. **Proxy Server**: Separate Express server that handles API calls to external services

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  React Frontend │◄────►│   Main Server   │◄────►│  Proxy Server   │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
                                                          ▼
                                               ┌─────────────────────┐
                                               │                     │
                                               │  External Services  │
                                               │  (Gemini API, etc.) │
                                               │                     │
                                               └─────────────────────┘
```

## Frontend Architecture

The frontend is built with React and follows a component-based architecture:

- **src/api**: API integration modules
- **src/components**: Reusable UI components
- **src/pages**: Page-level components
- **src/utils**: Utility functions
- **src/styles**: CSS styles
- **src/theme**: Theming system
- **src/new-chat-interface**: Modern chat interface implementation

### Key Components

1. **Chat System**: Multiple chat interface implementations
2. **Theme System**: Dark/light mode theming support
3. **API Integration**: Client-side API integration with caching

## Backend Architecture

The backend consists of two server processes:

### Main Server (main.js)

- Serves the static React build
- Handles basic routing
- Provides API endpoints for static data

### Proxy Server (proxy.js)

- Handles requests to external APIs
- Implements caching and rate limiting
- Provides error handling and logging

## Data Flow

1. User interacts with React frontend
2. Frontend makes API requests to Main Server
3. For external API requests, Main Server proxies to Proxy Server
4. Proxy Server communicates with external services
5. Responses flow back through the chain

## Caching Strategy

The application implements a multi-level caching strategy:

1. **Browser Cache**: HTTP caching with appropriate headers
2. **Client-side Cache**: IndexedDB for frontend persistence
3. **Memory Cache**: In-memory caching on the server
4. **Response Caching**: Caching API responses with TTL

## Error Handling

Error handling is implemented at multiple levels:

1. **Frontend Error Boundaries**: React error boundaries for UI resilience
2. **API Error Handling**: Standardized error responses
3. **Fallback Content**: Graceful degradation with fallback content
4. **Server Error Handling**: Robust server-side error handling

## Deployment Architecture

In production, the application is deployed with:

1. **Nginx**: Reverse proxy for routing and SSL
2. **PM2**: Process management for Node.js servers
3. **Let's Encrypt**: SSL certificate management