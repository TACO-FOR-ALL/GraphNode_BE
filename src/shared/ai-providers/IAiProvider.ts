import { ChatMessage, Attachment } from '../dtos/ai';
import { StoragePort } from '../../core/ports/StoragePort';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * LLM에게 전달할 채팅 생성 파라미터
 * @param model LLM 모델명
 * @param messages 채팅 메시지 히스토리
 */
export interface ChatGenerationParams {
  model?: string;
  messages: ChatMessage[];
}

/**
 * LLM의 응답 구조
 * @param content LLM의 응답 내용
 * @param attachments LLM이 생성한 첨부파일
 * @param usage LLM의 사용량
 * @param metadata LLM의 메타데이터
 */
export interface AiResponse {
  content: string;
  attachments: Attachment[];
  usage?: any;
  metadata?: any;
}

export interface IAiProvider {
  /**
   * API Key 유효성 검사
   */
  checkAPIKeyValid(apiKey: string): Promise<Result<true>>;

  /**
   * 통합 채팅 생성 메서드 (Stateless & Responses API / Chat Completion)
   * 
   * @param apiKey API Key
   * @param params 채팅 생성 파라미터 (모델, 메시지 히스토리 등)
   * @param onStream 스트리밍 콜백 (텍스트 델타)
   * @param storageAdapter 파일 처리를 위한 스토리지 어댑터 (Optional)
   */
  generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>>;

  /**
   * 사용자 메시지 기반으로 스레드 제목 생성
   * (Legacy compatible, but could be refactored into generateChat with specific prompt)
   */
  requestGenerateThreadTitle(
    apiKey: string,
    firstUserMessage: string,
    opts?: { timeoutMs?: number }
  ): Promise<Result<string>>;

  /**
   * 파일 업로드 (Legacy support for OpenAI Assistants/Responses API)
   * Optional: Only required if provider supports file uploads directly
   */
  uploadFile?(
    apiKey: string,
    file: { buffer: Buffer; filename: string; mimetype: string },
    purpose?: 'assistants' | 'vision' | 'responses'
  ): Promise<Result<{ fileId: string }>>;

  /**
   * 파일 다운로드 (Optional)
   * @param apiKey API Key
   * @param fileId 파일 ID
   */
  downloadFile?(apiKey: string, fileId: string): Promise<Result<{ buffer: Buffer; filename?: string; mimeType?: string }>>;
}
