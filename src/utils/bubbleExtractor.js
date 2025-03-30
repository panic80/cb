/**
 * Extracts the innermost text content by stripping HTML-like tags.
 * Handles various simple non-HTML structures like quotes or brackets by returning the text content.
 * @param {string | any} input - The input string or other value.
 * @returns {string} The extracted text content, or an empty string for invalid input.
 */
export const extractInnerContent = (input) => {
  if (typeof input !== 'string') {
    return '';
  }

  // Attempt to extract content from the last quote pair
  const lastQuote = input.lastIndexOf('"');
  let quoteContent = null;
  if (lastQuote > 0) { // Ensure quote is not at the start
    const firstQuote = input.lastIndexOf('"', lastQuote - 1);
    if (firstQuote > -1) {
      quoteContent = input.substring(firstQuote + 1, lastQuote);
    }
  }

  // Attempt to extract content from the last bracket pair
  const lastBracket = input.lastIndexOf(']');
  let bracketContent = null;
  if (lastBracket > 0) { // Ensure bracket is not at the start
    const firstBracket = input.lastIndexOf('[', lastBracket - 1);
    if (firstBracket > -1) {
      bracketContent = input.substring(firstBracket + 1, lastBracket);
    }
  }

  // Prioritize the delimiter that appears later in the string if both are found
  if (quoteContent !== null && bracketContent !== null) {
    // Find the starting positions to correctly determine the 'innermost' or 'last' complete pair
    const firstQuoteIndex = input.lastIndexOf('"', lastQuote - 1);
    const firstBracketIndex = input.lastIndexOf('[', lastBracket - 1);

    // Compare based on the start index of the identified pair
    if (firstQuoteIndex > firstBracketIndex) {
        // If quote pair starts after bracket pair, it might be 'more inner' or simply later
        // Let's stick to prioritizing the one ending later for simplicity as per initial logic
         if (lastQuote > lastBracket) {
             return quoteContent.trim();
         } else {
             return bracketContent.trim();
         }
    } else {
         // If bracket pair starts after quote pair
         if (lastBracket > lastQuote) {
             return bracketContent.trim();
         } else {
             return quoteContent.trim();
         }
    }
    // Simplified logic: Prioritize based on the closing delimiter's position
    // if (lastQuote > lastBracket) {
    //   return quoteContent.trim();
    // } else {
    //   return bracketContent.trim();
    // }
  } else if (quoteContent !== null) {
    // Only quote content found
    return quoteContent.trim();
  } else if (bracketContent !== null) {
    // Only bracket content found
    return bracketContent.trim();
  }

  // Fallback: Basic regex to strip HTML-like tags for other cases or if specific extraction failed.
  const stripped = input.replace(/<[^>]*>/g, '');
  return stripped.trim();
};

/**
 * Extracts text content from a message object, including source texts if available.
 * @param {object | string | any} message - The message object, string, or other value.
 * @returns {string} The extracted text content, or an empty string for invalid input.
 */
export const extractMessageContent = (message) => {
  if (!message) {
    return '';
  }
  if (typeof message === 'string') {
    return message; // Handle plain string input case
  }
  if (typeof message !== 'object' || message === null) {
      return ''; // Handle non-object types other than string
  }

  let content = message.text || '';

  if (Array.isArray(message.sources)) {
    message.sources.forEach(source => {
      if (source && typeof source.text === 'string') {
        content += (content ? '\n' : '') + source.text; // Add newline separator
      }
    });
  }

  return content.trim();
};

/**
 * Recursively extracts text content from various nested structures (strings, objects, arrays).
 * @param {string | object | Array | any} content - The content to extract text from.
 * @returns {string} The combined extracted text content, or an empty string for invalid input.
 */
export const extractNestedContent = (content) => {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    // Use extractInnerContent for strings to handle potential HTML tags or simple extraction
    return extractInnerContent(content);
  }

  if (Array.isArray(content)) {
    // Recursively call for each item in the array and join results
    return content.map(item => extractNestedContent(item)).filter(text => text).join('\n').trim();
  }

  if (typeof content === 'object' && content !== null) {
    // Define keys that typically hold primary text content
    const contentKeys = ['text', 'content', 'message'];
    // Define keys that are metadata and should be skipped entirely
    const metaKeys = ['role', 'id', 'timestamp', 'sources', 'type']; // Added common metadata keys
    let extractedTexts = [];

    for (const [key, value] of Object.entries(content)) {
      // Skip explicitly defined metadata keys
      if (metaKeys.includes(key)) {
        continue;
      }

      // If the key indicates primary content, process its value
      if (contentKeys.includes(key)) {
        // If the value itself is a string, add it directly after inner extraction
        if (typeof value === 'string') {
           const innerText = extractInnerContent(value); // Use existing inner extractor
           if (innerText) {
               extractedTexts.push(innerText);
           }
        }
        // If the value is complex, recurse
        else if (value !== null && (typeof value === 'object' || Array.isArray(value))) {
          const nestedText = extractNestedContent(value);
          if (nestedText) {
            extractedTexts.push(nestedText);
          }
        }
        // Ignore other types for content keys (e.g., number, boolean)
      }
      // ELSE if the key is NOT a content key or metadata key, but the value is complex,
      // recurse into the value to find potential nested content within it.
      else if (value !== null && (typeof value === 'object' || Array.isArray(value))) {
         const nestedText = extractNestedContent(value);
         if (nestedText) {
           extractedTexts.push(nestedText);
         }
      }
      // Implicitly ignore simple values (strings, numbers, etc.) associated with non-content, non-metadata keys.
    }
    // Join the collected text fragments
    return extractedTexts.filter(text => text).join('\n').trim();
  }

  // Return empty string for other types (like numbers, booleans)
  return '';
};

// No default export needed when using named exports consistently.