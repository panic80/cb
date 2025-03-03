import React, { useReducer, useEffect, useRef } from 'react';
import './LoadingScreen.css';

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const readyState = document.readyState;
    
    if (readyState === 'complete') {
      setProgress(100);
    } else {
      setProgress(readyState === 'loading' ? 33 : 66);
      
      const handleLoad = () => setProgress(100);
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <h2 className="loading-title">Loading</h2>
        <div className="loading-bar">
          <div
            className="loading-bar-fill"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;