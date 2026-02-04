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
  id: string;
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
  title?: string;
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
   * - 파일 첨부 가능 (files 인자)
   * - 스트리밍 기본 지원 (Server-Sent Events)
   * - onStream 콜백을 통해 청크 수신 가능
   * - Promise는 최종 완료된 응답(AIChatResponseDto)으로 resolve됨 (기존 호환성 유지)
   *
   * @param conversationId - 대화 ID
   * @param dto - 채팅 요청 데이터
   * @param files - (선택) 업로드할 파일 리스트
   * @param onStream - (선택) 스트림 청크 수신 콜백
   */
  async chat(
    conversationId: string,
    dto: AIChatRequestDto,
    files?: File[],
    onStream?: (chunk: string) => void
  ): Promise<HttpResponse<AIChatResponseDto>> {
    const rb = this.rb.path(`/v1/ai/conversations/${conversationId}/chat`);

    // 1. Body 준비 (JSON or FormData)
    let body: unknown;
    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('id', dto.id);
      formData.append('model', dto.model);
      formData.append('chatContent', dto.chatContent);
      files.forEach((file) => formData.append('files', file));
      body = formData;
    } else {
      body = dto;
    }

    try {
      // 2. 요청 전송 (Accept: text/event-stream 강제)
      // sendRaw에 extraHeaders를 전달하여 요청
      const res = await rb.sendRaw('POST', body, { Accept: 'text/event-stream' });

      if (!res.ok) {
        let errBody;
        try {
          errBody = await res.json();
        } catch {
          errBody = await res.text();
        }
        return {
          isSuccess: false,
          error: { statusCode: res.status, message: res.statusText, body: errBody },
        };
      }

      // 3. 응답 처리 (SSE vs JSON)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        // SSE가 아니면 일반 JSON으로 처리 (Fallback)
        const json = await res.json();
        return { isSuccess: true, statusCode: res.status, data: json };
      }

      // 4. SSE 스트림 파싱
      if (!res.body) {
         throw new Error('Response body is empty');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AIChatResponseDto | null = null;
      let finalError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // SSE 이벤트 파싱 로직
        // 예: "event: chunk\ndata: {...}\n\n"
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; // 마지막 불완전한 부분은 버퍼에 남김

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
              
              if (eventName === 'chunk') {
                if (onStream) onStream(parsed.text);
              } else if (eventName === 'result') {
                finalResult = parsed;
              } else if (eventName === 'error') {
                finalError = parsed.message;
              }
            } catch {
               // JSON 파싱 에러 무시
            }
          }
        }
      }

      // 스트림 종료 후 처리
      if (finalError) {
        return {
          isSuccess: false,
          error: { statusCode: 500, message: finalError },
        };
      }

      if (!finalResult) {
        // result 이벤트 없이 끝난 경우 (예: 연결 끊김 등)
        return {
          isSuccess: false,
          error: { statusCode: 500, message: 'Stream ended without result' },
        };
      }

      return {
        isSuccess: true,
        statusCode: 201, // Created
        data: finalResult,
      };

    } catch (e) {
      return {
        isSuccess: false,
        error: {
          statusCode: 0,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  /**
   * AI 채팅 스트림을 엽니다.
   * @param conversationId
   * @param dto
   * @param onEvent
   * @param options
   */
  async chatStream(
    conversationId: string,
    dto: AIChatRequestDto,
    files: File[] = [],
    onEvent: (event: any) => void,
    options: { signal?: AbortSignal; fetchImpl?: any } = {}
  ): Promise<() => void> {
    const url = this.rb.path(`/v1/ai/conversations/${conversationId}/chat`).url();

    // Body 준비
    let body: any;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };

    if (files.length > 0) {
      const formData = new FormData();
      formData.append('id', dto.id);
      formData.append('model', dto.model);
      formData.append('chatContent', dto.chatContent);
      files.forEach((f) => formData.append('files', f));
      body = formData;
      // Content-Type for FormData is handled by browser/fetch
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(dto);
    }

    // Agent.ts의 openAgentChatStream 로직과 유사하게 구현 (여기서는 간소화된 fetch 호출)
    // 실제로는 http-builder가 스트리밍을 직접 지원하지 않으므로, fetch를 직접 호출해야 함.
    // this.rb의 credentials, headers 등을 재사용하고 싶지만 private임.
    // 여기서는 간단히 global fetch 사용 가정.

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const controller = new AbortController();
    const signal = options.signal || controller.signal;

    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal,
        credentials: 'include', // SDK 기본값 따름
      });

      if (!res.body) return () => controller.abort();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      (async () => {
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
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) dataStr = line.slice(5).trim();
            }

            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                onEvent({ event: eventName, data: parsed });
              } catch {
                // ignore
              }
            }
          }
        }
      })();
    } catch (e) {
      onEvent({ event: 'error', data: { message: String(e) } });
    }

    return () => controller.abort();
  }

  /**
   * AI 관련 파일을 다운로드합니다.
   * @param fileKey 파일 키 (S3 Key)
   * @returns Blob 객체
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
