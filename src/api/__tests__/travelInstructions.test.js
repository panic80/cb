import { vi, describe, it, expect, beforeEach } from "vitest";

import {
  CACHE_CONFIG,
  DEFAULT_INSTRUCTIONS,
  initDB,
  getCachedData,
  setCachedData,
  fetchWithRetry,
  processApiResponse,
  fetchTravelInstructions,
  resetState,
  getMemoryCache,
  getMemoryCacheTimestamp,
  setMemoryCache
} from "../travelInstructions";

// Mock fetch globally

// Mock fetch globally
global.fetch = vi.fn();

describe("travelInstructions", () => {
  beforeEach(async () => {
    // Reset all caches and mocks
    global.fetch.mockClear();
    resetState();

    // Initialize fresh IndexedDB for each test
    const db = await initDB();
    const tx = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
    const store = tx.objectStore(CACHE_CONFIG.STORE_NAME);
    await store.clear(); // Clear any existing data

    // Setup default fetch mock
    global.fetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue("application/json"),
      },
      json: vi.fn().mockResolvedValue({ content: "Test Content" }),
      text: vi.fn().mockResolvedValue("Test Content"),
      clone: vi.fn().mockImplementation(function () {
        return this;
      }),
    });
// Wait for all transactions to complete and add error handling
await new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => {
    console.error('Transaction failed:', tx.error);
    resolve(); // Resolve anyway to prevent test hanging
  };
});
});


  describe("initDB", () => {
    it("should initialize IndexedDB and return a promise", async () => {
      const db = await initDB();
      expect(db).toBeDefined();
      expect(db.objectStoreNames.contains(CACHE_CONFIG.STORE_NAME)).toBe(true);
    });
  });

  describe("getCachedData", () => {
    it("should return cached data if valid", async () => {
      const testData = "Test cached content";
      const db = await initDB();
      const tx = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_CONFIG.STORE_NAME);
      await store.put({
        content: testData,
        timestamp: Date.now(),
      }, CACHE_CONFIG.CACHE_KEY);

      const result = await getCachedData();
      expect(result).toBe(testData);
    });

    it("should return null if cache is expired", async () => {
      const db = await initDB();
      const tx = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_CONFIG.STORE_NAME);
      await store.put({
        content: "Expired content",
        timestamp: Date.now() - (CACHE_CONFIG.CACHE_DURATION + 1000),
      }, CACHE_CONFIG.CACHE_KEY);

      const result = await getCachedData();
      expect(result).toBeNull();
    });
  });

  describe("setCachedData", () => {
    it("should store data in IndexedDB", async () => {
      const content = "New Content";
      await setCachedData(content);
      
      const db = await initDB();
      const tx = db.transaction(CACHE_CONFIG.STORE_NAME, "readonly");
      const store = tx.objectStore(CACHE_CONFIG.STORE_NAME);
      const getRequest = store.get(CACHE_CONFIG.CACHE_KEY);
      
      const data = await new Promise((resolve, reject) => {
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(getRequest.error);
      });
      
      // Wait for transaction to complete
      await new Promise(resolve => tx.oncomplete = resolve);
      
      expect(data.content).toBe(content);
    });
  });

  describe("fetchWithRetry", () => {
    it("should return response if fetch is successful", async () => {
      const mockResponse = { ok: true, data: "test" };
      global.fetch.mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry("/test-url");
      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("should retry if fetch fails", async () => {
      console.log("[TEST] Setting up retry test");
      vi.useFakeTimers();
      
      let fetchCallCount = 0;
      global.fetch.mockImplementation(() => {
        fetchCallCount++;
        console.log(`[TEST] Fetch attempt ${fetchCallCount}`);
        if (fetchCallCount <= 2) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({ ok: true, data: "test" });
      });

      console.log("[TEST] Starting fetchWithRetry");
      const resultPromise = fetchWithRetry("/test-url", 3);
      
      console.log("[TEST] Beginning timer progression");
      for (let i = 0; i < 3; i++) {
        console.log(`[TEST] Running timers iteration ${i + 1}`);
        await vi.runAllTimersAsync();
        console.log(`[TEST] Completed timers iteration ${i + 1}`);
      }

      console.log("[TEST] Awaiting final result");
      const result = await resultPromise;
      console.log("[TEST] Received result:", result);
      
      expect(result).toEqual({ ok: true, data: "test" });
      expect(fetchCallCount).toBe(3);
      
      vi.useRealTimers();
      console.log("[TEST] Test completed");
    });
  });

  describe("processApiResponse", () => {
    it("should process JSON response correctly", async () => {
      const mockResponse = {
        headers: { get: vi.fn().mockReturnValue("application/json") },
        json: vi.fn().mockResolvedValue({ content: "Test Content" }),
        clone: vi.fn().mockImplementation(function () { return this; }),
      };

      const result = await processApiResponse(mockResponse);
      expect(result).toBe("Test Content");
    });

    it("should return default instructions for non-JSON responses", async () => {
      const mockResponse = {
        headers: { get: vi.fn().mockReturnValue("text/html") },
        text: vi.fn().mockResolvedValue("<html>Not JSON</html>"),
        clone: vi.fn().mockImplementation(function () { return this; }),
      };

      const result = await processApiResponse(mockResponse);
      expect(result).toBe(DEFAULT_INSTRUCTIONS);
    });
  });

  describe("fetchTravelInstructions", () => {
    it("should return memory cache if available and not expired", async () => {
      console.log("[TEST] Setting up memory cache test");
      
      // Reset state first
      resetState();
      // Set module cache using the exported function
      setMemoryCache("Memory Cache Test");
      
      console.log("[TEST] After setting cache - module:", getMemoryCache());
      
      // Wait for any pending operations
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const result = await fetchTravelInstructions();
      console.log("[TEST] Fetch result:", result);
      
      expect(result).toBe("Memory Cache Test");
      expect(getMemoryCache()).toBe("Memory Cache Test");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should fetch from IndexedDB if memory cache is not available", async () => {
      // Reset state and wait for any pending operations
      resetState();
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Set up IndexedDB cache
      const db = await initDB();
      const tx = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_CONFIG.STORE_NAME);
      const putRequest = store.put({
        content: "IndexedDB Cache Test",
        timestamp: Date.now(),
      }, CACHE_CONFIG.CACHE_KEY);
      
      // Wait for transaction to complete
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      const result = await fetchTravelInstructions();
      expect(result).toBe("IndexedDB Cache Test");
      expect(global.fetch).not.toHaveBeenCalled();
    });
    it("should fetch from API if no cache is available", async () => {
      console.log("[TEST] Setting up API fetch test");
      
      // Reset state and wait for any pending operations
      resetState();
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Clear IndexedDB
      const db = await initDB();
      const clearTx = db.transaction(CACHE_CONFIG.STORE_NAME, "readwrite");
      const store = clearTx.objectStore(CACHE_CONFIG.STORE_NAME);
      await store.clear();
      await new Promise(resolve => clearTx.oncomplete = resolve);
      
      const mockResponse = {
        ok: true,
        headers: { get: vi.fn().mockReturnValue("application/json") },
        json: vi.fn().mockResolvedValue({ content: "API Content" }),
        clone: vi.fn().mockImplementation(function () { return this; }),
      };
      
      console.log("[TEST] Mock response setup:", mockResponse);
      global.fetch.mockResolvedValueOnce(mockResponse);

      console.log("[TEST] Calling fetchTravelInstructions");
      const result = await fetchTravelInstructions();
      console.log("[TEST] Received result:", result);
      
      expect(result).toBe("API Content");
      expect(global.fetch).toHaveBeenCalledWith("/api/travel-instructions", expect.any(Object));
      
      console.log("[TEST] Test completed");
    });
  });
});
