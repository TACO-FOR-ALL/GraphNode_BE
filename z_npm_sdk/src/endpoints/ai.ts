import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { ApiKeyModel } from '../types/me.js';
import type { MessageDto } from '../types/message.js';

/**
 * AI 채팅 요청 DTO
 * @public
 * @property id FE가 만들어줄 message 용 uuid
 * @property model 사용할 AI 모델 (openai | deepseek)
 * @property chatContent 사용자 입력 메시지
 */
export interface AIChatRequestDto {
  id : string;
  model: ApiKeyModel;
  chatContent: string;
}

/**
 * AI 채팅 응답 DTO
 * @public
 * @property title 대화 제목 (선택적, 첫 대화 메시지에서 설정될 수 있음)
 * @property messages 생성된 메시지 목록 (사용자 메시지 + AI 응답 메시지)
 */
export interface AIChatResponseDto {
  title? : string;
  messages: MessageDto[];
}

/**
 * AI Chat API
 * 
 * AI 모델과의 실시간 채팅 기능을 제공하는 API 클래스입니다.
 * `/v1/ai` 엔드포인트 하위의 API들을 호출합니다.
 * 
 * 주요 기능:
 * - AI 채팅 메시지 전송 및 응답 수신 (`chat`)
 * 
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
