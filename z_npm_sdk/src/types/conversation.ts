import type { MessageDto } from './message.js';

export interface ConversationDto {
  id: string; // FE generated UUID/ULID
  title: string;
  updatedAt: string; // RFC3339
  messages: MessageDto[];
}

export interface ConversationCreateDto {
  id: string;
  title: string;
  messages?: MessageDto[];
}

export interface ConversationUpdateDto {
  title?: string;
}

export interface ConversationBulkCreateDto {
  conversations: ConversationCreateDto[];
}
