import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  ConversationDto,
  ConversationCreateDto,
  ConversationUpdateDto,
  ConversationBulkCreateDto,
} from '../types/conversation.js';
import type { MessageCreateDto, MessageUpdateDto, MessageDto } from '../types/message.js';

export class ConversationsApi {
  constructor(private rb: RequestBuilder) {}

  create(dto: ConversationCreateDto): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path('/v1/ai/conversations').post<ConversationDto>(dto);
  }

  bulkCreate(
    dto: ConversationBulkCreateDto
  ): Promise<HttpResponse<{ conversations: ConversationDto[] }>> {
    return this.rb
      .path('/v1/ai/conversations/bulk')
      .post<{ conversations: ConversationDto[] }>(dto);
  }

  list(): Promise<HttpResponse<ConversationDto[]>> {
    return this.rb.path('/v1/ai/conversations').get<ConversationDto[]>();
  }

  get(conversationId: string): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).get<ConversationDto>();
  }

  update(
    conversationId: string,
    patch: ConversationUpdateDto
  ): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}`).patch<ConversationDto>(patch);
  }

  delete(conversationId: string, permanent?: boolean): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}`)
      .query({ permanent })
      .delete<{ ok: true }>();
  }

  restore(conversationId: string): Promise<HttpResponse<ConversationDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/restore`).post<ConversationDto>({});
  }

  // Messages nested under conversation
  createMessage(conversationId: string, dto: MessageCreateDto): Promise<HttpResponse<MessageDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/messages`).post<MessageDto>(dto);
  }

  updateMessage(
    conversationId: string,
    messageId: string,
    patch: MessageUpdateDto
  ): Promise<HttpResponse<MessageDto>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`)
      .patch<MessageDto>(patch);
  }

  deleteMessage(
    conversationId: string,
    messageId: string,
    permanent?: boolean
  ): Promise<HttpResponse<{ ok: true }>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}`)
      .query({ permanent })
      .delete<{ ok: true }>();
  }

  restoreMessage(conversationId: string, messageId: string): Promise<HttpResponse<MessageDto>> {
    return this.rb
      .path(`/v1/ai/conversations/${conversationId}/messages/${messageId}/restore`)
      .post<MessageDto>({});
  }
}
