import '@testing-library/jest-dom';

// Extend Vitest's expect interface with jest-dom matchers


import "fake-indexeddb/auto";
import { vi } from "vitest";
import { TextEncoder, TextDecoder } from "util";

// Set up missing browser APIs
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Set up memory cache related globals
global.memoryCache = null;
global.memoryCacheTimestamp = 0;

// Clear fake IndexedDB between tests
beforeEach(() => {
  indexedDB = new IDBFactory();
});

// Reset all mocks and clear memory cache between tests
afterEach(() => {
  vi.resetAllMocks();
  global.memoryCache = null;
  global.memoryCacheTimestamp = 0;
});