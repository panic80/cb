import React, { useRef, useEffect } from 'react';
import { Message } from '../../types/chat';
import ChatInput from './ChatInput';
import MessageList from './MessageList';
import '../../new-chat-interface/styles/ModernChat.css';
import '../../new-chat-interface/styles/variables.css';

interface ChatProps {
  initialMessages: Message[];
  onMessageSent: (messageOrContent: string | Message) => Promise<void>;
  isLoading: boolean;
  onError?: (error: Error) => void;
  className?: string;
}

const Chat: React.FC<ChatProps> = ({
  initialMessages,
  onMessageSent,
  isLoading,
  onError,
  className = '',
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [initialMessages]);

  return (
    <div className={`modern-chat-content ${className}`}>
      <MessageList 
        messages={initialMessages} 
        isLoading={isLoading} 
      />
      <div ref={messagesEndRef} />
      <ChatInput 
        onSend={onMessageSent}
        isLoading={isLoading}
        onError={onError}
      />
    </div>
  );
};

export default Chat; 