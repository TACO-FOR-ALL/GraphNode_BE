import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { ApiKeyModel } from '../types/me.js';
import type { MessageDto } from '../types/message.js';

/**
 * AI 채팅 요청 DTO
 * @public
 * @property model 사용할 AI 모델 (openai | deepseek)
 * @property chatContent 사용자 입력 메시지
 */
export interface AIChatRequestDto {
  model: ApiKeyModel;
  chatContent: string;
}

/**
 * AI 채팅 응답 DTO
 * @public
 * @property messages 생성된 메시지 목록 (사용자 메시지 + AI 응답 메시지)
 */
export interface AIChatResponseDto {
  messages: MessageDto[];
}

/**
 * AI API 클라이언트
 * @public
 */
export class AiApi {
  constructor(private rb: RequestBuilder) {}

  /**
   * 대화 내에서 AI와 채팅을 진행합니다.
   * @param conversationId - 대화 ID
   * @param dto - 채팅 요청 데이터
   *    - `model` ('openai' | 'deepseek'): 사용할 AI 모델
   *    - `chatContent` (string): 사용자 입력 메시지 내용
   * @returns 업데이트된 메시지 목록
   *    - `messages` (MessageDto[]): 생성된 메시지 목록 (사용자 메시지 + AI 응답 메시지)
   * @example
   * const response = await client.ai.chat('c_123', {
   *   model: 'openai',
   *   chatContent: 'Hello, how are you?'
   * });
   * console.log(response.data);
   * // Output:
   * {
   *   messages: [
   *     {
   *       id: 'm_user_1',
   *       role: 'user',
   *       content: 'Hello, how are you?',
   *       createdAt: '2024-02-20T10:00:00Z',
   *       ...
   *     },
   *     {
   *       id: 'm_ai_1',
   *       role: 'assistant',
   *       content: 'I am doing well, thank you!',
   *       createdAt: '2024-02-20T10:00:01Z',
   *       ...
   *     }
   *   ]
   * }
   */
  chat(conversationId: string, dto: AIChatRequestDto): Promise<HttpResponse<AIChatResponseDto>> {
    return this.rb.path(`/v1/ai/conversations/${conversationId}/chat`).post<AIChatResponseDto>(dto);
  }
}
