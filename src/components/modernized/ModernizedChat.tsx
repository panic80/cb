import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import MessageList from '../chat/MessageList';
import ChatInput from '../chat/ChatInput';
import { sendToGemini } from '../../api/gemini';
import '../chat/variables.css';
import '../chat/styles.css';
import '../chat/ChatInput.css';
import '../new-chat-interface/styles/ChatLayout.css';
import '../new-chat-interface/styles/ChatMessage.css';
import '../chat/ActionButton.css';

const ModernizedChat: React.FC = () => {
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
    <div className="modern-chat-container">
      <header className="modern-chat-header">
        <h1 className="modern-chat-title">Chat Assistant</h1>
        <div className="modern-chat-actions">
          {conversationStarted && (
            <button
              onClick={clearChat}
              className="modern-action-button"
              aria-label="Clear chat"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 16.9037 19.3 15.321 19.3H8.67901C7.09628 19.3 5.80651 18.0975 5.70132 16.5193L5 6M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"/>
              </svg>
              <span>Clear</span>
            </button>
          )}
        </div>
      </header>
      
      <main className="modern-chat-main">
        <MessageList />
        
        {/* Empty state or welcome message */}
        {!conversationStarted && (
          <div className="modern-empty-state">
            <div className="modern-empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.9C9.87812 3.30493 11.1801 2.99656 12.5 3H13C15.0843 3.11499 17.053 3.99476 18.5291 5.47086C20.0052 6.94696 20.885 8.91565 21 11V11.5Z" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>Welcome to the Chat</h2>
            <p>Ask me anything to start a conversation.</p>
          </div>
        )}
      </main>
      
      <footer className="modern-chat-footer">
        <ChatInput onSendMessage={handleSendMessage} />
      </footer>
    </div>
  );
};

export default ModernizedChat; 