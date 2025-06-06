import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Basic IndexedDB mock (tests will override with their own detailed mocks)
if (!global.indexedDB) {
  global.indexedDB = {
    open: vi.fn(),
    deleteDatabase: vi.fn(),
    cmp: vi.fn()
  };
}

// Mock fetch only if not already mocked (tests will set their own)
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock browser APIs that are not available in the test environment
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// Mock env variables
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn()
}));

// Mock the import.meta.env
vi.stubGlobal('import.meta', {
  env: {
    VITE_GEMINI_API_KEY: 'test-api-key',
    DEV: true
  }
});