import React from 'react';

interface DateSeparatorProps {
  date: string;
}

const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  const formatDate = (dateString: string): string => {
    const messageDate = new Date(dateString);
    if (isNaN(messageDate.getTime())) {
      return 'Recent';
    }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return messageDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="date-separator">
      <span className="date-text">{formatDate(date)}</span>
    </div>
  );
};

export default DateSeparator;