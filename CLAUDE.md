# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- `npm run dev` - Start development server (proxy + Vite frontend on port 3001)
- `npm run build` - Production build
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npx vitest path/to/test.js` - Run single test file
- `npx vitest -t "test name pattern"` - Run tests matching pattern
- `npm run proxy` - Start proxy server only
- `npm run start` - Start main server only
- `./start-servers.sh` - Start both servers manually

## Architecture

This is a Canadian Forces Travel Instructions Chatbot with a dual-server architecture:

### Frontend (React + TypeScript + Vite)
- **src/api**: Google Gemini API integration and question analysis
- **src/components**: UI components with multiple chat interface implementations
- **src/new-chat-interface**: Modern elite chat interface (self-contained)
- **src/pages**: Page-level components (Landing, FAQ, Privacy, etc.)
- **src/context**: Chat state management with React Context + Reducer
- **src/utils**: Chat utilities, URL parsing, error handling
- **src/theme**: Light/dark mode theming system

### Backend (Dual Express Servers)
- **Main Server** (`server/main.js`): Serves static build, basic routing
- **Proxy Server** (`server/proxy.js`): Handles external API calls (Gemini)
- **Logging**: Centralized logging in `server/services/logger.js`

### Key Integrations
- **Google Gemini LLM**: Primary AI service for chat responses
- **Travel Instructions Data**: Structured data in `server/travelData.js`
- **Multi-level Caching**: Browser, client-side (IndexedDB), memory, response caching

## Code Style
- **Imports**: React first, third-party libs, then local modules
- **Components**: Functional with TypeScript (React.FC<Props>)
- **Naming**: PascalCase (components), camelCase (functions/variables)
- **Styling**: Mix of CSS modules and Tailwind CSS
- **Types**: Explicit interfaces for all props and API responses
- **Error Handling**: Try/catch with fallbacks, comprehensive logging
- **Testing**: Vitest + React Testing Library + Happy DOM

## Environment Setup
Required environment variables:
```
VITE_GEMINI_API_KEY=your-api-key-here
PORT=3000
PROXY_PORT=3001
NODE_ENV=development
```

## Chat Interface Options
- **Legacy**: `src/components/ChatWindow.jsx` (original)
- **Modern**: `src/components/modern/ModernChatWindow.tsx` 
- **Elite**: `src/new-chat-interface/` (latest, self-contained with theme support)

## Production Deployment Issues & Solutions

### Critical PM2 Configuration Requirements
**Problem**: PM2 cluster mode (`instances: 'max'`) causes EADDRINUSE errors when multiple processes try to bind to the same port, leading to health check failures and deployment rollbacks.

**Solution**: Always use single instance fork mode in production:
```javascript
// ecosystem.config.cjs
{
  instances: 1,        // NOT 'max'
  exec_mode: 'fork'    // NOT 'cluster'
}
```

### Deployment Symlink Management
**Problem**: GitHub Actions deployment can create incorrect symlinks pointing to backup directories instead of latest releases, causing PM2 to serve stale code even after "successful" deployments.

**Solution**: 
1. Always use `pm2 restart` (not `pm2 reload`) when using symlinks
2. Verify symlink points to correct release directory before PM2 restart
3. Check that `current/dist/index.html` exists and is accessible

**Troubleshooting Commands**:
```bash
# Check PM2 status and logs
ssh root@46.202.177.230 'pm2 list && pm2 logs cf-travel-bot --lines 20'

# Verify symlink and directory structure  
ssh root@46.202.177.230 'ls -la /home/root/apps/cf-travel-bot/current && ls -la /home/root/apps/cf-travel-bot/current/dist/'

# Test health check locally on server
ssh root@46.202.177.230 'curl -f http://localhost:3000/health'
```

**Recovery Process**:
1. Use the automated fix script: `./scripts/fix-deployment.sh root 46.202.177.230 production`
2. Or manually fix:
   - Fix symlink: `ln -sfn /path/to/correct/release /home/root/apps/cf-travel-bot/current`
   - Update ecosystem.config.cjs if needed
   - PM2 restart: `pm2 delete cf-travel-bot && pm2 start ecosystem.config.cjs && pm2 save`