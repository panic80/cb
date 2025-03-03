import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatWindow, { Message } from './ChatWindow';
import ChatInput from './ChatInput';
import { sendToGemini } from '../api/gemini';
import { fetchTravelInstructions } from '../api/travelInstructions';

const Chat: React.FC = () => {
  const navigate = useNavigate();
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // State management
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [isSimplifyMode, setIsSimplifyMode] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [travelInstructions, setTravelInstructions] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    return localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  const [showAvatars, setShowAvatars] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [conversationStarted, setConversationStarted] = useState<boolean>(false);

  // Load travel instructions on component mount
  useEffect(() => {
    const loadInstructions = async () => {
      try {
        const instructions = await fetchTravelInstructions();
        setTravelInstructions(instructions);
      } catch (error) {
        console.error('Failed to load travel instructions:', error);
      }
    };
    
    loadInstructions();
  }, []);

  // Apply theme class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Hide toast after 3 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Update conversation started flag
  useEffect(() => {
    if (messages.length > 0 && !conversationStarted) {
      setConversationStarted(true);
    }
  }, [messages, conversationStarted]);

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  // Generate unique ID for messages
  const generateMessageId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  // Send message handler
  const handleSend = async () => {
    if (input.trim()) {
      // Create and add user message
      const userMessage: Message = {
        id: generateMessageId(),
        sender: 'user',
        text: input,
        timestamp: Date.now(),
        status: 'sent'
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput("");
      setIsTyping(false);
      setIsLoading(true);
      
      // Scroll to bottom after sending message
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
      
      try {
        // Send message to Gemini API if travel instructions are loaded
        if (!travelInstructions) {
          const fallbackMessage: Message = {
            id: generateMessageId(),
            sender: 'bot',
            text: "I'm sorry, I couldn't access the travel instructions. Please try again later.",
            timestamp: Date.now(),
            status: 'error'
          };
          setMessages(prev => [...prev, fallbackMessage]);
          return;
        }

        let response;
        try {
          response = await sendToGemini(
            input,
            isSimplifyMode,
            'models/gemini-2.0-flash-001',
            travelInstructions as any
          );
        } catch (error: any) {
          // Handle API key invalid error
          if (error.message?.includes('API key not valid') ||
              error.message?.includes('API key is missing')) {
            response = {
              text: "I understand you're asking about travel instructions. However, I'm currently in development mode and can't provide specific answers. Please try again later when the API integration is complete.",
              sources: [{
                reference: "System",
                text: "Development mode response"
              }]
            };
          } else {
            throw error;
          }
        }

        // Create bot message with response
        const botMessage: Message = {
          id: generateMessageId(),
          sender: 'bot',
          text: response.text,
          timestamp: Date.now(),
          sources: response.sources,
          simplified: isSimplifyMode,
          status: 'delivered'
        };
        
        setMessages(prev => [...prev, botMessage]);
      } catch (error) {
        console.error('Error sending message to Gemini:', error);
        
        // Add error message
        const errorMessage: Message = {
          id: generateMessageId(),
          sender: 'bot',
          text: "I'm sorry, I encountered an error processing your request. Please try again.",
          timestamp: Date.now(),
          status: 'error'
        };
        
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Clear chat history
  const clearChat = () => {
    setMessages([]);
    setConversationStarted(false);
  };

  // Refresh messages handler
  const onRefresh = () => {
    // Could implement actual refresh logic here
    console.log("Refreshing messages...");
  };

  // Typing indicator handler
  const onTyping = (value: string) => {
    setIsTyping(value.length > 0);
  };

  // Handle copy message
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setToastMessage("Message copied to clipboard");
        setShowToast(true);
      })
      .catch(err => {
        console.error('Failed to copy message:', err);
        setToastMessage("Failed to copy message");
        setShowToast(true);
      });
  };

  // Handle share message
  const handleShareMessage = (message: Message) => {
    // In a real app, this would open a share dialog
    // For now, we'll just show a toast
    setToastMessage("Share functionality coming soon");
    setShowToast(true);
  };

  // Handle suggested question selection
  const handleSelectQuestion = (question: string) => {
    setInput(question);
    // Optional: Auto-send the question
    // setTimeout(() => handleSend(), 500);
  };

  return (
    <div className="chat-container">
      {/* Modern, streamlined header */}
      <header className="flex items-center justify-between py-3 px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all duration-200"
            aria-label="Go back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          
          <h1 className="text-base font-medium">
            Canadian Forces Travel Assistant
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Clear chat button */}
          {conversationStarted && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all duration-200"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          )}
          
          {/* Avatar toggle button */}
          <button
            onClick={() => setShowAvatars(!showAvatars)}
            className={`p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all duration-200 ${showAvatars ? 'text-accent-primary' : ''}`}
            aria-label={showAvatars ? 'Hide Avatars' : 'Show Avatars'}
            title={showAvatars ? 'Hide Avatars' : 'Show Avatars'}
            aria-pressed={showAvatars}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </button>
          
          {/* Theme toggle button */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all duration-200"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Chat window */}
      <main
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
      >
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          isTyping={isTyping}
          onRefresh={onRefresh}
          onCopyMessage={handleCopyMessage}
          onShareMessage={handleShareMessage}
          onSelectQuestion={handleSelectQuestion}
          isSimplifyMode={isSimplifyMode}
          theme={theme}
          showAvatars={showAvatars}
        />
      </main>

      {/* Chat input and controls */}
      <footer>
        <div className="max-w-4xl mx-auto w-full px-4 md:px-0">
          <ChatInput
            input={input}
            setInput={setInput}
            handleSend={handleSend}
            onTyping={onTyping}
            isLoading={isLoading}
            isSimplified={isSimplifyMode}
            setIsSimplified={setIsSimplifyMode}
            theme={theme}
          />
          
          {/* Simplify mode toggle */}
          <div className="flex justify-end mb-2 pr-2 mt-2">
            <button
              onClick={() => setIsSimplifyMode(!isSimplifyMode)}
              className={`text-xs flex items-center px-2.5 py-1 rounded-full transition-all duration-200`}
              aria-pressed={isSimplifyMode}
              role="switch"
              title={isSimplifyMode ? 'Turn off simplified responses' : 'Turn on simplified responses'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="9" x2="20" y2="9"></line>
                <line x1="4" y1="15" x2="20" y2="15"></line>
                <line x1="10" y1="3" x2="8" y2="21"></line>
                <line x1="16" y1="3" x2="14" y2="21"></line>
              </svg>
              <span>{isSimplifyMode ? 'Simplified On' : 'Simplified Off'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Toast notification */}
      {showToast && (
        <div className="toast-notification">
          <div className="toast-content">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-accent-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span className="text-sm">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
