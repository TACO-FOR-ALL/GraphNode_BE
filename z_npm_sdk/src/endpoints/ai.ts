import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { ApiKeyModel } from '../types/me.js';
import type { MessageDto } from '../types/message.js';
import { AiStreamEvent } from '../types/ai-event.js';

/**
 * AI 채팅 요청 DTO
 * @public
 * @prop id FE가 만들어줄 message 용 uuid
 * @prop model AI 모델
 * @prop chatContent AI 챗 대화 내용
 * @prop modelName AI 모델 이름
 */
export interface AIChatRequestDto {
  id: string;
  model: ApiKeyModel;
  chatContent: string;
  modelName?: string;
}

/**
 * AI 채팅 응답 DTO
 * @public
 * @property title 대화 제목 (선택적, 첫 대화 메시지에서 설정될 수 있음)
 * @property messages 생성된 메시지 목록 (사용자 메시지 + AI 응답 메시지)
 */
export interface AIChatResponseDto {
  title?: string;
  messages: MessageDto[];
}

/**
 * RAG 채팅 요청 DTO (FE 책임 기반)
 * @public
 */
export interface AIRagChatRequestDto {
  id: string;
  model: ApiKeyModel;
  chatContent: string;
  modelName?: string;
  retrievedContext: MessageDto[];
  recentMessages: MessageDto[];
}

/**
 * AI 챗 재시도 요청 DTO
 * @public
 * @prop model AI 모델
 * @prop modelName 구체적인 모델명 (선택)
 */
