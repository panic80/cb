import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { sendToGemini } from '../../api/gemini';
import './styles.css';

const UnifiedChat: React.FC = () => {
  const {
    dispatch,
    messages,
    isLoading,
    travelInstructions,
    isSimplifyMode,
    conversationStarted
  } = useChatContext();

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !travelInstructions) return;

    // Add user message
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sender: 'user',
        text: text.trim(),
        timestamp: Date.now(),
        status: 'sent'
      }
    });

    // Set loading state
    dispatch({ type: 'SET_LOADING', isLoading: true });
    dispatch({ type: 'SET_NETWORK_ERROR', error: null });

    try {
      const response = await sendToGemini(
        text,
        isSimplifyMode,
        'models/gemini-2.0-flash-001',
        travelInstructions
      );

      // Add bot response
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sender: 'bot',
          text: response.text,
          timestamp: Date.now(),
          sources: response.sources,
          simplified: isSimplifyMode,
          status: 'delivered'
        }
      });

      // Update user message status
      const userMessages = messages.filter(m => m.sender === 'user');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        dispatch({
          type: 'UPDATE_MESSAGE',
          messageId: lastUserMessage.id,
          updates: { status: 'delivered' }
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      dispatch({
        type: 'SET_NETWORK_ERROR',
        error: 'Failed to send message. Please try again.'
      });

      // Add error message
      dispatch({
        type: 'ADD_MESSAGE',
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sender: 'bot',
          text: 'I encountered an error processing your request. Please try again.',
          timestamp: Date.now(),
          status: 'error'
        }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  };

  const clearChat = () => {
    dispatch({ type: 'CLEAR_CHAT' });
  };

  return (
    <div className="unified-chat">
      <div className="chat-header">
        {conversationStarted && (
          <button
            onClick={clearChat}
            className="clear-chat-button"
            aria-label="Clear chat"
          >
            Clear Chat
          </button>
        )}
      </div>
      <MessageList />
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
};

export default UnifiedChat;