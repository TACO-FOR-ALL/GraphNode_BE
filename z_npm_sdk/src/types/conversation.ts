import type { MessageDto } from './message.js';

export interface ConversationDto {
  id: string;
  title: string;
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  deletedAt?: string | null; // ISO 8601
  messages: MessageDto[];
}

export interface ConversationCreateDto {
  id?: string;
  title: string;
  messages?: MessageDto[];
}

export interface ConversationUpdateDto {
  title?: string;
}

export interface ConversationBulkCreateDto {
  conversations: ConversationCreateDto[];
}
