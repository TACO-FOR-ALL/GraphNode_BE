import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  ChatExportStatusResponseDto,
  StartChatExportResponseDto,
} from '../types/chatExport.js';

/**
 * Chat export API (`/v1/exports`).
 *
 * - 단일 대화 ZIP보내기
 * - 전체 대화 ZIP보내기
 * - 작업 상태 폴링 및 다운로드
 *
 * @public
 */
export class ExportApi {
  constructor(private readonly rb: RequestBuilder) {}

  /**
   * 단일 대화(Conversation)의 내역을 비동기적으로 내보내기(Export) 시작합니다.
   * 내보내기 작업은 서버 백그라운드에서 실행되며, 작업 완료 시 이메일로 알림이 발송됩니다.
   *
   * @param conversationId 내보낼 대상 대화의 ID
   * @returns 내보내기 작업의 시작 상태 및 jobId 정보를 포함한 응답
   *
   * **응답 상태 코드:**
   * - `202 Accepted`: 내보내기 작업이 성공적으로 큐에 등록됨
   * - `400 Bad Request`: conversationId가 누락되었거나 유효하지 않음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 대화가 존재하지 않음
   * - `409 Conflict`: 이미 해당 대화에 대한 내보내기 작업이 진행 중임
   *
   * @example
   * const response = await client.export.startConversationExport('conv-123');
   * console.log('Job ID:', response.data.jobId);
   * console.log('Status:', response.data.status); // 'PENDING'
   */
  async startConversationExport(
    conversationId: string
  ): Promise<HttpResponse<StartChatExportResponseDto>> {
    return this.rb.path(`/v1/exports/conversations/${conversationId}`).post();
  }

  /**
   * 사용자의 전체 대화 내역에 대한 비동기 내보내기(Export) 작업을 시작합니다.
   * 내보내기 작업은 서버 백그라운드에서 실행되며, 완료 시 이메일로 알림이 발송됩니다.
   *
   * @returns 내보내기 작업의 시작 상태 및 jobId 정보를 포함한 응답
   *
   * **응답 상태 코드:**
   * - `202 Accepted`: 내보내기 작업이 성공적으로 큐에 등록됨
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `409 Conflict`: 이미 전체 내보내기 작업이 진행 중임
   *
   * @example
   * const response = await client.export.startAllExports();
   * console.log('Job ID:', response.data.jobId);
   * console.log('Status:', response.data.status); // 'PENDING'
   */
  async startAllExports(): Promise<HttpResponse<StartChatExportResponseDto>> {
    return this.rb.path('/v1/exports/all').post();
  }

  /**
   * 진행 중이거나 완료된 내보내기 작업의 상태를 조회합니다.
   * 작업이 `DONE` 상태로 완료되면 `downloadUrl`이 포함되어 반환됩니다.
   *
   * @param jobId 조회할 내보내기 작업의 ID
   * @returns 내보내기 작업의 현재 상태 (상태, 에러 메시지, 다운로드 URL 등)
   *
   * **응답 상태 코드:**
   * - `200 OK`: 상태 조회 성공
   * - `400 Bad Request`: jobId 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 작업이 존재하지 않음
   *
   * @example
   * const response = await client.export.getStatus('job-1234');
   * if (response.data.status === 'DONE') {
   *   console.log('Download URL:', response.data.downloadUrl);
   * } else {
   *   console.log('Current Status:', response.data.status); // 'PROCESSING'
   * }
   */
  async getStatus(jobId: string): Promise<HttpResponse<ChatExportStatusResponseDto>> {
    return this.rb.path(`/v1/exports/${jobId}`).get();
  }

  /**
   * 성공적으로 완료된 내보내기 파일(ZIP)을 Blob 형태로 다운로드합니다.
   *
   * @param jobId 다운로드할 완료된 작업의 ID
   * @returns ZIP 파일의 Blob 데이터
   *
   * **응답 상태 코드:**
   * - `200 OK`: 다운로드 성공
   * - `400 Bad Request`: jobId 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 작업이 존재하지 않거나 파일이 삭제됨
   * - `409 Conflict`: 아직 작업이 완료되지 않아 파일이 준비되지 않음
   *
   * @example
   * const blob = await client.export.download('job-1234');
   * const url = window.URL.createObjectURL(blob);
   * const a = document.createElement('a');
   * a.href = url;
   * a.download = 'export.zip';
   * document.body.appendChild(a);
   * a.click();
   * window.URL.revokeObjectURL(url);
   */
  async download(jobId: string): Promise<Blob> {
    const res = await this.rb.path(`/v1/exports/${jobId}/download`).sendRaw('GET', undefined, {});

    if (!res.ok) {
      throw new Error(`Failed to download chat export: ${res.status} ${res.statusText}`);
    }

    return await res.blob();
  }

  /** @deprecated {@link startConversationExport} 사용 */
  async startChatExport(
    conversationId: string
  ): Promise<HttpResponse<StartChatExportResponseDto>> {
    return this.startConversationExport(conversationId);
  }

  /** @deprecated {@link getStatus} 사용 */
  async getChatExportStatus(
    jobId: string
  ): Promise<HttpResponse<ChatExportStatusResponseDto>> {
    return this.getStatus(jobId);
  }

  /** @deprecated {@link download} 사용 */
  async downloadChatExport(jobId: string): Promise<Blob> {
    return this.download(jobId);
  }
}
