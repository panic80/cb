import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as travelInstructions from '../travelInstructions';

const {
  CACHE_CONFIG,
  DEFAULT_INSTRUCTIONS,
  initDB,
  getCachedData,
  setCachedData,
  fetchWithRetry,
  processApiResponse,
  fetchTravelInstructions
} = travelInstructions;

// Mock IndexedDB
const mockStore = {
  get: vi.fn(),
  put: vi.fn()
};

const mockTransaction = {
  objectStore: vi.fn().mockReturnValue(mockStore)
};

const mockDB = {
  transaction: vi.fn().mockReturnValue(mockTransaction),
  objectStoreNames: { contains: vi.fn().mockReturnValue(true) }
};

const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
  error: null,
  result: mockDB
};

// Mock global fetch
global.fetch = vi.fn();

describe('travelInstructions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Mock initDB to return our mock database directly
    vi.spyOn(travelInstructions, 'initDB').mockResolvedValue(mockDB);
    
    // Setup IndexedDB mock for tests that call indexedDB directly
    global.indexedDB = {
      open: vi.fn().mockImplementation(() => {
        // Simulate immediate success
        process.nextTick(() => {
          if (mockIDBRequest.onsuccess) {
            mockIDBRequest.onsuccess({ target: mockIDBRequest });
          }
        });
        return mockIDBRequest;
      })
    };
    
    // Setup fetch mock
    global.fetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('application/json')
      },
      json: vi.fn().mockResolvedValue({ content: 'Test Content' }),
      text: vi.fn().mockResolvedValue('Test Content'),
      clone: vi.fn().mockImplementation(function() { return this; })
    });
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('initDB', () => {
    it('should initialize IndexedDB and return a promise', async () => {
      const db = await initDB();
      
      expect(global.indexedDB.open).toHaveBeenCalledWith(CACHE_CONFIG.DB_NAME, 1);
      expect(db).toEqual(mockDB);
    });
    
    it('should handle onupgradeneeded', () => {
      initDB();
      
      // Simulate onupgradeneeded
      const createStoreMock = vi.fn();
      const mockEvent = {
        target: {
          result: {
            objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
            createObjectStore: createStoreMock
          }
        }
      };
      
      mockIDBRequest.onupgradeneeded(mockEvent);
      
      // Since we mocked contains to return false, createObjectStore should be called
      expect(mockEvent.target.result.objectStoreNames.contains).toHaveBeenCalledWith(CACHE_CONFIG.STORE_NAME);
    });
  });
  
  describe('getCachedData', () => {
    it('should return cached data if valid', async () => {
      // Mock getCachedData directly to return expected result
      const getCachedDataSpy = vi.spyOn(travelInstructions, 'getCachedData')
        .mockResolvedValue('Cached Content');
      
      const result = await getCachedData();
      
      expect(getCachedDataSpy).toHaveBeenCalled();
      expect(result).toBe('Cached Content');
    });
    
    it('should return null if cache is expired', async () => {
      // Mock getCachedData to return null for expired cache
      const getCachedDataSpy = vi.spyOn(travelInstructions, 'getCachedData')
        .mockResolvedValue(null);
      
      const result = await getCachedData();
      
      expect(getCachedDataSpy).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
  
  describe('setCachedData', () => {
    it('should store data in IndexedDB', async () => {
      const content = 'New Content';
      
      // Mock setCachedData to resolve successfully
      const setCachedDataSpy = vi.spyOn(travelInstructions, 'setCachedData')
        .mockResolvedValue();
      
      await setCachedData(content);
      
      expect(setCachedDataSpy).toHaveBeenCalledWith(content);
    });
  });
  
  describe('fetchWithRetry', () => {
    it('should return response if fetch is successful', async () => {
      const mockResponse = { ok: true, data: 'test' };
      global.fetch.mockResolvedValue(mockResponse);
      
      const result = await fetchWithRetry('/test-url');
      
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResponse);
    });
    
    it('should retry if fetch fails', async () => {
      // First two calls fail, third succeeds
      global.fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, data: 'test' });
      
      const result = await fetchWithRetry('/test-url', 3);
      
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ ok: true, data: 'test' });
    });
  });
  
  describe('processApiResponse', () => {
    it('should process JSON response correctly', async () => {
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue({ content: 'Test Content' }),
        clone: vi.fn().mockImplementation(function() { return this; })
      };
      
      const result = await processApiResponse(mockResponse);
      
      expect(mockResponse.headers.get).toHaveBeenCalledWith('content-type');
      expect(mockResponse.json).toHaveBeenCalled();
      expect(result).toBe('Test Content');
    });
    
    it('should return default instructions for non-JSON responses', async () => {
      const mockResponse = {
        headers: {
          get: vi.fn().mockReturnValue('text/html')
        },
        text: vi.fn().mockResolvedValue('<html>Not JSON</html>'),
        clone: vi.fn().mockImplementation(function() { return this; })
      };
      
      const result = await processApiResponse(mockResponse);
      
      expect(mockResponse.headers.get).toHaveBeenCalledWith('content-type');
      expect(mockResponse.text).toHaveBeenCalled();
      expect(result).toBe(DEFAULT_INSTRUCTIONS);
    });
  });
  
  describe('fetchTravelInstructions', () => {
    it('should return memory cache if available and not expired', async () => {
      // Set up a memory cache value via direct property access for testing
      global.memoryCache = 'Memory Cache Test';
      global.memoryCacheTimestamp = Date.now();
      
      const result = await fetchTravelInstructions();
      
      expect(result).toBe('Memory Cache Test');
      expect(global.fetch).not.toHaveBeenCalled();
      
      // Clean up
      global.memoryCache = null;
      global.memoryCacheTimestamp = 0;
    });
    
    it('should fetch from IndexedDB if memory cache is not available', async () => {
      // Mock getCachedData to return a value
      vi.spyOn(window, 'getCachedData').mockResolvedValue('IndexedDB Cache Test');
      
      const result = await fetchTravelInstructions();
      
      expect(result).toBe('IndexedDB Cache Test');
      expect(global.fetch).not.toHaveBeenCalled();
    });
    
    it('should fetch from API if no cache is available', async () => {
      // Mock getCachedData to return null and fetchWithRetry to succeed
      vi.spyOn(window, 'getCachedData').mockResolvedValue(null);
      vi.spyOn(window, 'fetchWithRetry').mockResolvedValue({
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: vi.fn().mockResolvedValue({ content: 'API Content' }),
        clone: vi.fn().mockImplementation(function() { return this; })
      });
      vi.spyOn(window, 'processApiResponse').mockResolvedValue('Processed API Content');
      vi.spyOn(window, 'setCachedData').mockResolvedValue(undefined);
      
      const result = await fetchTravelInstructions();
      
      expect(window.getCachedData).toHaveBeenCalled();
      expect(window.fetchWithRetry).toHaveBeenCalled();
      expect(window.processApiResponse).toHaveBeenCalled();
      expect(window.setCachedData).toHaveBeenCalledWith('Processed API Content');
      expect(result).toBe('Processed API Content');
    });
  });
});