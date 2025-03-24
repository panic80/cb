import React, { useRef } from 'react';
import { Message } from './types';
import { useTheme } from './ThemeContext';
import './styles/ChatMessage.css';

export interface ChatMessageProps {
  message: Message;
  isConsecutive?: boolean;
  showAvatar?: boolean;
  className?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isConsecutive = false,
  showAvatar = true,
  className = '',
}) => {
  const { theme } = useTheme();
  const messageRef = useRef<HTMLDivElement>(null);
  
  // Format timestamp to human-readable time
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const messageClass = `chat-message ${message.sender === 'user' ? 'user-message' : 'assistant-message'} ${
    isConsecutive ? 'consecutive' : ''
  } ${message.status === 'error' ? 'error' : ''} ${className}`;

  return (
    <div
      className={messageClass}
      ref={messageRef}
      data-sender={message.sender}
    >
      <div className="message-content">
        {message.sender === 'assistant' && showAvatar && !isConsecutive && (
          <div className="avatar assistant-avatar">AI</div>
        )}
        
        <div className="message-bubble">
          {message.content}
          
          <div className="message-meta">
            {message.timestamp && (
              <span className="message-time">{formatTime(message.timestamp)}</span>
            )}
            {message.status === 'sending' && (
              <span className="message-status">Sending...</span>
            )}
            {message.status === 'error' && (
              <span className="message-status error">Failed to send</span>
            )}
          </div>
        </div>
        
        {message.sender === 'user' && showAvatar && !isConsecutive && (
          <div className="avatar user-avatar">You</div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;