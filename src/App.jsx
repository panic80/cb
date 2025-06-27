import React, { useState, useEffect, lazy, Suspense, startTransition } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';

// Lazy load components
const Hero = lazy(() => import('./components/Hero'));
const ThemeToggle = lazy(() => import('./components/ThemeToggle'));
const MobileNavBar = lazy(() => import('./components/MobileNavBar'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const LoadingDebugPage = lazy(() => import('./pages/LoadingDebugPage'));
const OPIPage = lazy(() => import('./pages/OPIPage'));
const AdminToolsPage = lazy(() => import('./pages/AdminToolsPage'));
const ConfigPage = lazy(() => import('./pages/ConfigPage'));
const UIShowcase = lazy(() => import('./components/UIShowcase'));

// Prefetch components
const prefetchComponent = (importFn) => {
  const prefetchTimeoutId = setTimeout(() => {
    importFn().catch(() => {});
  }, 2000);
  return () => clearTimeout(prefetchTimeoutId);
};

function App() {
  // State management with batching
  const initialTheme = localStorage.getItem('app-theme') || 'dark';
  
  
  const [state, setState] = useState({
    input: '',
    theme: initialTheme,
    sidebarCollapsed: false,
    isMobile: false,
    isLoading: false,
    isTyping: false,
    typingTimeout: null,
    isFirstInteraction: true,
    isSimplified: false,
    model: 'models/gemini-2.0-flash-001'
  });


  // Prefetch components on mount
  useEffect(() => {
    const cleanupFns = [
      prefetchComponent(() => import('./components/Hero')),
      prefetchComponent(() => import('./pages/ChatPage')),
      prefetchComponent(() => import('./components/MobileToggle'))
    ];
    return () => cleanupFns.forEach(cleanup => cleanup());
  }, []);


  // Theme updates only
  useEffect(() => {
    
    
    const root = document.documentElement;
    root.setAttribute('data-theme', state.theme);
    
    // Add/remove class for theme to support CSS selectors
    if (state.theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [state.theme]);

  // Mobile updates only
  useEffect(() => {
    
    
    const root = document.documentElement;
    root.setAttribute('data-mobile', state.manualMobileToggle || state.isMobile);
  }, [state.manualMobileToggle, state.isMobile]);

  // Resize handler with debounce
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newIsMobile = window.innerWidth <= 768;
        
        setState(prev => ({ ...prev, isMobile: newIsMobile }));
      }, 150);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Theme toggle function to pass to ChatPage
  const toggleTheme = () => {
    
    setState(prev => {
      const newTheme = prev.theme === 'light' ? 'dark' : 'light';
      
      localStorage.setItem('app-theme', newTheme);
      return {
        ...prev,
        theme: newTheme
      };
    });
  };


  return (
    <Router>
      <div className="w-screen min-h-screen overflow-x-hidden overflow-y-auto m-0 p-0 max-w-[100vw]">
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: state.theme === 'dark' ? '#1f2937' : '#ffffff',
              color: state.theme === 'dark' ? '#f3f4f6' : '#111827',
              border: state.theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
            },
          }}
        />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <Routes>
            <Route path="/" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <LandingPage />
              </Suspense>
            } />
            <Route path="/opi" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <OPIPage />
              </Suspense>
            } />
            <Route path="/admin-tools" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <AdminToolsPage />
              </Suspense>
            } />
            <Route
              path="/chat"
              element={
                <Suspense fallback={<div className="min-h-screen bg-background" />}>
                  <ChatPage theme={state.theme} toggleTheme={toggleTheme} />
                </Suspense>
              }
            />
            <Route path="/chat/config" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <ConfigPage />
              </Suspense>
            } />
            <Route path="/privacy" element={
                          <Suspense fallback={<div className="min-h-screen bg-background" />}>
                            <PrivacyPage />
                          </Suspense>
                        } />
            <Route path="/faq" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <FAQPage />
              </Suspense>
            } />
            <Route path="/coming-soon-1" element={
              <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coming Soon</h1>
              </div>
            } />
            <Route path="/coming-soon-2" element={
              <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coming Soon</h1>
              </div>
            } />
            <Route path="/loading-debug" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <LoadingDebugPage />
              </Suspense>
            } />
            <Route path="/ui-showcase" element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <UIShowcase />
              </Suspense>
            } />
          </Routes>
          {state.isMobile && (
            <MobileNavBar
              theme={state.theme}
              toggleTheme={() => {
                
                setState(prev => {
                  const newTheme = prev.theme === 'light' ? 'dark' : 'light';
                  
                  localStorage.setItem('app-theme', newTheme);
                  return {
                    ...prev,
                    theme: newTheme
                  };
                });
              }}
            />
          )}
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
