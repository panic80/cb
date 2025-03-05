# Testing Guide

This guide outlines the testing strategy and provides instructions for running and writing tests.

## Testing Philosophy

This project follows a comprehensive testing approach with:

1. **Unit Tests**: Testing individual functions and components in isolation
2. **Integration Tests**: Testing how components work together
3. **API Tests**: Verifying API integrations work correctly
4. **Edge Case Tests**: Ensuring the application handles unusual inputs and conditions

## Testing Stack

The project uses these testing tools:

- **Vitest**: Main test runner, with Jest compatibility
- **React Testing Library**: Testing React components
- **Happy DOM**: DOM implementation for testing
- **Mock Service Worker (MSW)**: API mocking

## Running Tests

### Basic Commands

```bash
# Run all tests
npm run test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run a specific test file
npx vitest src/api/__tests__/gemini.test.jsx

# Run tests matching a pattern
npx vitest -t "should handle rate limiting"
```

### Testing in CI/CD

Tests are automatically run in the CI/CD pipeline on pull requests and pushes to the main branch.

## Writing Tests

### Component Tests

For React components, create test files in a `__tests__` directory next to the component:

```jsx
// src/components/__tests__/ChatInput.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatInput from '../ChatInput';

describe('ChatInput', () => {
  it('renders input field', () => {
    render(<ChatInput onSend={() => {}} />);
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
  });

  it('handles input change', () => {
    render(<ChatInput onSend={() => {}} />);
    const input = screen.getByPlaceholderText('Type your message...');
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(input.value).toBe('Hello');
  });
});
```

### API Tests

For API integrations, focus on response handling and error cases:

```jsx
// src/api/__tests__/gemini.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendToGemini } from '../gemini';

// Mock external dependencies
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn().mockResolvedValue({
        response: { text: vi.fn().mockReturnValue('Test response') }
      })
    }))
  }))
}));

describe('Gemini API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sends request to Gemini API', async () => {
    const result = await sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('sources');
  });

  // Test error cases, etc.
});
```

### Edge Case Tests

Always include tests for edge cases and error handling:

```jsx
describe('Error handling', () => {
  it('handles network errors gracefully', async () => {
    // Mock a network error
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    // Should use fallback content
    const result = await sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions', true);
    
    expect(result.fallback).toBe(true);
    expect(result.text).toContain('Unable to generate response');
  });
});
```

## Testing Patterns

### Testing Asynchronous Code

Use `async/await` for testing asynchronous code:

```jsx
it('fetches data asynchronously', async () => {
  const data = await fetchData();
  expect(data).toHaveProperty('results');
});
```

### Testing Error Conditions

Always test error conditions:

```jsx
it('handles errors when API fails', async () => {
  // Mock the failure
  mockFetch.mockRejectedValueOnce(new Error('API error'));
  
  // Verify error handling behavior
  await expect(fetchData()).rejects.toThrow('API error');
});
```

### Mocking External Dependencies

Use `vi.mock()` to mock external dependencies:

```jsx
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { result: 'mocked data' } })
  }
}));
```

## Test Organization

Organize tests logically:

```jsx
describe('Component name', () => {
  describe('Rendering', () => {
    // Tests for rendering behavior
  });
  
  describe('Interactivity', () => {
    // Tests for user interactions
  });
  
  describe('Error states', () => {
    // Tests for error handling
  });
});
```

## Testing Strategy by Component Type

### UI Components

Focus on:
- Correct rendering
- User interactions
- Accessibility
- Responsiveness

### API Integrations

Focus on:
- Successful requests/responses
- Error handling
- Retries and fallbacks
- Cache behavior

### Utility Functions

Focus on:
- Input/output correctness
- Edge cases
- Performance (when relevant)

## Coverage Goals

Aim for:
- 80%+ overall test coverage
- 90%+ coverage for critical paths
- 100% coverage for error handling logic