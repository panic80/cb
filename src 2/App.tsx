import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ModernChatPage from './pages/ModernChatPage';
import SCIPPage from './pages/SCIPPage';
import ThemeTestPage from './pages/ThemeTestPage';
import './App.css';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/chat" element={<ModernChatPage />} />
        <Route path="/modern-chat" element={<ModernChatPage />} />
        <Route path="/scip" element={<SCIPPage />} />
        <Route path="/theme-test" element={<ThemeTestPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
