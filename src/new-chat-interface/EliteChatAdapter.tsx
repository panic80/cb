import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { Message } from '../types/chat';
import Chat from '../components/chat/Chat';
import './styles/ModernChat.css';
import './styles/variables.css';

interface EliteChatAdapterProps {
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const EliteChatAdapter: React.FC<EliteChatAdapterProps> = ({ theme: parentTheme, onThemeChange }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uuidv4(),
      content: 'Hello! I am your Canadian Forces Travel Assistant. How can I help you today?',
      role: 'assistant',
      timestamp: Date.now(),
      status: 'sent',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(parentTheme || 'light');

  useEffect(() => {
    if (parentTheme) {
      setTheme(parentTheme);
    }
  }, [parentTheme]);

  useEffect(() => {
    if (!parentTheme) {
      // Only use system preference if no parent theme is provided
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [parentTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSendMessage = async (messageOrContent: string | Message) => {
    const content = typeof messageOrContent === 'string' ? messageOrContent : messageOrContent.content;
    const userMessage: Message = {
      id: uuidv4(),
      content,
      role: 'user',
      timestamp: Date.now(),
      status: 'sending',
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setNetworkError(null); // Clear any previous errors

    try {
      const response = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gemini-2.0-flash',
          prompt: content,
          generationConfig: {
            temperature: 0.1,
            topP: 0.1,
            topK: 1,
            maxOutputTokens: 2048
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update the user message status to 'sent'
      setMessages((prev) => {
        const updatedMessages = prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'sent' as const } : msg
        );
        
        // Add the assistant's response
        return [
          ...updatedMessages,
          {
            id: uuidv4(),
            content: data.response || "I'm sorry, I couldn't generate a response. Please try again.",
            role: 'assistant',
            timestamp: Date.now(),
            status: 'sent' as const,
          } as Message,
        ];
      });
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Show a user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message. Please try again.';
      setNetworkError(errorMessage);
      setShowToast(true);
      
      // Update the message status to error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'error' } : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <div className="modern-chat-container glass animate-fade-up">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {theme === 'dark' ? (
          <>
            <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
              style={{
                background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                top: '-10%',
                left: '-10%',
              }}
            />
            <div className="absolute w-[600px] h-[600px] rounded-full blur-3xl opacity-20 floating"
              style={{
                background: `radial-gradient(circle at center, var(--primary) 0%, transparent 70%)`,
                bottom: '-10%',
                right: '-10%',
                animationDelay: '-1.5s',
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-white to-blue-50 opacity-80" />
        )}
      </div>

      <header className="modern-chat-header glass">
        <div className="header-title">
          <button 
            onClick={() => navigate('/')}
            className="back-button icon-button card-hover focus-ring"
            aria-label="Go back to home"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 12H5M12 19L5 12L12 5" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"/>
            </svg>
          </button>
          <h1 className="gradient-text text-xl font-semibold">Canadian Forces Travel Assistant</h1>
        </div>
        <div className="header-actions">
          {messages.length > 1 && (
            <button 
              onClick={() => setMessages([messages[0]])} 
              className="icon-button card-hover focus-ring"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 16.9037 19.3 15.321 19.3H8.67901C7.09628 19.3 5.80651 18.0975 5.70132 16.5193L5 6M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6" 
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
          <button 
            onClick={toggleTheme}
            className="icon-button card-hover focus-ring"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3-7l-1.5 1.5M4.93 4.93l1.5 1.5m11.14 11.14l1.5 1.5M4.93 19.07l1.5-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main className="modern-chat-main hero-gradient">
        <Chat
          initialMessages={messages}
          onMessageSent={handleSendMessage}
          isLoading={isLoading}
          onError={(error) => {
            setNetworkError(error.message);
            setShowToast(true);
          }}
          className="flex-1"
        />
      </main>

      {networkError && (
        <div className="network-error-banner glass">
          <div className="error-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="error-content">
            <h3>Error</h3>
            <p>{networkError}</p>
          </div>
          <button onClick={() => setNetworkError(null)} className="close-button" aria-label="Dismiss error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {showToast && (
        <div className="toast-message glass animate-fade-up">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>{networkError || toastMessage}</p>
        </div>
      )}
    </div>
  );
};

export default EliteChatAdapter;