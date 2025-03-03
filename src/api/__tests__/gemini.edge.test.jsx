import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createPrompt,
  getGenerationConfig,
  callGeminiAPI,
  sendToGemini
} from '../gemini';
import { parseApiResponse } from '../../utils/chatUtils';

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

  describe('API error handling', () => {
    it('should handle network errors when calling API', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        callGeminiAPI('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Network error while calling Gemini API');
      
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle malformed JSON in API response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      });

      await expect(
        callGeminiAPI('Test question', false, 'gemini-2.0-flash', 'Test instructions')
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
        callGeminiAPI('Test question', false, 'gemini-2.0-flash', 'Test instructions')
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
        callGeminiAPI('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Response does not match expected format');
    });
  });

  describe('Error handling behavior', () => {
    it('should provide helpful error message when API fails', async () => {
      // Mock API failure
      vi.spyOn(global, 'callGeminiAPI').mockRejectedValue(new Error('API error'));

      await expect(
        sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions')
      ).rejects.toThrow('Could not connect to Gemini API after multiple attempts');
    });

    it('should use fallback response when enabled', async () => {
      // Mock API failure
      vi.spyOn(global, 'callGeminiAPI').mockRejectedValue(new Error('API error'));

      const result = await sendToGemini('Test question', false, 'gemini-2.0-flash', 'Test instructions', true);

      expect(result).toHaveProperty('fallback', true);
      expect(result.text).toContain('Unable to generate response');
    });
  });
});