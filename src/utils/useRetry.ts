import { useState, useCallback } from 'react';
import { ChatError, ChatErrorType } from './chatErrors';

interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
  backoffFactor: 2
};

export function useRetry(config: RetryConfig = {}) {
  const { maxAttempts, initialDelay, maxDelay, backoffFactor } = { ...DEFAULT_CONFIG, ...config };
  const [attemptCount, setAttemptCount] = useState(0);
  
  const calculateDelay = (attempt: number): number => {
    const delay = initialDelay! * Math.pow(backoffFactor!, attempt);
    return Math.min(delay, maxDelay!);
  };

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    isRetryable: (error: any) => boolean = (error) => error instanceof ChatError && error.type === ChatErrorType.NETWORK
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      const currentAttempt = attemptCount + 1;
      
      if (currentAttempt < maxAttempts! && isRetryable(error)) {
        const delay = calculateDelay(currentAttempt);
        setAttemptCount(currentAttempt);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeWithRetry(operation, isRetryable);
      }
      
      throw error;
    }
  }, [attemptCount, maxAttempts, initialDelay, maxDelay, backoffFactor]);

  const resetAttempts = useCallback(() => {
    setAttemptCount(0);
  }, []);

  return {
    executeWithRetry,
    attemptCount,
    resetAttempts,
    hasMoreAttempts: attemptCount < maxAttempts!
  };
}