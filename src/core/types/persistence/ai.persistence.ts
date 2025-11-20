import type { ChatRole } from '../../../shared/dtos/ai';

export type Provider =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'gemini'
  | 'cohere'
  | 'mistral'
  | 'ollama'
  | 'openrouter'
  | 'unknown';

export type Source = 'api' | 'export' | 'import';

/**
 * Conversation Document (MongoDB)
 * Collection: conversations
 */
export interface ConversationDoc {
  _id: string; // UUID/ULID
  ownerUserId: string;
  title: string;
  updatedAt: number;
  createdAt?: number;
  provider?: Provider;
  model?: string;
  source?: Source;
  tags?: string[];
}

/**
 * Message Document (MongoDB)
 * Collection: messages
 */
export interface MessageDoc {
  _id: string; // UUID/ULID
  conversationId: string;
  role: ChatRole;
  content: string;
  ts: number;
  createdAt: number;
  updatedAt: number;
}
