// Utility functions for chat features

/**
 * Generates a unique message ID.
 * @returns {string} A unique message identifier (e.g., "msg-1678886400000-0.12345").
 */
export const generateMessageId = () => {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Formats text by trimming whitespace and removing empty lines.
 * @param {string | null | undefined} text The input text.
 * @returns {string} The formatted text.
 */
export const formatText = (text) => {
  if (!text) {
    return "";
  }
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
};

/**
 * Parses a structured API response string into an object.
 * Expected format:
 * Reference: [Reference Text]
 * Quote: [Quote Text]
 * Answer: [Answer Text]
 * Reason: [Reason Text] (Optional)
 * @param {string | null | undefined} responseString The raw response string from the API.
 * @param {boolean} [isSimplified=true] If true, only includes the 'Answer' part in the text. If false, includes 'Answer' and 'Reason'.
 * @returns {{text: string, sources: Array<{text: string, reference: string}>}} Parsed response object.
 * @throws {Error} If the response format is invalid or missing the 'Answer' section.
 */
export const parseApiResponse = (responseString, isSimplified = true) => {
  if (!responseString) {
    throw new Error("Invalid response format from API");
  }

  const lines = responseString.split('\n');
  const data = {
    Reference: null,
    Quote: null,
    Answer: null,
    Reason: null,
  };

  lines.forEach(line => {
    if (line.startsWith("Reference: ")) {
      data.Reference = line.substring("Reference: ".length).trim();
    } else if (line.startsWith("Quote: ")) {
      data.Quote = line.substring("Quote: ".length).trim();
    } else if (line.startsWith("Answer: ")) {
      data.Answer = line.substring("Answer: ".length).trim();
    } else if (line.startsWith("Reason: ")) {
      data.Reason = line.substring("Reason: ".length).trim();
    }
  });

  if (!data.Answer) {
    throw new Error("Response missing required answer section");
  }

  let text = data.Answer;
  if (!isSimplified && data.Reason) {
    text += `\n\nReason: ${data.Reason}`;
  }

  const sources = [];
  if (data.Quote && data.Reference) {
    sources.push({ text: data.Quote, reference: data.Reference });
  } else if (data.Quote) {
      // Handle case where only quote is present, maybe reference is implied? Test doesn't cover this exact edge case. Assuming reference is required for a source.
      // Or maybe should include source with only text? Let's stick to test cases: requires both.
  } else if (data.Reference) {
      // Handle case where only reference is present. Test doesn't cover this. Sticking to test cases.
  }


  return { text, sources };
};


/**
 * Formats a date object or timestamp into a relative string ('Today', 'Yesterday') or a formatted date string.
 * @param {Date | string | number | null | undefined} dateInput The date to format.
 * @returns {string} Formatted date string ('Recent', 'Today', 'Yesterday', or e.g., '1/1/2023').
 */
export const formatDate = (dateInput) => {
  // Handle null, undefined, or empty string explicitly
  if (dateInput === null || dateInput === undefined || dateInput === '') {
      return "Recent";
  }

  let date;
  try {
    // Ensure we handle potentially invalid non-null/non-empty inputs that Date constructor might accept
    date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) { // Check if Date constructor resulted in an invalid date
       return "Recent"; // Return "Recent" for other invalid inputs
    }
  } catch (e) {
    // This catch might be less likely to be hit now, but keep for safety
    return "Recent";
  }


  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const inputDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (inputDateOnly.getTime() === today.getTime()) {
    return "Today";
  }
  if (inputDateOnly.getTime() === yesterday.getTime()) {
    return "Yesterday";
  }

  // Default formatting for other dates (locale-specific)
  return date.toLocaleDateString(undefined, { // Use undefined locale to use browser's default
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
};

/**
 * Formats a timestamp into a time string (e.g., '10:30 AM').
 * @param {number | null | undefined} timestamp The timestamp (milliseconds since epoch).
 * @returns {string} Formatted time string or empty string for invalid input.
 */
export const formatMessageTime = (timestamp) => {
   if (timestamp === null || timestamp === undefined || typeof timestamp !== 'number' || isNaN(timestamp)) {
     return "";
   }
   try {
       const date = new Date(timestamp);
       if (isNaN(date.getTime())) {
           return "";
       }
       return date.toLocaleTimeString(undefined, { // Use undefined locale for browser default
           hour: 'numeric',
           minute: '2-digit',
           // hour12: true // often default, but can be explicit if needed
       });
   } catch (e) {
       return ""; // Catch potential errors with Date creation/formatting
   }
};