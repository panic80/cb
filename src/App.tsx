import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import LoadingExample from './example/LoadingExample';
import './App.css';

// Import components
import Chat from './components/Chat';
import LoadingScreen from './components/LoadingScreen';
import LandingPage from './pages/LandingPage';

// Wrap LoadingScreen with loading state from context
const LoadingWrapper: React.FC = () => {
  const { state } = useLoading();
  return state.isLoading ? <LoadingScreen /> : null;
};

// Main application component
const AppContent: React.FC = () => {
  return (
    <div className="app">
      <Routes>
        <Route 
          path="/" 
          element={<LandingPage />}
        />
        <Route 
          path="/chat" 
          element={<Chat />} 
        />
        <Route 
          path="/loading-demo" 
          element={<LoadingExample />} 
        />
      </Routes>
      <LoadingWrapper />
    </div>
  );
};

// Root component with providers
const App: React.FC = () => {
  return (
    <LoadingProvider>
      <Router>
        <AppContent />
      </Router>
    </LoadingProvider>
  );
};

export default App;
