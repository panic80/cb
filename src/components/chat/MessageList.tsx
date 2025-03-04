import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatContext } from '../../context/ChatContext';
import { Message } from '../../context/ChatTypes';
import MessageGroup from './MessageGroup';
import DateSeparator from './DateSeparator';
import LoadingIndicator from './LoadingIndicator';
import TypingIndicator from './TypingIndicator';

interface DateGroupedMessages {
  date: string;
  messages: Message[][];
}

const MessageList: React.FC = () => {
  const {
    messages,
    isLoading,
    isTyping,
    showAvatars,
    fontSize,
  } = useChatContext();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = React.useState(false);

  // Memoized message grouping function
  const groupMessagesByDate = useCallback((msgs: Message[]): DateGroupedMessages[] => {
    const groups: DateGroupedMessages[] = [];
    let currentDate = '';
    let currentGroup: Message[] = [];
    let currentGroups: Message[][] = [];

    msgs.forEach((message, index) => {
      const messageDate = new Date(message.timestamp).toLocaleDateString();

      // Handle date change
      if (messageDate !== currentDate) {
        if (currentGroup.length > 0) {
          currentGroups.push([...currentGroup]);
          currentGroup = [];
        }
        if (currentGroups.length > 0) {
          groups.push({
            date: currentDate,
            messages: currentGroups
          });
          currentGroups = [];
        }
        currentDate = messageDate;
      }

      // Handle sender change or time gap (2 minutes)
      const isNewSender = index === 0 || message.sender !== msgs[index - 1].sender;
      const isTimeSeparated = index > 0 && 
        (message.timestamp - msgs[index - 1].timestamp > 2 * 60 * 1000);

      if (isNewSender || isTimeSeparated) {
        if (currentGroup.length > 0) {
          currentGroups.push([...currentGroup]);
          currentGroup = [];
        }
      }

      currentGroup.push(message);
    });

    // Handle remaining messages
    if (currentGroup.length > 0) {
      currentGroups.push(currentGroup);
    }
    if (currentGroups.length > 0) {
      groups.push({
        date: currentDate,
        messages: currentGroups
      });
    }

    return groups;
  }, []);

  // Memoized scroll handler
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    setUserHasScrolled(!isNearBottom);
  }, []);

  // Scroll event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Auto-scroll effect
  useEffect(() => {
    if (!userHasScrolled && containerRef.current) {
      const element = containerRef.current;
      const config: ScrollIntoViewOptions = {
        behavior: isTyping ? 'smooth' : 'auto',
        block: 'end'
      };
      
      requestAnimationFrame(() => {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: config.behavior
        });
      });
    }
  }, [messages, isTyping, userHasScrolled]);

  // Memoize grouped messages
  const dateGroups = useMemo(() => 
    groupMessagesByDate(messages), 
    [messages, groupMessagesByDate]
  );

  return (
    <div 
      ref={containerRef}
      className="message-list"
      style={{ fontSize: `${fontSize}px` }}
    >
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-content">
            <h2>Canadian Forces Travel Assistant</h2>
            <p>Ask me anything about Canadian Forces travel policies and procedures.</p>
          </div>
        </div>
      ) : (
        dateGroups.map((dateGroup, dateIndex) => (
          <div key={`date-${dateIndex}`} className="date-group">
            <DateSeparator date={dateGroup.date} />
            {dateGroup.messages.map((group, groupIndex) => (
              <MessageGroup
                key={`group-${dateIndex}-${groupIndex}`}
                messages={group}
                showAvatars={showAvatars}
              />
            ))}
          </div>
        ))
      )}

      {isLoading && <LoadingIndicator showAvatar={showAvatars} />}
      {isTyping && !isLoading && <TypingIndicator showAvatar={showAvatars} />}
    </div>
  );
};

export default MessageList;