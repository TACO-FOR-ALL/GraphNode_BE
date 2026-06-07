import type { Attachment, ChatMessage, ChatThread } from '../../../shared/dtos/ai';

/**
 * @description ZIP 내부 `export.json`에 포함되는 첨부파일 참조(바이너리는 ZIP 경로에 별도 저장).
 */
export interface ExportAttachmentRef {
  id: string;
  type: Attachment['type'];
  name: string;
  mimeType: string;
  size: number;
  /** 원본 S3 객체 키 (`chat-files/...`) */
  s3Key: string;
  /** ZIP 내부 상대 경로 */
  archivePath: string;
}

/**
 * @description보내기 JSON 메시지 한 건.
 */
export interface ExportMessagePayload {
  id: string;
  role: ChatMessage['role'];
  content: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  attachments?: ExportAttachmentRef[];
  metadata?: ChatMessage['metadata'];
}

/**
 * @description보내기 JSON 대화 한 건.
 */
export interface ExportConversationPayload {
  conversation: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    summary?: string;
  };
  messages: ExportMessagePayload[];
}

/**
 * @description ZIP 내부 `export.json` 루트 구조.
 */
export interface ChatExportPayload {
  exportedAt: string;
  exportScope: 'conversation' | 'all';
  conversations: ExportConversationPayload[];
}
