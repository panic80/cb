import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Message as ChatMessage } from '../types/chat';
import ChatInterface from './ChatInterface';
import './ChatInterface.css';
import { useTheme, ThemeProvider } from '../context/ThemeContext';
import './ChatContainer.css';

/**
 * Chat container component that manages chat state and API integration
 */
// Internal component with theme access
const ChatContainerContent: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  
  // State management
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fontSize, setFontSize] = useState<number>(16);
  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSimplifyMode, setIsSimplifyMode] = useState(false);
  const WELCOME_MESSAGE = `👋 Welcome to the Chat Interface!

This is a clean, professional chat interface ready for your RAG engine integration.

✨ Features:
• Clean, professional design
• Dark/light theme support
• Responsive interface
• Message status indicators
• Copy functionality

Ready to connect with your RAG engine!`;

  // Initialize messages with welcome message and set initial font size
  useEffect(() => {
    setMessages([{
      id: generateMessageId(),
      content: WELCOME_MESSAGE,
      sender: 'assistant',
      timestamp: Date.now(),
      status: 'delivered'
    }]);
    // Initialize font size CSS variable
    document.documentElement.style.setProperty('--chat-font-size', `${fontSize}px`);
  }, []);


  // Generate a unique message ID
  const generateMessageId = (): string => {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  // Handle sending a message
  const handleSendMessage = async (messageOrContent: EliteMessage | string) => {
    // Extract content from message object or use directly if it's a string
    const content = typeof messageOrContent === 'string'
      ? messageOrContent
      : messageOrContent.content;

    if (!content.trim()) return;

    // Create user message
    const userMessage: ChatMessage = {
      id: generateMessageId(),
      content: content.trim(),
      sender: 'user',
      timestamp: Date.now(),
      status: 'sending',
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);

    // Set status to sent after a brief delay
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg
        )
      );
    }, 300);

    setIsLoading(true);
    setNetworkError(null);

    try {
      // Simulate API response - replace this with your RAG engine integration
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
      
      // Create assistant message with simulated response
      const assistantMessage: ChatMessage = {
        id: generateMessageId(),
        content: "This is a placeholder response. Please integrate your RAG engine here to replace this simulated response.",
        sender: 'assistant',
        timestamp: Date.now(),
        status: 'delivered',
        metadata: {
          simplified: isSimplifyMode
        }
      };

      // Update messages state
      setMessages(prevMessages => {
        const updatedMessages = [...prevMessages];
        
        // Find and update the user message
        const userMessageIndex = updatedMessages.findIndex(msg => msg.id === userMessage.id);
        if (userMessageIndex !== -1) {
          updatedMessages[userMessageIndex] = {
            ...updatedMessages[userMessageIndex],
            status: 'delivered'
          };
        }
        
        // Add the assistant message
        updatedMessages.push(assistantMessage);
        
        return updatedMessages;
      });
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Update network error state
      setNetworkError("Something went wrong. Please try again.");
      
      // Update user message status to error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'error' } : msg
        )
      );
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: generateMessageId(),
        content: "I'm sorry, I encountered an error processing your request. Please try again.",
        sender: 'assistant',
        timestamp: Date.now(),
        status: 'error',
      };
      
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copying message content
  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
      .then(() => {
        setToastMessage("Message copied to clipboard");
        setShowToast(true);
      })
      .catch((err) => {
        console.error('Failed to copy message:', err);
        setToastMessage("Failed to copy message");
        setShowToast(true);
      });
  };

  // Handle message deletion
  const handleDeleteMessage = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
    setToastMessage("Message deleted");
    setShowToast(true);
  };

  // Font size control handlers
  const handleIncreaseFontSize = () => {
    setFontSize(prev => {
      const newSize = Math.min(prev + 2, 24); // Max size 24px
      document.documentElement.style.setProperty('--chat-font-size', `${newSize}px`);
      return newSize;
    });
  };

  const handleDecreaseFontSize = () => {
    setFontSize(prev => {
      const newSize = Math.max(prev - 2, 12); // Min size 12px
      document.documentElement.style.setProperty('--chat-font-size', `${newSize}px`);
      return newSize;
    });
  };

  // Hide toast after 3 seconds
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // Network error banner component
  const NetworkErrorBanner = () => (
    networkError ? (
      <div className="network-error-banner">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>{networkError}</span>
        <button onClick={() => setNetworkError(null)} aria-label="Dismiss">
          ×
        </button>
      </div>
    ) : null
  );

  // Custom header with back button, simplify toggle, and theme toggle
  const CustomHeader = () => (
    <div className="chat-header">
      <div className="header-left">
        <button
          className="back-button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1>Chat Interface</h1>
      </div>
      
      <div className="header-actions">
        {/* Simplify toggle */}
        <button
          onClick={() => setIsSimplifyMode(!isSimplifyMode)}
          className={`simplify-button ${isSimplifyMode ? 'active' : ''}`}
          aria-pressed={isSimplifyMode}
          role="switch"
          title={isSimplifyMode ? 'Turn off simplified responses' : 'Turn on simplified responses'}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {isSimplifyMode ? (
              // Simple view icon (3 short lines)
              <>
                <path d="M4 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </>
            ) : (
              // Detailed view icon (3 full-width lines)
              <>
                <path d="M4 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </>
            )}
          </svg>
          <span className="simplify-label">{isSimplifyMode ? 'Simple' : 'Detailed'}</span>
        </button>
        
        {/* Font size controls */}
        <div className="font-size-controls">
          <button
            onClick={handleDecreaseFontSize}
            className="action-button"
            aria-label="Decrease font size"
            title="Decrease font size"
            disabled={fontSize <= 12}
          >
            <span className="font-icon small-a">A</span>
          </button>
          <button
            onClick={handleIncreaseFontSize}
            className="action-button"
            aria-label="Increase font size"
            title="Increase font size"
            disabled={fontSize >= 24}
          >
            <span className="font-icon large-a">A</span>
          </button>
        </div>

        {/* Theme toggle */}
        <button
          className="action-button theme-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle
                cx="12"
                cy="12"
                r="5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );

  // Update header background color based on theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.style.setProperty('--header-bg', '#f5f5f5');
    } else {
      root.style.setProperty('--header-bg', '#2a2a2a');
    }
  }, [theme]);

  return (
    <div className="chat-container">
      {networkError && <NetworkErrorBanner />}
      
      <CustomHeader />
      
      <ChatInterface
        messages={messages.map(msg => ({
          ...msg,
          sources: msg.attachments?.map(att => att.name) || undefined
        }))}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        className="chat-interface-wrapper"
      />
      
      {/* Toast notification */}
      {showToast && (
        <div className="toast-notification" role="alert">
          <div className="toast-content">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Main chat container component wrapped with ThemeProvider
const ChatContainer: React.FC = () => {
  return (
    <ThemeProvider>
      <ChatContainerContent />
    </ThemeProvider>
  );
};

export default ChatContainer;