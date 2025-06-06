/**
 * Elite Chat Interface - Type Definitions
 */

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  isTyping?: boolean;
  attachments?: Attachment[];
  reactions?: Reaction[];
  metadata?: Record<string, any>;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'audio' | 'video' | 'link';
  url: string;
  name?: string;
  size?: number;
  thumbnail?: string;
  metadata?: Record<string, any>;
}

export interface Reaction {
  id: string;
  emoji: string;
  count: number;
  users: string[];
}

export interface ChatOptions {
  showAvatars?: boolean;
  enableReactions?: boolean;
  enableAttachments?: boolean;
  messageLimit?: number;
  autoScroll?: boolean;
  typingIndicatorTimeout?: number;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  status?: 'online' | 'away' | 'offline';
  isTyping?: boolean;
}

export type Theme = 'light' | 'dark';