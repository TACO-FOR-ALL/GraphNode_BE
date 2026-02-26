/**
 * GraphNode SDK Entry Point
 * @packageDocumentation
 */

// Barrel exports: 공개 API만 노출
export { createGraphNodeClient, GraphNodeClient } from './client.js';
// 내부 전송 레이어는 노출 최소화: HttpError만 공개 (RequestBuilder는 @internal)
export type { HttpResponse } from './http-builder.js';

// Endpoint classes (선택적으로 직접 사용 가능)
export { HealthApi } from './endpoints/health.js';
export { MeApi } from './endpoints/me.js';
export { ConversationsApi } from './endpoints/conversations.js';
export { GoogleAuthApi } from './endpoints/auth.google.js';
export { GraphApi } from './endpoints/graph.js';
export { GraphAiApi } from './endpoints/graphAi.js';
export { NoteApi } from './endpoints/note.js';
export { AppleAuthApi } from './endpoints/auth.apple.js';
export { SyncApi } from './endpoints/sync.js';
export { AiApi } from './endpoints/ai.js';
export { NotificationApi } from './endpoints/notification.js';
export { FileApi } from './endpoints/file.js';

// Types
export type { ProblemDetails } from './types/problem.js';
export type {
  MeResponseDto,
  UserProfileDto,
  ApiKeysResponseDto,
  ApiKeyModel,
  UpdateApiKeyRequestDto,
  OpenAiAssistantIdResponseDto,
  UpdateOpenAiAssistantIdRequestDto,
  PreferredLanguageResponseDto,
  UpdatePreferredLanguageRequestDto,
} from './types/me.js';
export type {
  ConversationDto,
  ConversationCreateDto,
  ConversationUpdateDto,
  ConversationBulkCreateDto,
} from './types/conversation.js';
export type { MessageDto, MessageCreateDto, MessageUpdateDto } from './types/message.js';
export type {
  NoteDto,
  NoteCreateDto,
  NoteUpdateDto,
  FolderDto,
  FolderCreateDto,
  FolderUpdateDto,
} from './types/note.js';
export type { SyncPushRequest, SyncPullResponse } from './types/sync.js';
export type { FileAttachment, FileUploadResponse } from './types/file.js';
export type {
  AgentChatMode,
  AgentChatModeHint,
  AgentChatStreamEvent,
  AgentChatStreamParams,
  AgentChatStreamOptions,
  AgentChatStreamHandler,
} from './endpoints/agent.js';
export { openAgentChatStream } from './endpoints/agent.js';
export type { AIChatRequestDto, AIChatResponseDto } from './endpoints/ai.js';
export { AiStreamEvent } from './types/ai-event.js';
export type { GraphGenerationResponseDto } from './types/graphAi.js';
export type {
  AiInputData,
  AiInputMappingNode,
  AiInputMessage,
  AiInputMessageAuthor,
  AiInputMessageContent,
} from './types/aiInput.js';
