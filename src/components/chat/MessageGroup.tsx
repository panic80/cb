import React from 'react';
import { Message } from '../../context/ChatTypes';

interface MessageGroupProps {
  messages: Message[];
  showAvatars: boolean;
}

const MessageGroup: React.FC<MessageGroupProps> = ({ messages, showAvatars }) => {
  if (!messages.length) return null;

  const isUserMessage = messages[0].sender === 'user';
  
  const BotAvatar = () => (
    <div className="bot-avatar">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    </div>
  );

  const UserAvatar = () => (
    <div className="user-avatar">
      <div className="avatar-text">You</div>
    </div>
  );

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const StatusIcon = ({ status }: { status?: string }) => {
    switch (status) {
      case 'sent':
        return (
          <svg className="h-3 w-3 text-gray-400" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        );
      case 'delivered':
        return (
          <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-3 w-3 text-red-500" viewBox="0 0 24 24">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        );
      case 'retrying':
        return (
          <svg className="h-3 w-3 text-yellow-500 animate-spin" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`message-group ${isUserMessage ? 'user-group' : 'bot-group'}`}>
      {messages.map((message, index) => (
        <div 
          key={message.id} 
          className={`message ${isUserMessage ? 'user-message' : 'bot-message'} ${message.status === 'error' ? 'error' : ''}`}
        >
          {showAvatars && index === 0 && (isUserMessage ? <UserAvatar /> : <BotAvatar />)}
          <div className="message-bubble">
            <div className="message-content">
              {message.text}
            </div>
            <div className="message-meta">
              <span className="message-time">{formatTime(message.timestamp)}</span>
              {isUserMessage && <StatusIcon status={message.status} />}
            </div>
            {message.sources && message.sources.length > 0 && (
              <div className="message-sources">
                {message.sources.map((source, sourceIndex) => (
                  <div key={sourceIndex} className="source-item">
                    {source.reference && (
                      <div className="source-reference">{source.reference}</div>
                    )}
                    {source.text && (
                      <div className="source-text">{source.text}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MessageGroup;