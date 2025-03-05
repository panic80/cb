import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPrompt,
  getGenerationConfig,
  callGeminiViaProxy,
  callGeminiViaSDK,
  sendToGemini
} from '../gemini';
import { parseApiResponse } from '../../utils/chatUtils';

// Mock the GoogleGenerativeAI module
vi.mock('@google/generative-ai', () => {
  const generativeContentMock = {
    response: {
      text: vi.fn().mockReturnValue(
        'Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason'
      )
    }
  };

  const generateContentMock = vi.fn().mockResolvedValue(generativeContentMock);

  const getGenerativeModelMock = vi.fn().mockReturnValue({
    generateContent: generateContentMock
  });

  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: getGenerativeModelMock
    }))
  };
});

// Mock the chatUtils module
vi.mock('../../utils/chatUtils', () => ({
  parseApiResponse: vi.fn().mockImplementation((text, isSimplified) => ({
    text: isSimplified ? 'Simple response' : 'Detailed response with reason',
    sources: [{ text: 'This is a quote', reference: 'Section 1.1' }]
  }))
}));

// Mock global fetch
global.fetch = vi.fn();

describe('gemini module edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Setup fetch mock
    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Reference: Section 1.1\nQuote: This is a quote\nAnswer: Test answer\nReason: Test reason'
                }
              ]
            }
          }
        ]
      })
    });

    // Mock import.meta.env
    vi.stubGlobal('import.meta', {
      env: {
        VITE_GEMINI_API_KEY: 'test-api-key',
        DEV: true
      }
    });

    // Spy on console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('API key handling', () => {
    it('should handle missing API key gracefully', async () => {
      // Mock missing API key
      vi.stubGlobal('import.meta', {
        env: {
          VITE_GEMINI_API_KEY: '',
          DEV: true
        }
      });

      await expect(
        sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('API key is missing or invalid');
    });
  });

  describe('SDK error handling', () => {
    it('should handle SDK errors consistently', async () => {
      // Mock API service error
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockError = new Error('Service unavailable');
      mockError.name = 'ApiError';
      
      const mockGenModel = {
        generateContent: vi.fn().mockRejectedValue(mockError)
      };
      
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockGenModel)
      }));

      await expect(
        callGeminiViaSDK('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Gemini API Error: Service unavailable');
      
      expect(console.error).toHaveBeenCalled();
    });
    
    it('should handle rate limit errors specifically', async () => {
      // Mock rate limit error
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const rateError = new Error('Resource exhausted: quota exceeded');
      rateError.name = 'ApiError';
      
      const mockGenModel = {
        generateContent: vi.fn().mockRejectedValue(rateError)
      };
      
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: vi.fn().mockReturnValue(mockGenModel)
      }));

      await expect(
        callGeminiViaSDK('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Rate limit exceeded. Please try again later.');
      
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Proxy error handling', () => {
    it('should handle network errors when calling proxy', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        callGeminiViaProxy('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Network error while calling Gemini API');
      
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle malformed JSON in proxy response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      });

      await expect(
        callGeminiViaProxy('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Invalid JSON response from Gemini API');
    });
  });

  describe('Response parsing edge cases', () => {
    it('should handle empty responses gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: '' }]
              }
            }
          ]
        })
      });

      // Mock parseApiResponse to simulate error on empty text
      vi.mocked(parseApiResponse).mockImplementationOnce(() => {
        throw new Error('Empty API response');
      });

      await expect(
        callGeminiViaProxy('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Empty API response');
    });

    it('should handle responses without required format gracefully', async () => {
      // Simulate a response that doesn't match the expected format (missing Reference/Quote/Answer)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          candidates: [
            {
              content: {
                parts: [{ text: 'This is not in the expected format.' }]
              }
            }
          ]
        })
      });

      // Mock parseApiResponse to simulate error on malformed response
      vi.mocked(parseApiResponse).mockImplementationOnce(() => {
        throw new Error('Response does not match expected format');
      });

      await expect(
        callGeminiViaProxy('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Response does not match expected format');
    });
  });

  describe('Initialization and fallback behavior', () => {
    it('should retry with SDK if proxy fails', async () => {
      // First set up environment to choose proxy first (in development)
      vi.stubGlobal('import.meta', {
        env: {
          VITE_GEMINI_API_KEY: 'test-api-key',
          DEV: true
        }
      });

      // Make proxy fail but SDK succeed
      vi.spyOn(global, 'callGeminiViaProxy').mockRejectedValue(new Error('Proxy error'));
      vi.spyOn(global, 'callGeminiViaSDK').mockResolvedValue({
        text: 'SDK response',
        sources: []
      });

      const result = await sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions');

      expect(result).toEqual({
        text: 'SDK response',
        sources: []
      });
    });

    it('should provide helpful error message when all methods fail', async () => {
      // Make both methods fail
      vi.spyOn(global, 'callGeminiViaProxy').mockRejectedValue(new Error('Proxy error'));
      vi.spyOn(global, 'callGeminiViaSDK').mockRejectedValue(new Error('SDK error'));

      await expect(
        sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Could not connect to Gemini API after multiple attempts');
    });
  });
});