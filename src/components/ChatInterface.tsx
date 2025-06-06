import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
  sources?: string[];
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  className = '',
}) => {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
              <p>This is a clean, professional chat interface ready for integration with your RAG engine.</p>
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
                  {message.content}
                </div>
                
                {message.sources && message.sources.length > 0 && (
                  <div className="message-sources">
                    <div className="sources-label">Sources:</div>
                    {message.sources.map((source, i) => (
                      <div key={i} className="source-item">
                        {source}
                      </div>
                    ))}
                  </div>
                )}
                
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
      </div>
    </div>
  );
};

export default ChatInterface;