import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getModelDisplayName, DEFAULT_MODEL_ID } from '../constants/models';
import MarkdownRenderer from './ui/markdown-renderer';

interface Source {
  text: string;
  reference?: string;
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  sources?: Source[];
  isFormatted?: boolean;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  className?: string;
  currentModel?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  className = '',
  currentModel = getModelDisplayName(DEFAULT_MODEL_ID),
}) => {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    };
    
    // Small delay to ensure DOM updates are complete
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className={`chat-interface ${className}`}>
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <div className="avatar-container">
            <div className="avatar assistant-avatar">
              <span>CF</span>
            </div>
            <div className="status-dot"></div>
          </div>
          <div className="header-info">
            <h3 className="header-title">Chat Assistant</h3>
            <p className="header-subtitle">
              {isLoading ? 'Typing...' : 'Online'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <div className="welcome-content">
              <h2>Welcome to Chat Interface</h2>
              <p>This is a clean, professional chat interface for the Canadian Forces Travel Instructions Chatbot.</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.sender === 'user';
          const showAvatar = index === 0 || messages[index - 1].sender !== message.sender;
          
          return (
            <div
              key={message.id}
              className={`message-wrapper ${isUser ? 'user-message' : 'assistant-message'}`}
            >
              {showAvatar && !isUser && (
                <div className="message-avatar">
                  <div className="avatar assistant-avatar">
                    <span>CF</span>
                  </div>
                </div>
              )}
              
              <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                <div className="message-content">
                  {message.sender === 'assistant' && message.isFormatted ? (
                    <MarkdownRenderer>{message.content}</MarkdownRenderer>
                  ) : (
                    message.content
                  )}
                </div>
                
                {/* Sources Section - Commented out per user request */}
                {/* {message.sources && message.sources.length > 0 && (
                  <div className="message-sources">
                    <div className="sources-header">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sources-icon">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10,9 9,9 8,9"/>
                      </svg>
                      <span className="sources-label">Sources</span>
                    </div>
                    {message.sources.map((source, i) => (
                      <div key={i} className="source-item">
                        <div className="source-quote">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="quote-icon">
                            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1-.008-1-1.031V20c0 1 0 1 1 1z"/>
                            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
                          </svg>
                          <span className="source-text">{source.text}</span>
                        </div>
                        {source.reference && (
                          <div className="source-reference">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="reference-icon">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>
                            </svg>
                            <span className="reference-text">{source.reference}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )} */}
                
                <div className="message-meta">
                  <span className="timestamp">{formatTime(message.timestamp)}</span>
                  {message.status && (
                    <span className="status-indicator">
                      {message.status === 'sending' && '⏳'}
                      {message.status === 'sent' && '✓'}
                      {message.status === 'delivered' && '✓✓'}
                      {message.status === 'error' && '⚠️'}
                    </span>
                  )}
                  <button
                    className="copy-button"
                    onClick={() => copyToClipboard(message.content)}
                    title="Copy message"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>

              {showAvatar && isUser && (
                <div className="message-avatar">
                  <div className="avatar user-avatar">
                    <span>You</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Typing Indicator */}
        {isLoading && (
          <div className="message-wrapper assistant-message">
            <div className="message-avatar">
              <div className="avatar assistant-avatar">
                <span>CF</span>
              </div>
            </div>
            <div className="message-bubble assistant-bubble">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-container">
        <div className="input-wrapper">
          <div className="input-field">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="message-input"
              disabled={isLoading}
              rows={1}
            />
            
            <button
              className={`send-button ${(!inputValue.trim() || isLoading) ? 'disabled' : ''}`}
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              title="Send message"
            >
              {isLoading ? (
                <div className="loading-spinner">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                </div>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22,2 15,22 11,13 2,9 22,2"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        
        {/* Powered by footer */}
        <div className="powered-by-footer">
          <span>Powered by {currentModel}</span>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;