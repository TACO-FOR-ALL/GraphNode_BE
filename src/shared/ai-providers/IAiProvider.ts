import { ChatMessageRequest } from './ChatMessageRequest';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface IAiProvider {
  /**
   * API Key 유효성 검사
   */
  checkAPIKeyValid(apiKey: string): Promise<Result<true>>;

  /**
   * 스트리밍 없는 요청 (단건 응답)
   */
  requestWithoutStream(
    apiKey: string,
    model: string,
    messages: ChatMessageRequest[]
  ): Promise<Result<any>>;

  /**
   * 스트리밍 요청
   */
  request(
    apiKey: string,
    stream: boolean,
    model: string,
    messages: ChatMessageRequest[]
  ): Promise<Result<any>>;

  /**
   * 사용자 메시지 기반으로 스레드 제목 생성
   */
  requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>>;
}
