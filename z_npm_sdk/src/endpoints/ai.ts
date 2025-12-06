import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { ApiKeyModel } from '../types/me.js';
import type { MessageDto } from '../types/message.js';

export interface AIChatRequestDto {
  model: ApiKeyModel;
  chatContent: string;
}

export interface AIChatResponseDto {
  messages: MessageDto[];
}

export class AiApi {
  constructor(private rb: RequestBuilder) {}

  chat(conversationId: string, dto: AIChatRequestDto): Promise<HttpResponse<AIChatResponseDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/chat`).post<AIChatResponseDto>(dto);
  }
}
