# Project Documentation

Welcome to the official documentation for the Canadian Forces Travel Instructions Chatbot.

## Overview

This application provides an AI-powered chatbot interface for querying information from the Canadian Forces Travel Instructions. The system uses Google's Gemini LLM models to provide accurate answers to user queries, with a focus on security, reliability, and user experience.

## Table of Contents

1. [Architecture](./architecture.md)
2. [API Integration](./api-integration.md)
3. [Deployment Guide](./deployment.md)
4. [Development Guide](./development.md)
5. [Testing](./testing.md)
6. [Security](./security.md)
7. [Troubleshooting](./troubleshooting.md)

## Quick Start

To run this application in development mode:

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

To build for production:

```bash
npm run build
```

## Environment Setup

This application uses environment variables for configuration, particularly for sensitive data like API keys. To set up your local environment:

1.  **Locate the example file:** In the project root directory, you'll find a file named `.env.example`.
2.  **Create your environment file:** Make a copy of `.env.example` and rename the copy to `.env`. This `.env` file is already listed in `.gitignore`, ensuring your secrets are not accidentally committed.
3.  **Set the API Key:** Open the `.env` file and replace the placeholder `YOUR_GOOGLE_AI_API_KEY_HERE` with your actual Google Gemini API key. This key is essential for the chatbot server functionality.

Example `.env` content:
```dotenv
# Required for AI Chatbot functionality
GEMINI_API_KEY=YOUR_GOOGLE_AI_API_KEY_HERE

# Optional server configuration (defaults may apply if not set)
# PORT=3000
# PROXY_PORT=3001
# NODE_ENV=development
```

## License

This software is proprietary and confidential.

## Contact

For questions or support, please contact your system administrator or IT department.