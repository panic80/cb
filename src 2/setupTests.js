import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the indexedDB
const mockIndexedDB = {
  open: vi.fn().mockReturnValue({
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null
  })
};

// Mock the globalThis.indexedDB
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

// Mock fetch API
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({}),
  text: vi.fn().mockResolvedValue(''),
  clone: vi.fn().mockImplementation(function() { return this; })
});

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