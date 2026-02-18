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

  /**
   * Responses API 요청 (OpenAI Responses)
   * @param apiKey API Key
   * @param params 요청 파라미터 (model, input, tools, previous_response_id 등)
   */
  createResponse(
    apiKey: string,
    params: {
      model: string;
      input: any[];
      tools?: any[];
      tool_resources?: any;
      previous_response_id?: string;
      store?: boolean;
    }
  ): Promise<Result<AsyncIterable<any>>>;

  // --- Assistants API (Stateful) & File Search ---

  /**
   * 파일 업로드 (OpenAI Files API 등)
   */
  uploadFile(
    apiKey: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    purpose?: 'assistants' | 'vision' | 'responses'
  ): Promise<Result<{ fileId: string }>>;

  /**
   * 스레드 생성
   * @deprecated Responses API does not use explicit threads.
   */
  createThread(apiKey: string): Promise<Result<{ threadId: string }>>;

  /**
   * Assistant 생성
   * @deprecated Responses API does not use explicit assistants.
   */
  createAssistant(apiKey: string): Promise<Result<{ assistantId: string }>>;

  /**
   * 스레드에 메시지 추가
   * @deprecated Responses API handles messages in input array.
   */
  addMessage(
    apiKey: string,
    threadId: string,
    role: 'user' | 'assistant',
    content: string | Array<any>,
    fileIds?: string[]
  ): Promise<Result<any>>;

  /**
   * Assistant 실행 및 스트리밍
   * @deprecated Responses API uses createResponse.
   */
  runAssistantStream(
    apiKey: string,
    assistantId: string,
    threadId: string
  ): Promise<Result<AsyncIterable<any>>>;
}
