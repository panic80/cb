# Dev Environment Guide

## Commands
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npx vitest path/to/test.js` - Run single test file
- `npx vitest -t "test name pattern"` - Run tests matching pattern
- `npm run test:coverage` - Run tests with coverage

## Code Style
- **Imports**: React first, third-party libs, then local modules
- **Components**: Functional with TypeScript (React.FC<Props>)
- **Naming**: PascalCase (components), camelCase (functions/variables)
- **Styling**: Mix of CSS modules and Tailwind
- **Types**: Explicit interfaces for all props and API responses
- **Error Handling**: Try/catch with fallbacks, comprehensive logging
- **Testing**: Vitest + React Testing Library

## Architecture
- React frontend with TypeScript
- API communication in src/api
- New chat interface in src/new-chat-interface
- Component organization by feature/use case
- Context API for state management
- Custom error handling via ChatError class