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
   * 스트리밍 요청 (AsyncGenerator 반환 권장)
   */
  requestStream(
    apiKey: string,
    model: string,
    messages: ChatMessageRequest[]
  ): Promise<Result<AsyncIterable<any>>>;

  /**
   * 사용자 메시지 기반으로 스레드 제목 생성
   */
  /**
   * 사용자 메시지 기반으로 스레드 제목 생성
   */
  requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>>;

  // --- Assistants API (Stateful) & File Search ---

  /**
   * 파일 업로드 (OpenAI Files API 등)
   */
  uploadFile(
    apiKey: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    purpose?: 'assistants' | 'vision'
  ): Promise<Result<{ fileId: string }>>;

  /**
   * 스레드 생성
   */
  createThread(apiKey: string): Promise<Result<{ threadId: string }>>;

  /**
   * Assistant 생성
   */
  createAssistant(apiKey: string): Promise<Result<{ assistantId: string }>>;

  /**
   * 스레드에 메시지 추가
   */
  addMessage(
    apiKey: string,
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    fileIds?: string[]
  ): Promise<Result<any>>;

  /**
   * Assistant 실행 및 스트리밍
   */
  runAssistantStream(
    apiKey: string,
    assistantId: string,
    threadId: string
  ): Promise<Result<AsyncIterable<any>>>;
}
