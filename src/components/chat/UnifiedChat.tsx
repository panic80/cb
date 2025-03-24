import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatContext } from '../../context/ChatContext';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { sendToGemini } from '../../api/gemini';
import './variables.css';
import './styles.css';
import './ChatInput.css';
import '../new-chat-interface/styles/ChatLayout.css';
import '../new-chat-interface/styles/ChatMessage.css';
import './ActionButton.css';
import '../styles/landing.css';

// Icons
const ClearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 16.9037 19.3 15.321 19.3H8.67901C7.09628 19.3 5.80651 18.0975 5.70132 16.5193L5 6M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6" 
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AvatarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ThemeIcon = ({ isDark }: { isDark: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {isDark ? (
      <path d="M12 3V4M12 20V21M21 12H20M4 12H3M18.364 18.364L17.657 17.657M6.343 6.343L5.636 5.636M18.364 5.636L17.657 6.343M6.343 17.657L5.636 18.364M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    ) : (
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    )}
  </svg>
);

const UnifiedChat: React.FC = () => {
  const navigate = useNavigate();
  const {
    dispatch,
    messages,
    isLoading,
    travelInstructions,
    isSimplifyMode,
    conversationStarted,
    showAvatars
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
    <div className="modern-chat-container glass animate-fade-up">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
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
      </div>

      <header className="modern-chat-header glass">
        <div className="header-title">
          <div className="app-icon animate-scale">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" 
                    stroke="currentColor" 
                    fill="var(--primary)" 
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="gradient-text text-xl font-semibold">Canadian Forces Travel Assistant</h1>
        </div>
        <div className="header-actions">
          {conversationStarted && (
            <button 
              onClick={clearChat} 
              className="icon-button card-hover focus-ring"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <ClearIcon />
            </button>
          )}
          <button 
            onClick={() => dispatch({ type: 'SET_SHOW_AVATARS', showAvatars: !showAvatars })}
            className={`icon-button card-hover focus-ring ${showAvatars ? 'active' : ''}`}
            aria-label={showAvatars ? 'Hide Avatars' : 'Show Avatars'}
            title={showAvatars ? 'Hide Avatars' : 'Show Avatars'}
            aria-pressed={showAvatars}
          >
            <AvatarIcon />
          </button>
          <button 
            onClick={() => dispatch({ type: 'SET_THEME', theme: document.documentElement.classList.contains('dark') ? 'light' : 'dark' })}
            className="icon-button card-hover focus-ring"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            <ThemeIcon isDark={document.documentElement.classList.contains('dark')} />
          </button>
        </div>
      </header>
      
      <main className="modern-chat-main hero-gradient">
        <MessageList />
        
        {!conversationStarted && (
          <div className="modern-empty-state glass animate-fade-in">
            <div className="modern-empty-state-icon animate-scale">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.9C9.87812 3.30493 11.1801 2.99656 12.5 3H13C15.0843 3.11499 17.053 3.99476 18.5291 5.47086C20.0052 6.94696 20.885 8.91565 21 11V11.5Z" 
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="gradient-text text-2xl font-bold mb-4">Welcome to the Chat</h2>
            <p className="text-[var(--text-secondary)] text-lg">Ask me anything about CF Travel Instructions.</p>
          </div>
        )}
      </main>
      
      <footer className="modern-chat-footer glass">
        <ChatInput onSendMessage={handleSendMessage} />
      </footer>
    </div>
  );
};

export default UnifiedChat;