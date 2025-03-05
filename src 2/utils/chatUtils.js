/**
 * Chat utility functions to centralize common functionality
 * used across different components.
 */

/**
 * Generates a unique message ID
 * @returns {string} A unique message ID
 */
export const generateMessageId = () => {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Formats a text string by preserving line breaks and trimming each line
 * @param {string} text - The text to format
 * @returns {string} The formatted text
 */
export const formatText = (text) => {
  if (!text) return '';
  return text
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => line.trim())
    .join('\n');
};

/**
 * Parse an API response into structured format
 * @param {string} text - The text response from the API
 * @param {boolean} isSimplified - Whether to show simplified response
 * @returns {Object} Structured response with text and sources
 */
export const parseApiResponse = (text, isSimplified = false) => {
  if (!text) {
    throw new Error('Invalid response format from API');
  }

  const sections = text.split('\n').filter(line => line.trim());
  
  const reference = sections.find(line => line.startsWith('Reference:'))?.replace('Reference:', '').trim();
  const quote = sections.find(line => line.startsWith('Quote:'))?.replace('Quote:', '').trim();
  const answer = sections.find(line => line.startsWith('Answer:'))?.replace('Answer:', '').trim();
  const reason = sections.find(line => line.startsWith('Reason:'))?.replace('Reason:', '').trim();

  if (!answer) {
    throw new Error('Response missing required answer section');
  }

  const formattedText = isSimplified ? answer : (reason ? `${answer}\n\nReason: ${reason}` : answer);
  return {
    text: formattedText,
    sources: quote ? [{ text: quote, reference }] : []
  };
};

/**
 * Format date for message displays
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  // Handle null, undefined, or empty values
  if (date === null || date === undefined || date === '') {
    return 'Recent';
  }
  
  const dateObj = new Date(date);
  
  // Properly check if date is valid - an invalid date will return NaN for getTime()
  if (isNaN(dateObj.getTime())) {
    return 'Recent'; // Fallback for invalid dates
  }
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (dateObj.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (dateObj.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return dateObj.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }
};

/**
 * Format time for message timestamps
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Formatted time string
 */
export const formatMessageTime = (timestamp) => {
  // Handle null, undefined, or empty values
  if (timestamp === null || timestamp === undefined || timestamp === '') {
    return '';
  }
  
  // Handle non-numeric or NaN values
  if (isNaN(timestamp) || typeof timestamp !== 'number' && isNaN(Number(timestamp))) {
    return '';
  }
  
  const date = new Date(timestamp);
  
  // Properly check if date is valid - an invalid date will return NaN for getTime()
  if (isNaN(date.getTime())) {
    return ''; // Fallback for invalid dates
  }
  
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};