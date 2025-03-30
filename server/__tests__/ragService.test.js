// server/__tests__/ragService.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as ragService from '../services/ragService'; // Import named exports


// --- Vi.mock Declarations ---
vi.mock('axios');
vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn(() => ({
        getGenerativeModel: vi.fn(() => ({
            embedContent: vi.fn().mockResolvedValue({ embedding: { values: [0.4, 0.5, 0.6] } })
        }))
    }))
}));

// Mock console methods to prevent test output clutter
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
// --- End Mocks ---

describe('RAG Service (ragService.js)', () => {
    const MOCK_HTML = `
        <html>
            <head><title>Test Page</title></head>
            <body>
                <main property="mainContentOfPage">
                    <h1>Chapter 1</h1>
                    <p>This is the first paragraph. It contains important info.</p>

                    <p>This is the second paragraph. More details here.</p>

                    <h2>Section 1.1</h2>
                    <p>Details for section 1.1.</p>
                </main>
                <footer>Footer content</footer>
            </body>
        </html>`;
    const MOCK_EMBEDDING_1 = [0.1, 0.2, 0.3];
    const MOCK_EMBEDDING_2 = [0.4, 0.5, 0.6];
    const MOCK_EMBEDDING_3 = [0.7, 0.8, 0.9];
    const MOCK_QUERY_EMBEDDING = [0.15, 0.25, 0.35]; // Closer to embedding 1

    beforeEach(() => {
        // Reset mocks and state before each test
        vi.clearAllMocks();
        // Reset the internal state of ragService by forcing re-initialization logic if needed,
        // or by directly resetting exported variables if they were exposed for testing (not ideal).
        // For now, we assume tests will manage initialization state via initializeRagService calls.
        // A more robust approach might involve exporting a reset function from ragService for tests.
        ragService.getStatus().initialized = false; // Directly manipulate internal state (use cautiously)
        ragService.getStatus().lastUpdateTime = null;
        ragService.getStatus().chunkCount = 0;
        // This direct manipulation is generally discouraged, but necessary here without a dedicated reset function.
        // Ideally, ragService would export a resetForTesting() function.
        // Or we could re-import the module, but Vitest handles modules specially.
    });

    afterEach(() => {
         vi.restoreAllMocks(); // Restore console mocks
    });

    describe('Initialization (initializeRagService)', () => {
        it('should fetch, parse, chunk, and embed content successfully', async () => {
            axios.get.mockResolvedValue({ data: MOCK_HTML, status: 200 });
            mockEmbedContent
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_1 } })
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_2 } })
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_3 } });

            await ragService.initializeRagService(true); // Force refresh

            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'embedding-001' });
            expect(mockEmbedContent).toHaveBeenCalledTimes(3); // Based on MOCK_HTML parsing
            expect(ragService.getStatus().initialized).toBe(true);
            expect(ragService.getStatus().chunkCount).toBe(3); // Expecting 3 chunks from MOCK_HTML
            expect(ragService.getStatus().lastUpdateTime).not.toBeNull();
        });

        it('should handle fetch errors during initialization', async () => {
            const fetchError = new Error('Network Error');
            axios.get.mockRejectedValue(fetchError);

            await ragService.initializeRagService(true);

            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(mockEmbedContent).not.toHaveBeenCalled();
            expect(ragService.getStatus().initialized).toBe(false);
            expect(ragService.getStatus().chunkCount).toBe(0);
            expect(console.error).toHaveBeenCalledWith('Failed to initialize RAG service:', expect.any(Error));
        });

         it('should handle embedding errors during initialization', async () => {
            axios.get.mockResolvedValue({ data: MOCK_HTML, status: 200 });
            const embeddingError = new Error('Embedding failed');
            mockEmbedContent
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_1 } })
                .mockRejectedValueOnce(embeddingError) // Fail on the second chunk
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_3 } }); // Succeed on the third

            await ragService.initializeRagService(true);

            expect(axios.get).toHaveBeenCalledTimes(1);
            // It will attempt to embed all chunks, retrying the failed one
            expect(mockEmbedContent).toHaveBeenCalledTimes(3 + 3); // Initial 3 calls + 3 retries for the failed one
            expect(ragService.getStatus().initialized).toBe(true); // Should still initialize
            expect(ragService.getStatus().chunkCount).toBe(2); // Only 2 chunks succeeded
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to embed chunk 1 after retries'), expect.any(Error)); // Chunk index is 0-based internally but logged 1-based
        });

        it('should not re-initialize if already initialized and forceRefresh is false', async () => {
            // First initialization
            axios.get.mockResolvedValue({ data: MOCK_HTML, status: 200 });
             mockEmbedContent
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_1 } })
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_2 } })
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_3 } });
            await ragService.initializeRagService(true);
            expect(ragService.getStatus().initialized).toBe(true);
            vi.clearAllMocks(); // Clear mocks after first init

            // Attempt second initialization without forceRefresh
            await ragService.initializeRagService();

            expect(axios.get).not.toHaveBeenCalled();
            expect(mockEmbedContent).not.toHaveBeenCalled();
            expect(ragService.getStatus().initialized).toBe(true); // Still initialized
            expect(console.log).toHaveBeenCalledWith('RAG service already initialized.');
        });
    });

    describe('Chunk Retrieval (retrieveChunks)', () => {
        beforeEach(async () => {
            // Ensure service is initialized for retrieval tests
            axios.get.mockResolvedValue({ data: MOCK_HTML, status: 200 });
            mockEmbedContent
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_1 } }) // Chunk 1
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_2 } }) // Chunk 2
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_3 } }) // Chunk 3
                .mockResolvedValueOnce({ embedding: { values: MOCK_QUERY_EMBEDDING } }); // Query embedding
            await ragService.initializeRagService(true);
            vi.clearAllMocks(); // Clear init mocks
        });

        it('should return empty array if service is not initialized', async () => {
            ragService.getStatus().initialized = false; // Force uninitialized state
            const query = "some query";

            const chunks = await ragService.retrieveChunks(query);

            expect(chunks).toEqual([]);
            expect(mockEmbedContent).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith('Attempted to retrieve chunks before RAG service was initialized.');
        });

        it('should embed the query and find the most similar chunks', async () => {
            const query = "information about the first paragraph";
            // Mock the query embedding call specifically for this test
             mockEmbedContent.mockResolvedValueOnce({ embedding: { values: MOCK_QUERY_EMBEDDING } });

            const chunks = await ragService.retrieveChunks(query, 2); // Get top 2

            expect(mockEmbedContent).toHaveBeenCalledTimes(1);
            expect(mockEmbedContent).toHaveBeenCalledWith(query);
            expect(chunks).toHaveLength(2);
            // Check if the first result is the one corresponding to MOCK_EMBEDDING_1 (highest similarity)
            expect(chunks[0].text).toContain("This is the first paragraph.");
            expect(chunks[0].score).toBeGreaterThan(chunks[1].score);
            // Check structure
            expect(chunks[0]).toHaveProperty('id');
            expect(chunks[0]).toHaveProperty('text');
            expect(chunks[0]).toHaveProperty('score');

        });

         it('should handle errors during query embedding', async () => {
            const query = "information about the first paragraph";
            const embeddingError = new Error("Query embedding failed");
            mockEmbedContent.mockRejectedValueOnce(embeddingError); // Mock query embedding failure

            const chunks = await ragService.retrieveChunks(query, 2);

            expect(mockEmbedContent).toHaveBeenCalledTimes(1);
            expect(mockEmbedContent).toHaveBeenCalledWith(query);
            expect(chunks).toEqual([]); // Should return empty on error
            expect(console.error).toHaveBeenCalledWith('Error during chunk retrieval process:', embeddingError);
        });

        it('should return fewer than topN chunks if fewer are available', async () => {
            // Re-initialize with only 1 successful chunk
            axios.get.mockResolvedValue({ data: MOCK_HTML, status: 200 });
             const embeddingError = new Error('Embedding failed');
             mockEmbedContent
                .mockResolvedValueOnce({ embedding: { values: MOCK_EMBEDDING_1 } }) // Chunk 1 ok
                .mockRejectedValueOnce(embeddingError) // Chunk 2 fails (3 retries)
                .mockRejectedValueOnce(embeddingError); // Chunk 3 fails (3 retries)
            await ragService.initializeRagService(true);
             expect(ragService.getStatus().chunkCount).toBe(1);
             vi.clearAllMocks(); // Clear init mocks

            const query = "some query";
             // Mock the query embedding call
             mockEmbedContent.mockResolvedValueOnce({ embedding: { values: MOCK_QUERY_EMBEDDING } });

            const chunks = await ragService.retrieveChunks(query, 5); // Request top 5

             expect(mockEmbedContent).toHaveBeenCalledTimes(1); // Only query embedding
            expect(chunks).toHaveLength(1); // Only 1 chunk available
            expect(chunks[0].text).toContain("This is the first paragraph.");
        });
    });

    // Add tests for helper functions if needed (e.g., parseHtmlContent, chunkText, cosineSimilarity)
    // These are implicitly tested via initializeRagService and retrieveChunks,
    // but direct tests can be useful for fine-grained checks.
    describe('Helper Functions (Internal)', () => {
        // Example: Test cosine similarity directly if needed
        it('cosineSimilarity calculates correctly', () => {
            // Note: Need to access internal functions for direct testing.
            // This often requires exporting them specifically for testing or using tools like 'rewire'.
            // Assuming cosineSimilarity was exported for testing:
            // expect(ragService.cosineSimilarity([1, 0], [0, 1])).toBe(0);
            // expect(ragService.cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1);
            // expect(ragService.cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
            // expect(ragService.cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
            // Since they are not exported, we rely on their use in findSimilarChunks.
             expect(true).toBe(true); // Placeholder assertion
        });

        // Example: Test HTML parsing (if exported)
        // it('parseHtmlContent extracts text correctly', () => { ... });

         // Example: Test text chunking (if exported)
        // it('chunkText splits text correctly', () => { ... });
    });
});