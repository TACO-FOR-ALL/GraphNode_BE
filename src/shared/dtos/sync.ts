import { ChatThread, ChatMessage } from './ai';
import { Note, Folder } from './note';

export interface SyncPushRequest {
  conversations?: ChatThread[];
  messages?: (ChatMessage & { conversationId: string })[];
  notes?: Note[];
  folders?: Folder[];
}

export interface SyncPullResponse {
  conversations: ChatThread[];
  messages: ChatMessage[];
  notes: Note[];
  folders: Folder[];
  serverTime: string; // ISO 8601
}

export interface SyncPullConversationsResponse {
  conversations: ChatThread[];
  messages: ChatMessage[];
  serverTime: string;
}

export interface SyncPullNotesResponse {
  notes: Note[];
  folders: Folder[];
  serverTime: string;
}
