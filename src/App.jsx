import { useState, useEffect, lazy, Suspense, startTransition } from "react"; // Removed unused React import

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import { fetchTravelInstructions } from "./api/travelInstructions";
import "./index.css";
// import EliteChatAdapter from "./new-chat-interface/EliteChatAdapter.tsx"; // Removed broken import
import LandingPage from "./pages/LandingPage.jsx";

// Lazy load components
// Removed unused Hero import
// Removed unused ThemeToggle import
const MobileNavBar = lazy(() => import("./components/MobileNavBar.jsx"));
const FAQPage = lazy(() => import("./pages/FAQPage.jsx"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage.jsx"));
// Removed unused ModernChatPage import
const OPIPage = lazy(() => import("./pages/OPIPage"));
const ChatbotWidget = lazy(() => import("./components/ChatbotWidget.jsx")); // Added chatbot widget import
// const PolicyChatPage = lazy(() => import("./pages/PolicyChatPage.tsx")); // Removed chat page import
// Prefetch components
const prefetchComponent = (importFn) => {
  const prefetchTimeoutId = setTimeout(() => {
    importFn().catch(() => {});
  }, 2000);
  return () => clearTimeout(prefetchTimeoutId);
};

const App = () => {
  const [state, setState] = useState({
    isPreloading: true,
    travelInstructions: null,
    input: "",
    theme: "light",
    sidebarCollapsed: false,
    isMobile: false,
    isLoading: false,
    isTyping: false,
    typingTimeout: null,
    isFirstInteraction: true,
    isSimplified: false,
    model: "models/gemini-2.0-flash-001",
  });

  // Removed unused messages state

  // Prefetch components on mount
  useEffect(() => {
    const cleanupFns = [
      prefetchComponent(() => import("./components/Hero")),
      // prefetchComponent(() => import("./pages/ModernChatPage")), // Removed prefetch for removed page
      prefetchComponent(() => import("./components/MobileToggle")),
    ];
    return () => cleanupFns.forEach((cleanup) => cleanup());
  }, []);

  // Preload data
  useEffect(() => {
    const preloadData = async () => {
      try {
        const data = await fetchTravelInstructions();
        startTransition(() => {
          setState((prev) => ({
            ...prev,
            travelInstructions: data,
            isPreloading: false,
          }));
        });
      } catch (error) {
        console.error("Error preloading travel instructions:", error);
        setState((prev) => ({ ...prev, isPreloading: false }));
      }
    };

    preloadData();
  }, []);

  // Theme and mobile updates
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", state.theme);
    root.setAttribute(
      "data-mobile",
      state.manualMobileToggle || state.isMobile
    );

    // Add/remove class for theme to support CSS selectors in unified-chat.css
    if (state.theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }

    // Force a repaint to ensure theme changes are applied immediately
    root.style.display = "none";
    root.offsetHeight; // Trigger reflow
    root.style.display = "";
  }, [state.theme, state.manualMobileToggle, state.isMobile]);

  // Resize handler with debounce
  useEffect(() => {
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setState((prev) => ({ ...prev, isMobile: window.innerWidth < 768 }));
      }, 150);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Set custom viewport height property for mobile browsers
  useEffect(() => {
    // First set it on load
    const setVhProperty = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    setVhProperty();

    // Then update on resize
    window.addEventListener("resize", setVhProperty);
    return () => window.removeEventListener("resize", setVhProperty);
  }, []);

  // Removed unused handleSend function

  // Removed unused handleTyping function

  return (
    <Router>
      <div className="w-screen min-h-screen h-full overflow-x-hidden overflow-y-auto m-0 p-0 max-w-[100vw]"> {/* Added h-full */}
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          {state.isMobile && (
            <MobileNavBar
              theme={state.theme}
              toggleTheme={() =>
                setState((prev) => ({
                  ...prev,
                  theme: prev.theme === "light" ? "dark" : "light",
                }))
              }
            />
          )}
          <Routes>
            <Route
              path="/"
              element={
                <Suspense
                  fallback={<div className="min-h-screen bg-background" />}
                >
                  <LandingPage
                    theme={state.theme}
                    onThemeChange={(newTheme) =>
                      setState((prev) => ({ ...prev, theme: newTheme }))
                    }
                  />
                </Suspense>
              }
            />
            {/* Removed /chat route */}
            <Route
              path="/faq"
              element={
                <Suspense
                  fallback={<div className="min-h-screen bg-background" />}
                >
                  <FAQPage />
                </Suspense>
              }
            />
            <Route
              path="/privacy"
              element={
                <Suspense
                  fallback={<div className="min-h-screen bg-background" />}
                >
                  <PrivacyPage />
                </Suspense>
              }
            />
            {/* Removed /policy-chat route */}
            <Route
              path="/opi"
              element={
                <Suspense
                  fallback={<div className="min-h-screen bg-background" />}
                >
                  <OPIPage
                    theme={state.theme}
                    onThemeChange={(newTheme) =>
                      setState((prev) => ({ ...prev, theme: newTheme }))
                    }
                  />
                </Suspense>
              }
            />
          </Routes>
        </Suspense>
        {/* Render Chatbot Widget globally */}
        <Suspense fallback={null}> {/* No specific fallback needed for the widget itself */}
           <ChatbotWidget theme={state.theme} />
        </Suspense>
      </div>
    </Router>
  );
};

export default App;
