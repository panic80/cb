import React, { useState, useEffect } from 'react';
import { Message } from './types';
import ChatWindow from './ChatWindow';
import ChatInput from './ChatInput';
import ThemeToggle from './ThemeToggle';
import { useTheme, ThemeProvider } from './ThemeContext';
import './styles/Chat.css';

interface ChatProps {
  apiEndpoint?: string;
  initialMessages?: Message[];
  className?: string;
  onMessageSent?: (message: Message | string) => void;
  onError?: (error: Error) => void;
  isLoading?: boolean;
}

// Generate unique ID for messages
const generateId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const ChatComponent: React.FC<ChatProps> = ({
  apiEndpoint,
  initialMessages = [],
  className = '',
  onMessageSent,
  onError,
  isLoading: externalLoading,
}) => {
  const { theme } = useTheme();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(externalLoading || false);
  
  // Sync with external messages when initialMessages changes
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);
  
  // Update loading state when externally controlled
  useEffect(() => {
    if (externalLoading !== undefined) {
      setIsLoading(externalLoading);
    }
  }, [externalLoading]);

  // Handle sending a new message
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Create user message
    const userMessage: Message = {
      id: generateId(),
      content: content.trim(),
      sender: 'user',
      timestamp: Date.now(),
      status: 'sending',
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);

    // Update status to sent
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === userMessage.id ? { ...msg, status: 'sent' } : msg
        )
      );
    }, 500);

    // Call onMessageSent callback if provided
    if (onMessageSent) {
      try {
        await Promise.resolve(onMessageSent(userMessage));
      } catch (error) {
        console.error("Error in onMessageSent callback:", error);
      }
    }

    // Only use apiEndpoint if onMessageSent is not provided
    if (apiEndpoint && !onMessageSent) {
      setIsLoading(true);
      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: content }),
        });

        if (!response.ok) {
          throw new Error('API request failed');
        }

        const data = await response.json();
        const assistantMessage: Message = {
          id: generateId(),
          content: data.response || 'No response received',
          sender: 'assistant',
          timestamp: Date.now(),
          status: 'delivered',
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage: Message = {
          id: generateId(),
          content: 'Sorry, an error occurred while sending your message. Please try again.',
          sender: 'assistant',
          timestamp: Date.now(),
          status: 'error',
        };
        
        setMessages((prev) => [...prev, errorMessage]);
        if (onError && error instanceof Error) {
          onError(error);
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className={`simple-chat-container ${className}`}>
      <div className="theme-toggle-wrapper">
        <ThemeToggle />
      </div>
      {/* Chat window */}
      <main className="chat-main">
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
        />
      </main>

      {/* Input area */}
      <footer className="chat-footer">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Type a message..."
        />
      </footer>
    </div>
  );
};

// Wrap component with ThemeProvider
export const Chat: React.FC<ChatProps> = (props) => {
  return (
    <ThemeProvider>
      <ChatComponent {...props} />
    </ThemeProvider>
  );
};

export default Chat;