export interface AIChatRetryRequestDto {
  model: ApiKeyModel;
  modelName?: string;
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
   * 대화 내에서 AI와 채팅을 진행합니다. (표준 요청/응답 방식)
   *
   * @remarks
   * 내부적으로 Server-Sent Events(SSE)를 사용하지만, Promise는 AI의 최종 응답이 모두 수신된 후 resolve됩니다.
   * 실시간 글자 단위 업데이트가 필요하면 `onStream` 콜백을 사용하세요.
   *
   * @param conversationId - 대화 ID (ULID/UUID)
   * @param dto - 채팅 요청 데이터 (id, model, chatContent 등)
   * @param files - (선택) 업로드할 파일 리스트 (이미지, 문서 등)
   * @param onStream - (선택) 실시간 텍스트 청크 수신 콜백
   * @returns AI 응답 DTO 및 HTTP 상태 코드
   * @throws {Error} 네트워크 오류 또는 스트림 처리 실패 시
   *
   * **응답 상태 코드:**
   * - `201 Created`: AI 응답 생성 성공 (SSE 스트림 완료 후 SDK가 설정)
   * - `400 Bad Request`: chatContent가 비어있거나 지원하지 않는 모델 지정
   * - `401 Unauthorized`: 인증되지 않은 요청 (세션 만료)
   * - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
   * - `404 Not Found`: conversationId에 해당하는 대화가 존재하지 않음
   * - `429 Too Many Requests`: AI 공급자 Rate Limit 초과 (재시도 가능)
   * - `502 Bad Gateway`: AI 공급자 오류 (재시도 가능)
   * - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)
   *
   * @example
   * const res = await client.ai.chat('conv_123', { 
   *   id: 'msg_1', 
   *   model: 'openai', 
   *   chatContent: '안녕?' 
   * }, [], (text) => console.log(text));
   */
  async chat(
    conversationId: string,
    dto: AIChatRequestDto,
    files?: File[],
    onStream?: (chunk: string) => void
  ): Promise<HttpResponse<AIChatResponseDto>> {
    return this._handleChatRequest(`/v1/ai/conversations/${conversationId}/chat`, dto, files, onStream);
  }

  /**
   * AI 채팅 스트림을 엽니다. (SSE 고수준 제어용)
   * 
   * @remarks
   * 이 메서드는 SSE 이벤트를 직접 제어할 수 있는 저수준 API입니다.
   * `AiStreamEvent` 타입을 통해 이벤트별 분기 처리가 가능합니다.
   * 
   * 주요 이벤트:
   * - `chunk`: 텍스트 스트림 조각 수신 (`{ text: string }`)
   * - `result`: 최종 답변 및 메시지 목록 수신 (`AIChatResponseDto`)
   * - `error`: 서버 측 처리 오류 발생 (`{ message: string }`)
   * 
   * @param conversationId - 대화 ID
   * @param dto - 채팅 요청 데이터
   * @param files - (선택) 업로드할 파일 리스트 (기본값: [])
   * @param onEvent - SSE 이벤트 수신 콜백 ({ event: string, data: any })
   * @param options - 추가 옵션 (AbortSignal을 통한 요청 취소 지원)
   * @returns 스트림 중단(abort) 함수
   * 
   * @example
   * const abort = await client.ai.chatStream('conv_123', { id: 'msg_1', model: 'openai', chatContent: 'Tell me a story' }, [], (event) => {
   *   if (event.event === 'chunk') console.log(event.data.text);
   *   if (event.event === 'result') console.log('Done:', event.data.messages);
   * });
   * // 필요 시 호출: abort();
   */
  async chatStream(
    conversationId: string,
    dto: AIChatRequestDto,
    files: File[] = [],
    onEvent: (event: any) => void,
    options: { signal?: AbortSignal; fetchImpl?: any } = {}
  ): Promise<() => void> {
    return this._handleChatStream(`/v1/ai/conversations/${conversationId}/chat`, dto, files, onEvent, options);
  }

  /**
   * 대화 내역의 마지막 AI 응답을 삭제하고 다시 응답을 요청합니다. (재시도)
   *
   * @remarks
   * 이 메서드는 대화 기록 중 가장 최근의 메시지가 AI의 응답인지 확인한 후, 이를 영구 삭제하고
   * 바로 이전까지의 대화 내역으로 AI에게 새로운 응답을 생성하도록 백엔드에 요청합니다.
   *
   * @param conversationId - 대화 ID
   * @param dto - 재시도 요청 데이터 (model, modelName)
   * @param onStream - (선택) 실시간 텍스트 청크 수신 콜백
   * @returns AI 응답 DTO 및 HTTP 상태 코드
   *
   * **응답 상태 코드:**
   * - `201 Created`: 재시도 AI 응답 생성 성공
   * - `400 Bad Request`: conversationId 누락 또는 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
   * - `404 Not Found`: conversationId에 해당하는 대화가 존재하지 않음
   * - `429 Too Many Requests`: AI 공급자 Rate Limit 초과 (재시도 가능)
   * - `502 Bad Gateway`: AI 공급자 오류 (재시도 가능)
   * - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)
   *
   * @example
   * const res = await client.ai.chatRetry('conv_123', {
   *   model: 'openai'
   * }, (text) => console.log(text));
   */
  async chatRetry(
    conversationId: string,
    dto: AIChatRetryRequestDto,
    files?: File[],
    onStream?: (chunk: string) => void
  ): Promise<HttpResponse<AIChatResponseDto>> {
    return this._handleChatRequest(`/v1/ai/conversations/${conversationId}/chat/retry`, dto, files, onStream);
  }

  /**
   * AI 채팅 재시도 스트림을 엽니다. (SSE 고수준 제어용)
   * 
   * @remarks
   * 마지막 응답을 삭제하고 새 응답을 받아오는 과정을 스트리밍으로 세밀하게 제어합니다.
   * 
   * @param conversationId - 대화 ID
   * @param dto - 재시도 요청 데이터
   * @param files - 첨부 파일
   * @param onEvent - SSE 이벤트 수신 콜백 ({ event: string, data: any })
   * @param options - AbortSignal 등 추가 옵션
   * @returns 스트림 중단(abort) 함수
   * 
   * @example
   * const abort = await client.ai.chatRetryStream('conv_123', { model: 'openai' }, undefined, (event) => {
   *   if (event.event === 'chunk') console.log(event.data.text);
   * });
   */
  async chatRetryStream(
    conversationId: string,
    dto: AIChatRetryRequestDto,
    files: File[] | undefined,
    onEvent: (event: any) => void,
    options: { signal?: AbortSignal; fetchImpl?: any } = {}
  ): Promise<() => void> {
    return this._handleChatStream(`/v1/ai/conversations/${conversationId}/chat/retry`, dto, files || [], onEvent, options);
  }

  /**
   * RAG 기반 채팅을 진행합니다. (FE가 검색한 맥락 포함 요청)
   *
   * @remarks
   * 사용자가 현재 보고 있는 문서 조각이나 관련 과거 대화(`retrievedContext`)를 백엔드에 직접 전달하여,
   * 서버 측의 별도 벡터 검색 없이도 정확한 답변을 유도할 수 있는 API입니다.
   *
   * @param conversationId - 대화 ID
   * @param dto - RAG 요청 데이터 (retrievedContext, recentMessages 포함)
   * @param files - 첨부 파일
   * @param onStream - 실시간 텍스트 콜백
   * @returns AI 응답 DTO
   *
   * **응답 상태 코드:**
   * - `201 Created`: RAG AI 응답 생성 성공
   * - `400 Bad Request`: chatContent 또는 맥락 데이터 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `403 Forbidden`: 해당 모델의 API 키가 설정되지 않음
   * - `404 Not Found`: conversationId에 해당하는 대화가 존재하지 않음
   * - `429 Too Many Requests`: AI 공급자 Rate Limit 초과 (재시도 가능)
   * - `502 Bad Gateway`: AI 공급자 오류 (재시도 가능)
   * - `504 Gateway Timeout`: AI 공급자 응답 시간 초과 (재시도 가능)
   *
   * @example
   * const res = await client.ai.ragChat('conv_123', {
   *   id: 'msg_2',
   *   model: 'openai',
   *   chatContent: '이 문서 내용을 요약해줘',
   *   retrievedContext: [{ role: 'user', content: '문서 본문 내용...' }],
   *   recentMessages: []
   * });
   */
  async ragChat(
    conversationId: string,
    dto: AIRagChatRequestDto,
    files?: File[],
    onStream?: (chunk: string) => void
  ): Promise<HttpResponse<AIChatResponseDto>> {
    return this._handleChatRequest(`/v1/ai/conversations/${conversationId}/rag-chat`, dto, files, onStream);
  }

  /**
   * RAG 기반 채팅 스트림을 엽니다. (고수준 제어용)
   * 
   * @param conversationId - 대화 ID
   * @param dto - RAG 요청 데이터
   * @param files - 첨부 파일
   * @param onEvent - SSE 이벤트 수신 콜백
   * @param options - AbortSignal 등 추가 옵션
   * @returns 스트림 중단 함수
   * @see chatStream 이벤트 구조 참고
   * 
   * @example
   * await client.ai.ragChatStream('conv_123', ragDto, [], (ev) => { ... });
   */
  async ragChatStream(
    conversationId: string,
    dto: AIRagChatRequestDto,
    files: File[] = [],
    onEvent: (event: any) => void,
    options: { signal?: AbortSignal; fetchImpl?: any } = {}
  ): Promise<() => void> {
    return this._handleChatStream(`/v1/ai/conversations/${conversationId}/rag-chat`, dto, files, onEvent, options);
  }

  /**
   * 공통 채팅 요청 처리기 (내부용)
   */
  private async _handleChatRequest(
    path: string,
    dto: any,
    files?: File[],
    onStream?: (chunk: string) => void
  ): Promise<HttpResponse<AIChatResponseDto>> {
    const rb = this.rb.path(path);
    let body: unknown;
    if (files && files.length > 0) {
      const formData = new FormData();
      Object.entries(dto).forEach(([k, v]) => {
        if (typeof v === 'object') formData.append(k, JSON.stringify(v));
        else formData.append(k, String(v));
      });
      files.forEach((f) => formData.append('files', f));
      body = formData;
    } else {
      body = dto;
    }

    try {
      const res = await rb.sendRaw('POST', body, { Accept: 'text/event-stream' });
      if (!res.ok) {
        let errBody;
        try { errBody = await res.json(); } catch { errBody = await res.text(); }
        return { isSuccess: false, error: { statusCode: res.status, message: res.statusText, body: errBody } };
      }
      
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        const json = await res.json();
        return { isSuccess: true, statusCode: res.status, data: json };
      }

      if (!res.body) throw new Error('Response body is empty');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AIChatResponseDto | null = null;
      let finalError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let eventName = 'message';
          let dataStr = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) eventName = trimmed.slice(6).trim();
            else if (trimmed.startsWith('data:')) dataStr = trimmed.slice(5).trim();
          }
          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventName === AiStreamEvent.CHUNK && onStream) onStream(parsed.text);
              else if (eventName === AiStreamEvent.RESULT) finalResult = parsed;
              else if (eventName === AiStreamEvent.ERROR) finalError = parsed.message;
            } catch { /* ignore */ }
          }
        }
      }

      if (finalError) return { isSuccess: false, error: { statusCode: 500, message: finalError } };
      if (!finalResult) return { isSuccess: false, error: { statusCode: 500, message: 'Stream ended without result' } };

      return { isSuccess: true, statusCode: 201, data: finalResult };
    } catch (e) {
      return { isSuccess: false, error: { statusCode: 0, message: e instanceof Error ? e.message : String(e) } };
    }
  }

  /**
   * 공통 채팅 스트림 처리기 (내부용)
   */
  private async _handleChatStream(
    path: string,
    dto: any,
    files: File[],
    onEvent: (event: any) => void,
    options: { signal?: AbortSignal }
  ): Promise<() => void> {
    const rb = this.rb.path(path);
    const controller = new AbortController();
    const signal = options.signal || controller.signal;
    let body: any;
    if (files.length > 0) {
      const formData = new FormData();
      Object.entries(dto).forEach(([k, v]) => {
        if (typeof v === 'object') formData.append(k, JSON.stringify(v));
        else formData.append(k, String(v));
      });
      files.forEach((f) => formData.append('files', f));
      body = formData;
    } else {
      body = dto;
    }

    rb.sendRaw('POST', body, { Accept: 'text/event-stream' }).then(async (res) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let eventName = 'message';
          let dataStr = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) eventName = trimmed.slice(6).trim();
            else if (trimmed.startsWith('data:')) dataStr = trimmed.slice(5).trim();
          }
          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              onEvent({ event: eventName, data: parsed });
            } catch { /* ignore */ }
          }
        }
      }
    }).catch(e => {
      if (!signal.aborted) onEvent({ event: AiStreamEvent.ERROR, data: { message: String(e) } });
    });
    return () => controller.abort();
  }

  /**
   * AI 관련 파일을 다운로드합니다.
   * @param fileKey - 파일 키 (S3 Key)
   * @returns BloB 객체 (이미지, 문서 등)
   * @example
   * const blob = await client.ai.downloadFile('chat-files/123-abc.png');
   * const url = URL.createObjectURL(blob);
   */
  async downloadFile(fileKey: string): Promise<Blob> {
    const rb = this.rb.path(`/v1/ai/files/${fileKey}`);
    const res = await rb.sendRaw('GET', undefined, {});

    if (!res.ok) {
      throw new Error(`Failed to download file: ${res.statusText}`);
    }

    return await res.blob();
  }
}
