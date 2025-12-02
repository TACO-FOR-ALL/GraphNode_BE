import type { ConversationDto } from './conversation.js';
import type { MessageDto } from './message.js';
import type { NoteDto, FolderDto } from './note.js';

export interface SyncPushRequest {
  conversations?: ConversationDto[];
  messages?: (MessageDto & { conversationId: string })[];
  notes?: NoteDto[];
  folders?: FolderDto[];
}

export interface SyncPullResponse {
  conversations: ConversationDto[];
  messages: MessageDto[];
  notes: NoteDto[];
  folders: FolderDto[];
  serverTime: string; // ISO 8601
}
