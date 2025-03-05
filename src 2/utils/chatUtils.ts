/**
 * Generate a unique message ID
 */
export const generateMessageId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Format date for chat separators
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return 'Recent'; // Fallback for invalid dates
  }
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }
};

/**
 * Format time for message timestamps
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return ''; // Fallback for invalid dates
  }
  
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Check if device is mobile based on viewport width
 */
export const isMobileDevice = (): boolean => {
  return window.innerWidth <= 768;
};

/**
 * Check if user has scrolled up from the bottom of the container
 */
export const hasScrolledUp = (container: HTMLElement, threshold = 20): boolean => {
  if (!container) return false;
  const { scrollTop, scrollHeight, clientHeight } = container;
  // Calculate distance from bottom of scroll container
  return scrollHeight - scrollTop - clientHeight > threshold;
};

/**
 * Check if user has scrolled to the bottom
 */
export const isScrolledToBottom = (container: HTMLElement, threshold = 20): boolean => {
  if (!container) return false;
  const { scrollTop, scrollHeight, clientHeight } = container;
  // Check if user is at or near the bottom
  return scrollHeight - scrollTop - clientHeight <= threshold;
};

/**
 * Scroll container to the bottom
 */
export const scrollToBottom = (container: HTMLElement): void => {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
};

/**
 * Debounce function to prevent excessive function calls
 */
export const debounce = <F extends (...args: any[]) => any>(
  func: F,
  waitFor: number
): ((...args: Parameters<F>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<F>): void => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
};
