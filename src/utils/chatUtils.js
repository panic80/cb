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

  // Check if we have the old structured format
  if (answer) {
    // Create formatted markdown content for old format
    let formattedText = '';
    
    if (isSimplified) {
      formattedText = answer;
    } else {
      formattedText = answer;
      if (reason) {
        formattedText += `\n\n**Detailed Explanation:**\n\n${reason}`;
      }
    }
    
    return {
      text: formattedText,
      sources: quote ? [{ text: quote, reference }] : [],
      isFormatted: true
    };
  }
  
  // Handle new format - already well-formatted response with markdown
  // Extract sources if they exist (look for "(Source X)" patterns)
  const sourceMatches = text.match(/\(Source \d+(?:, Source \d+)*\)/g) || [];
  const sources = [];
  
  if (sourceMatches.length > 0) {
    // Extract unique source numbers and create a cleaner reference
    const allSources = new Set();
    sourceMatches.forEach(match => {
      // Extract individual source numbers from each match
      const numbers = match.match(/\d+/g) || [];
      numbers.forEach(num => allSources.add(parseInt(num)));
    });
    
    // Convert to sorted array and create readable reference
    const sortedSources = Array.from(allSources).sort((a, b) => a - b);
    const referenceText = sortedSources.length === 1 
      ? `Source ${sortedSources[0]}`
      : `Sources ${sortedSources.join(', ')}`;
    
    sources.push({
      text: "Information referenced from the provided documentation",
      reference: referenceText
    });
  }
  
  return {
    text: text, // Use the response as-is since it's already well formatted
    sources: sources,
    isFormatted: true
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