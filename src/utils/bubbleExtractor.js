/**
 * Utility functions for extracting content from nested chat bubbles and complex message structures
 */

/**
 * Extracts the innermost content from nested HTML-like structures, quotes, brackets, etc.
 * @param {string} input - The input string to extract content from
 * @returns {string} - The extracted inner content
 */
export function extractInnerContent(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let result = input.trim();

  // Remove HTML-like tags and extract innermost content
  while (result.includes('<') && result.includes('>')) {
    const match = result.match(/<[^>]*>([^<]*)<\/[^>]*>/);
    if (match && match[1]) {
      result = match[1].trim();
    } else {
      // Remove any remaining tags
      result = result.replace(/<[^>]*>/g, '').trim();
      break;
    }
  }

  // Extract content from quotes
  const quoteMatch = result.match(/"([^"]+)"/);
  if (quoteMatch && quoteMatch[1]) {
    result = quoteMatch[1].trim();
  }

  // Extract content from brackets
  const bracketMatch = result.match(/\[([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1]) {
    result = bracketMatch[1].trim();
  }

  // Handle message indicators (User:, Bot:, etc.)
  const messageMatch = result.match(/(?:User|Bot|Assistant):\s*(.+)/i);
  if (messageMatch && messageMatch[1]) {
    result = messageMatch[1].trim();
  }

  return result;
}

/**
 * Extracts content from a message object, including source texts
 * @param {Object|string} message - The message object or string
 * @returns {string} - The extracted content
 */
export function extractMessageContent(message) {
  if (!message) {
    return '';
  }

  // Handle string input
  if (typeof message === 'string') {
    return extractInnerContent(message);
  }

  // Handle non-object input
  if (typeof message !== 'object') {
    return '';
  }

  let content = '';

  // Extract main text
  if (message.text) {
    content += extractInnerContent(message.text);
  }

  // Extract source texts if available
  if (message.sources && Array.isArray(message.sources)) {
    const sourceTexts = message.sources
      .map(source => source.text)
      .filter(text => text)
      .map(text => extractInnerContent(text));
    
    if (sourceTexts.length > 0) {
      content += ' ' + sourceTexts.join(' ');
    }
  }

  return content.trim();
}

/**
 * Extracts content from nested structures (arrays, objects, strings)
 * @param {any} input - The input to extract content from
 * @returns {string} - The extracted content
 */
export function extractNestedContent(input) {
  if (!input) {
    return '';
  }

  // Handle string input
  if (typeof input === 'string') {
    return extractInnerContent(input);
  }

  // Handle array input
  if (Array.isArray(input)) {
    return input
      .map(item => extractNestedContent(item))
      .filter(content => content)
      .join(' ')
      .trim();
  }

  // Handle object input
  if (typeof input === 'object') {
    return extractMessageContent(input);
  }

  // Handle other types
  return '';
}