import React, { useState, useEffect, useRef } from 'react';

export interface Source {
  text?: string;
  reference?: string;
}

export interface Message {
  id?: string;
  sender: string;
  text: string;
  timestamp: number;
  status?: 'sent' | 'delivered' | 'read' | 'error' | 'retrying';
  sources?: Source[];
  simplified?: boolean;
}

export interface ChatWindowProps {
  messages: Message[];
  isLoading?: boolean;
  isTyping?: boolean;
  onRefresh?: () => void;
  onCopyMessage?: (text: string) => void;
  onShareMessage?: (message: Message) => void;
  onSelectQuestion?: (question: string) => void;
  isSimplifyMode?: boolean;
  theme?: string;
  showAvatars?: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  isLoading = false,
  isTyping = false,
  onRefresh = () => {},
  onCopyMessage = () => {},
  onShareMessage = () => {},
  onSelectQuestion = () => {},
  isSimplifyMode = false,
  theme = 'light',
  showAvatars = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<number>>(new Set());

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      const { scrollHeight, clientHeight, scrollTop } = containerRef.current;
      const isScrolledToBottom = scrollTop + clientHeight >= scrollHeight - 100;
      
      if (isScrolledToBottom || isLoading) {
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        }, 100);
      }
    }
  }, [messages, isLoading]);

  // Toggle source expansion
  const toggleSourceExpansion = (sourceIndex: number) => {
    setExpandedSourceIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sourceIndex)) {
        newSet.delete(sourceIndex);
      } else {
        newSet.add(sourceIndex);
      }
      return newSet;
    });
  };

  // Toggle all sources
  const toggleAllSources = (message: Message) => {
    if (message.sources && message.sources.length > 0) {
      if (expandedSourceIds.size === message.sources.length) {
        // If all are expanded, collapse all
        setExpandedSourceIds(new Set());
      } else {
        // Otherwise, expand all
        setExpandedSourceIds(new Set([...Array(message.sources.length).keys()]));
      }
    }
  };

  // Group messages by date
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    let currentGroup: Message[] = [];
    
    msgs.forEach((message) => {
      const messageDate = new Date(message.timestamp).toLocaleDateString();
      
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({
            date: currentDate,
            messages: [...currentGroup]
          });
        }
        currentDate = messageDate;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push({
        date: currentDate,
        messages: currentGroup
      });
    }
    
    return groups;
  };

  // Group messages by sender for consecutive messages
  const groupMessagesBySender = (msgs: Message[]) => {
    const groups: Message[][] = [];
    let currentGroup: Message[] = [];
    
    msgs.forEach((message, index) => {
      // Check if this is a different sender or if more than 2 minutes have passed since the last message
      const isNewSender = index === 0 || message.sender !== msgs[index - 1].sender;
      const isTimeSeparated = index > 0 && (message.timestamp - msgs[index - 1].timestamp > 2 * 60 * 1000);
      
      if (isNewSender || isTimeSeparated) {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
        }
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  };

  // Format date for separator
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Recent'; // Fallback for invalid dates
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }
  };

  // Format time for message timestamp
  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return ''; // Fallback for invalid dates
    }
    
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get user avatar
  const getUserAvatar = () => {
    return (
      <div className="message-avatar user-avatar flex items-center justify-center">
        <span className="text-sm font-medium">You</span>
      </div>
    );
  };

  // Get bot avatar
  const getBotAvatar = () => {
    return (
      <div className="message-avatar bot-avatar flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
    );
  };

  // Get status icon based on message status
  const getStatusIcon = (status?: string) => {
    if (!status || status === 'sent') {
      return (
        <svg className="h-3 w-3 text-gray-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    } else if (status === 'delivered') {
      return (
        <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12L11 14L15 10M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    } else if (status === 'read') {
      return (
        <svg className="h-3 w-3 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12L11 14L15 10M9 16L11 18L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    } else if (status === 'error') {
      return (
        <svg className="h-3 w-3 text-red-500" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    } else if (status === 'retrying') {
      return (
        <svg className="h-3 w-3 text-yellow-500 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3M12 3L16 7M12 3L8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    return null;
  };

  // Message Actions Component
  const MessageActions: React.FC<{ message: Message }> = ({ message }) => {
    const [showActions, setShowActions] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);
    
    // Close menu when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
          setShowActions(false);
        }
      };
      
      if (showActions) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showActions]);
    
    // Handle escape key
    useEffect(() => {
      const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setShowActions(false);
        }
      };
      
      if (showActions) {
        document.addEventListener('keydown', handleEscKey);
      }
      
      return () => {
        document.removeEventListener('keydown', handleEscKey);
      };
    }, [showActions]);
    
    return (
      <div className="message-actions" ref={actionsRef}>
        <button
          className="action-toggle"
          onClick={() => setShowActions(!showActions)}
          aria-label="Message actions"
          aria-expanded={showActions}
          aria-haspopup="menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"></circle>
            <circle cx="19" cy="12" r="1"></circle>
            <circle cx="5" cy="12" r="1"></circle>
          </svg>
        </button>
        
        {showActions && (
          <div
            className="actions-menu"
            role="menu"
            aria-label="Message actions"
          >
            <button
              onClick={() => {
                onCopyMessage(message.text);
                setShowActions(false);
              }}
              role="menuitem"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy
            </button>
            
            <button
              onClick={() => {
                onShareMessage(message);
                setShowActions(false);
              }}
              role="menuitem"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                <polyline points="16 6 12 2 8 6"></polyline>
                <line x1="12" y1="2" x2="12" y2="15"></line>
              </svg>
              Share
            </button>
          </div>
        )}
      </div>
    );
  };

  // Suggested Questions Component
  const SuggestedQuestions: React.FC<{ onSelectQuestion: (question: string) => void }> = ({ onSelectQuestion }) => {
    const questions = [
      "What are the travel allowance rates?",
      "How do I claim travel expenses?",
      "What documents do I need for international travel?",
      "What are the accommodation policies?"
    ];
    
    return (
      <div className="suggested-questions">
        <h3>Ask your questions about Canadian Forces travel</h3>
        <div className="question-buttons">
          {questions.map((question, index) => (
            <button
              key={index}
              onClick={() => onSelectQuestion(question)}
              className="question-button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <path d="M12 17h.01"/>
              </svg>
              {question}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Group messages by date
  const dateGroups = messages.length > 0 ? groupMessagesByDate(messages) : [];

  return (
    <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
      <div ref={containerRef} className="messages-container flex-1">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </div>
            <h2>Canadian Forces Travel Assistant</h2>
            <p>
              I'm here to help answer your questions about Canadian Forces travel policies, 
              allowances, or procedures. Feel free to ask anything related to travel instructions.
            </p>
            
            <SuggestedQuestions onSelectQuestion={onSelectQuestion} />
          </div>
        ) : (
          dateGroups.map((dateGroup, dateIndex) => (
            <div key={`date-${dateIndex}`} className="date-group">
              <div className="date-separator">
                <span>{formatDate(dateGroup.date)}</span>
              </div>
              
              {groupMessagesBySender(dateGroup.messages).map((group, groupIndex) => (
                <div
                  key={`group-${dateIndex}-${groupIndex}`}
                  className={`message-group ${group[0].sender === 'user' ? 'user-message-group' : 'bot-message-group'}`}
                >
                  {group.map((message, messageIndex) => (
                    <div
                      key={`message-${dateIndex}-${groupIndex}-${messageIndex}`}
                      className={`message ${message.sender === 'user' ? 'user-message' : 'bot-message'} ${message.status === 'error' ? 'error' : ''} ${message.simplified ? 'simplified' : ''}`}
                    >
                      {/* Only show avatar for first message in group */}
                      {messageIndex === 0 && showAvatars && (message.sender === 'user' ? getUserAvatar() : getBotAvatar())}
                      
                      {/* Message content */}
                      <div className="message-bubble" tabIndex={0}>
                        {/* Message actions */}
                        <MessageActions message={message} />
                        
                        <div className="whitespace-pre-wrap break-words">
                          {message.text}
                        </div>
                        
                        {/* Sources - with toggle expansion */}
                        {message.sources && message.sources.length > 0 && (
                          <div className="message-sources">
                            <button
                              onClick={() => toggleAllSources(message)}
                              className="text-xs text-blue-600 dark:text-blue-400 flex items-center mb-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                            >
                              {expandedSourceIds.size === (message.sources?.length || 0) ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <line x1="8" y1="12" x2="16" y2="12"></line>
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <line x1="12" y1="8" x2="12" y2="16"></line>
                                  <line x1="8" y1="12" x2="16" y2="12"></line>
                                </svg>
                              )}
                              {expandedSourceIds.size === (message.sources?.length || 0) 
                                ? `Hide all ${message.sources.length} sources` 
                                : `View all ${message.sources.length} sources`}
                            </button>
                            
                            {message.sources.map((source, sourceIndex) => (
                              <div key={sourceIndex} className="source-item">
                                <button
                                  onClick={() => toggleSourceExpansion(sourceIndex)}
                                  className="flex items-center justify-between w-full text-left source-reference text-sm"
                                  aria-expanded={expandedSourceIds.has(sourceIndex)}
                                >
                                  <span>
                                    {source.reference || `Source ${sourceIndex + 1}`}
                                  </span>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className={`h-4 w-4 transition-transform ${expandedSourceIds.has(sourceIndex) ? 'rotate-180' : ''}`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                  </svg>
                                </button>
                                
                                {source.text && expandedSourceIds.has(sourceIndex) && (
                                  <div className="source-quote">
                                    "{source.text}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Timestamp and status */}
                        <div className="message-meta">
                          <span>{formatMessageTime(message.timestamp)}</span>
                          {message.sender === 'user' && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))
        )}
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="message bot-message">
            {showAvatars && getBotAvatar()}
            <div className="message-bubble border-0 bg-transparent p-3">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Typing indicator */}
        {isTyping && !isLoading && (
          <div className="message user-message">
            {showAvatars && getUserAvatar()}
            <div className="message-bubble bg-gray-50 dark:bg-gray-800 border-0 p-2">
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <span>Typing</span>
                <span className="typing-ellipsis">...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;