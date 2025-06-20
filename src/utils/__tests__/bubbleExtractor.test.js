import { describe, it, expect } from 'vitest';
import { 
  extractInnerContent, 
  extractMessageContent, 
  extractNestedContent 
} from '../bubbleExtractor';

describe('bubbleExtractor', () => {
  describe('extractInnerContent', () => {
    it('should handle empty or invalid input', () => {
      expect(extractInnerContent('')).toBe('');
      expect(extractInnerContent(null)).toBe('');
      expect(extractInnerContent(undefined)).toBe('');
      expect(extractInnerContent(123)).toBe('');
    });

    it('should extract content from HTML-like tags', () => {
      const input = '<div><span>This is the innermost text</span></div>';
      expect(extractInnerContent(input)).toBe('This is the innermost text');
    });

    it('should extract content from quotes', () => {
      const input = 'User said: "This is the quoted text"';
      expect(extractInnerContent(input)).toBe('This is the quoted text');
    });

    it('should extract content from brackets', () => {
      const input = 'Message: [This is in brackets]';
      expect(extractInnerContent(input)).toBe('This is in brackets');
    });

    it('should extract content from deeply nested structures', () => {
      const input = '<div><message><content>This is deeply nested</content></message></div>';
      expect(extractInnerContent(input)).toBe('This is deeply nested');
    });

    it('should extract content after message indicators', () => {
      const userInput = 'User: This is a user message';
      const botInput = 'Bot: This is a bot response';
      expect(extractInnerContent(userInput)).toBe('This is a user message');
      expect(extractInnerContent(botInput)).toBe('This is a bot response');
    });

    it('should handle text with no clear structure', () => {
      const input = 'This is just plain text with no structure';
      expect(extractInnerContent(input)).toBe('This is just plain text with no structure');
    });
  });

  describe('extractMessageContent', () => {
    it('should handle empty or invalid input', () => {
      expect(extractMessageContent(null)).toBe('');
      expect(extractMessageContent(undefined)).toBe('');
      expect(extractMessageContent('')).toBe('');
      expect(extractMessageContent(123)).toBe('');
    });

    it('should extract text from a message object', () => {
      const message = {
        id: '123',
        sender: 'user',
        text: 'This is the message text',
        timestamp: Date.now()
      };
      expect(extractMessageContent(message)).toBe('This is the message text');
    });

    it('should include source texts if available', () => {
      const message = {
        id: '123',
        sender: 'bot',
        text: 'This is the main message',
        timestamp: Date.now(),
        sources: [
          { text: 'Source 1 content', reference: 'Ref 1' },
          { text: 'Source 2 content', reference: 'Ref 2' }
        ]
      };
      const result = extractMessageContent(message);
      expect(result).toContain('This is the main message');
      expect(result).toContain('Source 1 content');
      expect(result).toContain('Source 2 content');
    });
  });

  describe('extractNestedContent', () => {
    it('should handle different input types', () => {
      // String input
      expect(extractNestedContent('<div>Text content</div>')).toBe('Text content');
      
      // Array input
      const arrayInput = [
        '<div>First message</div>',
        { text: 'Second message', sender: 'bot' }
      ];
      const arrayResult = extractNestedContent(arrayInput);
      expect(arrayResult).toContain('First message');
      expect(arrayResult).toContain('Second message');
      
      // Object input
      const objectInput = {
        text: 'Object message',
        sender: 'user',
        timestamp: Date.now()
      };
      expect(extractNestedContent(objectInput)).toBe('Object message');
      
      // Invalid input
      expect(extractNestedContent(null)).toBe('');
      expect(extractNestedContent(undefined)).toBe('');
      expect(extractNestedContent(123)).toBe('');
    });

    it('should extract content from a complex chat structure', () => {
      // Test individual parts of the complex structure
      const userMessage = '<span class="text">What are the travel allowance rates?</span>';
      const botMessage = '<p>Travel allowance rates for incidental expenses, meals, and private non-commercial accommodation are determined by the National Joint Council (NJC) Travel Directive.</p>';
      
      expect(extractNestedContent(userMessage)).toBe('What are the travel allowance rates?');
      expect(extractNestedContent(botMessage)).toContain('Travel allowance rates for incidental expenses');
      
      // Test array of messages
      const messages = [userMessage, botMessage];
      const result = extractNestedContent(messages);
      expect(result).toContain('What are the travel allowance rates?');
      expect(result).toContain('Travel allowance rates for incidental expenses');
    });
  });
});