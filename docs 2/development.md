# Development Guide

This guide provides instructions for setting up your development environment and working with the codebase.

## Prerequisites

- Node.js 18 or later
- npm 8 or later
- Git

## Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/your-repo.git
cd your-repo
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```
VITE_GEMINI_API_KEY=your-api-key-here
NODE_ENV=development
```

4. **Start the development server**

```bash
npm run dev
```

This will start:
- The main server on port 3000
- The proxy server on port 3001
- The Vite development server with HMR

## Project Structure

The project follows this structure:

```
├── ecosystem.config.cjs   # PM2 configuration
├── index.html             # Main HTML template
├── package.json           # Project dependencies and scripts
├── public_html/           # Static files for main landing page
├── server/                # Server-side code
│   ├── main.js            # Main Express server
│   ├── proxy.js           # Proxy server for API requests
│   └── travelData.js      # Default travel data
├── src/                   # Frontend source code
│   ├── api/               # API integration
│   ├── components/        # UI components
│   ├── pages/             # Page components
│   ├── utils/             # Utility functions
│   ├── styles/            # CSS styles
│   ├── theme/             # Theming system
│   ├── new-chat-interface/ # Modern chat interface
│   ├── App.jsx            # Main React component
│   └── main.jsx           # React application entry point
└── vite.config.js         # Vite configuration
```

## Development Workflow

### Running the Application

```bash
# Start development servers
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Style and Linting

The project uses ESLint and Prettier for code style:

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Working with the API

### Gemini API Integration

The application interfaces with Google's Gemini API for AI capabilities:

1. **Local Development**: Uses proxy server for API calls
2. **Production**: Uses direct SDK integration

The main integration points:

- `src/api/gemini.jsx`: Client-side integration
- `server/proxy.js`: Server-side proxy for API calls

### API Key Management

For security, API keys are managed using environment variables:

- Development: `.env` file (not committed to Git)
- Production: Set in the deployment environment

## Component Development

### Chat Interface

The application has multiple chat interface implementations:

1. **Legacy Chat**: `src/components/ChatWindow.jsx`
2. **Modern Chat**: `src/components/modern/ModernChatWindow.tsx`
3. **New Interface**: `src/new-chat-interface/`

When enhancing the chat, focus on the new interface in `src/new-chat-interface/`.

### Theming System

The application uses a theme context for dark/light mode:

- `src/theme/ThemeContext.tsx`: Theme provider
- `src/theme/theme.css`: Theme variables

To add theme support to new components, use CSS variables defined in `theme.css`.

## Adding New Features

When adding new features:

1. **Plan**: Understand the feature requirements
2. **Test**: Write tests for the new functionality
3. **Implement**: Build the feature with proper error handling
4. **Document**: Update documentation as needed
5. **Review**: Ensure code quality and test coverage

## Troubleshooting Development Issues

### API Connection Issues

If you encounter issues connecting to the Gemini API:

1. Verify your API key in `.env`
2. Check browser console for errors
3. Ensure the proxy server is running (port 3001)

### Build Problems

If the build fails:

1. Check for TypeScript errors
2. Ensure all dependencies are installed
3. Verify imports and exports

### Server Issues

If the server won't start:

1. Check if ports 3000/3001 are already in use
2. Verify environment variables
3. Check server logs for errors

## Best Practices

1. **Error Handling**: Always implement proper error handling
2. **Type Safety**: Use TypeScript for new components
3. **Testing**: Write tests for all new functionality
4. **Accessibility**: Ensure components are accessible
5. **Performance**: Be mindful of performance implications