import React from 'react';

interface TypingIndicatorProps {
  showAvatar: boolean;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ showAvatar }) => {
  const UserAvatar = () => (
    <div className="user-avatar">
      <div className="avatar-text">You</div>
    </div>
  );

  return (
    <div className="message user-message typing">
      {showAvatar && <UserAvatar />}
      <div className="message-bubble">
        <div className="typing-content">
          <span className="typing-text">Typing</span>
          <span className="typing-animation">
            <span className="dot">.</span>
            <span className="dot">.</span>
            <span className="dot">.</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;