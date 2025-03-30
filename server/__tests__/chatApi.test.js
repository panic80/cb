// server/__tests__/chatApi.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../main.js'; // Import the exported app instance

// --- Vi.mock Declarations ---
vi.mock('../services/ragService.js', () => ({
    initializeRagService: vi.fn().mockResolvedValue(undefined),
    retrieveChunks: vi.fn(),
    getStatus: vi.fn(() => ({ initialized: true }))
}));

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn(() => ({
        getGenerativeModel: vi.fn(({ model }) => ({
            generateContent: vi.fn()
        }))
    }))
}));

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// App is now imported statically at the top

describe('/api/v2/chat Endpoint', () => {
    beforeEach(async () => {
        // Reset mocks before each test
        vi.clearAllMocks();

        // No need to dynamically import app anymore. It's imported statically.


        // Ensure the mock models are configured as expected by main.js
        mockGetGenerativeModel.mockImplementation(({ model }) => {
             if (model === 'gemini-1.5-flash') { // Model used in main.js for chat
                 return mockGenerativeModel;
             }
             // Add mocks for other models if main.js uses them (e.g., embedding model)
             return { embedContent: vi.fn() }; // Default mock for other models
        });
    });

     afterEach(() => {
        vi.restoreAllMocks(); // Restore console mocks
     });

    it('should return 400 if message is missing', async () => {
        const response = await request(app)
            .post('/api/v2/chat')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
        expect(response.body.message).toContain('Message must be a non-empty string');
        expect(mockRetrieveChunks).not.toHaveBeenCalled();
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return 400 if message is not a string', async () => {
        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: 123 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
         expect(response.body.message).toContain('Message must be a non-empty string');
        expect(mockRetrieveChunks).not.toHaveBeenCalled();
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return 400 if message is an empty string', async () => {
        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: '  ' }); // Whitespace only

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
         expect(response.body.message).toContain('Message must be a non-empty string');
        expect(mockRetrieveChunks).not.toHaveBeenCalled();
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return a successful response with generated reply', async () => {
        const userMessage = 'What are the travel allowances?';
        const mockContextChunks = [
            { id: 'c1', text: 'Travel allowances are covered in section 5.', score: 0.9 },
            { id: 'c2', text: 'Section 5 details meal rates.', score: 0.8 },
        ];
        const mockReply = 'Based on the instructions, travel allowances are detailed in section 5, which includes meal rates.';
        const mockApiResponse = { text: () => mockReply }; // Gemini API response structure

        mockRetrieveChunks.mockResolvedValue(mockContextChunks);
        mockGenerateContent.mockResolvedValue({ response: mockApiResponse });

        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: userMessage });

        expect(response.status).toBe(200);
        expect(response.body.reply).toBe(mockReply);
        expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
        expect(mockRetrieveChunks).toHaveBeenCalledWith(userMessage, 5); // Default topN is 5
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        // Verify the prompt structure if needed (can be complex)
        expect(mockGenerateContent).toHaveBeenCalledWith(expect.stringContaining(userMessage));
        expect(mockGenerateContent).toHaveBeenCalledWith(expect.stringContaining(mockContextChunks[0].text));
        expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-flash' });
    });

    it('should return fallback message if no relevant context is found', async () => {
        const userMessage = 'What is the airspeed velocity of an unladen swallow?';
        mockRetrieveChunks.mockResolvedValue([]); // No chunks found

        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: userMessage });

        expect(response.status).toBe(200); // Still a successful request handling
        expect(response.body.reply).toContain("couldn't find specific information");
        expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
        expect(mockRetrieveChunks).toHaveBeenCalledWith(userMessage, 5);
        expect(mockGenerateContent).not.toHaveBeenCalled(); // Should not call generator if no context
    });

    it('should return 500 if retrieveChunks fails', async () => {
        const userMessage = 'Tell me about benefits.';
        const retrieveError = new Error('RAG DB connection failed');
        mockRetrieveChunks.mockRejectedValue(retrieveError);

        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: userMessage });

        expect(response.status).toBe(500); // General internal server error
        expect(response.body.error).toBe('Internal Server Error');
        expect(response.body.message).toContain('Failed to generate chat response'); // Generic message from catch block
        expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

     // Specific test for the 503 RAG service initializing error case
     it('should return 503 if retrieveChunks indicates RAG service not initialized', async () => {
        const userMessage = 'Initialize test.';
        // Simulate the error message the handler specifically checks for
        const ragInitError = new Error('Error: RAG service not initialized');
        mockRetrieveChunks.mockRejectedValue(ragInitError);

        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: userMessage });

        // Expecting 503 based on the specific error handling in main.js
        expect(response.status).toBe(503);
        expect(response.body.error).toBe('Service Unavailable');
        expect(response.body.message).toContain('Chatbot context is still initializing');
        expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return 500 if the generative model fails', async () => {
        const userMessage = 'What are the travel rules?';
        const mockContextChunks = [
            { id: 'c1', text: 'General travel rules.', score: 0.9 }
        ];
        const generateError = new Error('Gemini API error');
        mockRetrieveChunks.mockResolvedValue(mockContextChunks);
        mockGenerateContent.mockRejectedValue(generateError); // Simulate Gemini failure

        const response = await request(app)
            .post('/api/v2/chat')
            .send({ message: userMessage });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Internal Server Error');
        expect(response.body.message).toContain('Failed to generate chat response');
        expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
});