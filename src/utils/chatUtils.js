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
  
  // Try to extract sections with more flexible matching
  let reference = sections.find(line => line.startsWith('Reference:'))?.replace('Reference:', '').trim();
  let quote = sections.find(line => line.startsWith('Quote:'))?.replace('Quote:', '').trim();
  let answer = sections.find(line => line.startsWith('Answer:'))?.replace('Answer:', '').trim();
  let reason = sections.find(line => line.startsWith('Reason:'))?.replace('Reason:', '').trim();

  // If we can't find the sections with exact matches, try alternative approaches
  if (!answer || !reference) {
    // Try to find section markers with more lenient matching
    for (const line of sections) {
      if (!reference && (line.includes('Reference:') || line.includes('Section:') || line.includes('Chapter:'))) {
        reference = line.replace(/Reference:|Section:|Chapter:/i, '').trim();
      }
      
      if (!quote && line.includes('Quote:')) {
        quote = line.replace(/Quote:/i, '').trim();
      }
      
      if (!answer && line.includes('Answer:')) {
        answer = line.replace(/Answer:/i, '').trim();
      }
      
      if (!reason && (line.includes('Reason:') || line.includes('Explanation:'))) {
        reason = line.replace(/Reason:|Explanation:/i, '').trim();
      }
    }
  }

  // If we still don't have an answer, use fallback approach - use the text after any markers
  if (!answer) {
    // Look for any section-like marker and take everything after it
    const answerIndex = sections.findIndex(line => 
      line.match(/Answer:|Response:|Reply:/i));
    
    if (answerIndex !== -1 && answerIndex < sections.length - 1) {
      answer = sections[answerIndex + 1];
    } else {
      // Last resort: just use the text as is after filtering out any reference/quote lines
      const potentialAnswerLines = sections.filter(line => 
        !line.match(/^(Reference|Quote|Section|Chapter):/i));
      
      if (potentialAnswerLines.length > 0) {
        answer = potentialAnswerLines.join(' ');
      } else {
        // If all else fails, just use the raw text
        answer = text;
      }
    }
  }

  // Ensure we have at least minimal source information
  if (!reference && text.includes('Chapter')) {
    const chapterMatch = text.match(/Chapter\s+\d+/i);
    if (chapterMatch) {
      reference = chapterMatch[0];
    }
  }

  // Format the response text
  const formattedText = isSimplified ? answer : (reason ? `${answer}\n\nReason: ${reason}` : answer);
  
  return {
    text: formattedText,
    sources: quote ? [{ text: quote, reference: reference || 'Travel Instructions' }] : []
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