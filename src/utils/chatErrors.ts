export enum ChatErrorType {
  NETWORK = 'NETWORK',
  API_KEY = 'API_KEY',
  SERVICE = 'SERVICE',
  ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
  VALIDATION = 'VALIDATION',
  RATE_LIMIT = 'RATE_LIMIT',
  UNKNOWN = 'UNKNOWN'
}

interface ChatErrorMessages {
  title: string;
  message: string;
  suggestion: string;
}

const ERROR_MESSAGES: Record<ChatErrorType, ChatErrorMessages> = {
  [ChatErrorType.NETWORK]: {
    title: 'Connection Error',
    message: 'Unable to reach the server. Please check your internet connection.',
    suggestion: 'Try refreshing the page or wait a few moments before trying again.'
  },
  [ChatErrorType.API_KEY]: {
    title: 'API Key Error',
    message: 'There was an issue with the API authorization.',
    suggestion: 'Please try again later while we resolve this issue.'
  },
  [ChatErrorType.SERVICE]: {
    title: 'Service Error',
    message: 'The service is temporarily unavailable.',
    suggestion: 'Please wait a few moments and try again.'
  },
  [ChatErrorType.ENDPOINT_NOT_FOUND]: {
    title: 'Service Configuration Error',
    message: 'The required service endpoint could not be found.',
    suggestion: 'Please ensure the server is properly configured and running on port 3003.'
  },
  [ChatErrorType.VALIDATION]: {
    title: 'Invalid Request',
    message: 'The request could not be processed.',
    suggestion: 'Please check your input and try again.'
  },
  [ChatErrorType.RATE_LIMIT]: {
    title: 'Rate Limit Exceeded',
    message: 'Too many requests. Please wait before sending more messages.',
    suggestion: 'Try again in a few minutes.'
  },
  [ChatErrorType.UNKNOWN]: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred.',
    suggestion: 'Please try again. If the problem persists, refresh the page.'
  }
};

export class ChatError extends Error {
  type: ChatErrorType;
  timestamp: number;
  details?: any;

  constructor(type: ChatErrorType, details?: any) {
    const errorInfo = ERROR_MESSAGES[type];
    super(errorInfo.message);
    this.name = 'ChatError';
    this.type = type;
    this.timestamp = Date.now();
    this.details = details;
  }

  getErrorMessage(): ChatErrorMessages {
    return ERROR_MESSAGES[this.type];
  }

  static isApiKeyError(error: any): boolean {
    return error?.message?.includes('API key not valid') || 
           error?.message?.includes('API key is missing');
  }

  static isNetworkError(error: any): boolean {
    return error?.message?.includes('network') || 
           error?.name === 'NetworkError' ||
           error?.name === 'TypeError';
  }

  static isRateLimitError(error: any): boolean {
    return error?.message?.includes('rate limit') ||
           error?.message?.includes('too many requests');
  }
}