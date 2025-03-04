import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LoadingProvider, useLoading } from './context/LoadingContext';
import LoadingExample from './example/LoadingExample';
import './App.css';

// Import existing components
import Chat from './components/Chat';
import Contact from './components/Contact';
import Hero from './components/Hero';
import TopFAQs from './components/TopFAQs';
import LoadingScreen from './components/LoadingScreen';

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
          element={
            <>
              <Hero />
              <TopFAQs />
              <Contact />
            </>
          } 
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
