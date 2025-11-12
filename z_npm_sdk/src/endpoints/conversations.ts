import { RequestBuilder } from '../http-builder.js';
import type { ConversationDto, ConversationCreateDto, ConversationUpdateDto, ConversationBulkCreateDto } from '../types/conversation.js';
import type { MessageCreateDto, MessageUpdateDto, MessageDto } from '../types/message.js';

export class ConversationsApi {
  constructor(private rb: RequestBuilder) {}

  create(dto: ConversationCreateDto): Promise<ConversationDto> {
    return this.rb.path('/v1/ai/conversations').post<ConversationDto>(dto);
  }

  bulkCreate(
    dto: ConversationBulkCreateDto
  ): Promise<{ conversations: ConversationDto[] }> {
    return this.rb
      .path('/v1/ai/conversations/bulk')
      .post<{ conversations: ConversationDto[] }>(dto);
  }

  list(): Promise<ConversationDto[]> {
    return this.rb.path('/v1/ai/conversations').get<ConversationDto[]>();
  }

  get(conversationId: string): Promise<ConversationDto> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).get<ConversationDto>();
  }

  update(conversationId: string, patch: ConversationUpdateDto): Promise<ConversationDto> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).patch<ConversationDto>(patch);
  }

  delete(conversationId: string): Promise<{ ok: true }> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).delete<{ ok: true }>();
  }

  // Messages nested under conversation
  createMessage(conversationId: string, dto: MessageCreateDto): Promise<MessageDto> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/messages`).post<MessageDto>(dto);
  }

  updateMessage(conversationId: string, messageId: string, patch: MessageUpdateDto): Promise<MessageDto> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`).patch<MessageDto>(patch);
  }

  deleteMessage(conversationId: string, messageId: string): Promise<{ ok: true }> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`).delete<{ ok: true }>();
  }
}
