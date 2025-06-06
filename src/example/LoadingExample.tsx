import React, { useEffect } from 'react';
import { LoadingProvider, useLoading } from '../context/LoadingContext';
import { useUrlParser } from '../hooks/useUrlParser';
import LoadingScreen from '../components/LoadingScreen';

const LoadingDemo: React.FC = () => {
  const { parseUrl, isLoading, error } = useUrlParser();

  useEffect(() => {
    const testUrl = async () => {
      const result = await parseUrl('http://localhost:3000/api/config');
      if (result) {
        console.log('Parsed URL:', result);
      }
    };
    
    testUrl();
  }, [parseUrl]);

  return (
    <div className="loading-demo">
      {isLoading && <LoadingScreen />}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

// Wrap component with LoadingProvider
const LoadingExample: React.FC = () => (
  <LoadingProvider>
    <LoadingDemo />
  </LoadingProvider>
);

export default LoadingExample;