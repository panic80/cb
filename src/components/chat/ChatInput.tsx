import React, { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { useChatContext } from '../../context/ChatContext';
import './styles.css';

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
  maxLength?: number;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  maxLength = 500
}) => {
  const {
    input,
    isLoading,
    dispatch
  } = useChatContext();

  const [rows, setRows] = useState(1);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextAreaHeight = useCallback(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      const newRows = Math.min(
        Math.max(
          Math.ceil(textAreaRef.current.scrollHeight / 24), // Assuming line height of 24px
          1
        ),
        5 // Maximum number of rows
      );
      setRows(newRows);
      textAreaRef.current.style.height = `${Math.min(textAreaRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      dispatch({ type: 'SET_INPUT', input: value });
      adjustTextAreaHeight();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (input.trim() && !disabled && !isLoading) {
      const message = input.trim();
      dispatch({ type: 'SET_INPUT', input: '' });
      setRows(1);
      if (textAreaRef.current) {
        textAreaRef.current.style.height = 'auto';
      }
      await onSendMessage(message);
    }
  };

  return (
    <div className="chat-input-container">
      <div className="input-wrapper">
        <textarea
          ref={textAreaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          rows={rows}
          disabled={disabled || isLoading}
          className="chat-textarea"
          aria-label="Message input"
        />
        {maxLength && (
          <div className="character-count">
            {input.length}/{maxLength}
          </div>
        )}
      </div>
      <button
        onClick={handleSend}
        disabled={!input.trim() || disabled || isLoading}
        className="send-button"
        aria-label="Send message"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="send-icon"
        >
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </div>
  );
};

export default ChatInput;