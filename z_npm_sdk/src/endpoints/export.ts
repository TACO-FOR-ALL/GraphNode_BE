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
   * @description 단일 대화보내기 작업을 시작합니다.
   * @param conversationId 대화 ID
   */
  async startConversationExport(
    conversationId: string
  ): Promise<HttpResponse<StartChatExportResponseDto>> {
    return this.rb.path(`/v1/exports/conversations/${conversationId}`).post();
  }

  /**
   * @description 사용자의 전체 대화보내기 작업을 시작합니다.
   */
  async startAllExports(): Promise<HttpResponse<StartChatExportResponseDto>> {
    return this.rb.path('/v1/exports/all').post();
  }

  /**
   * @description보내기 작업 상태를 조회합니다.
   * @param jobId 작업 ID
   */
  async getStatus(jobId: string): Promise<HttpResponse<ChatExportStatusResponseDto>> {
    return this.rb.path(`/v1/exports/${jobId}`).get();
  }

  /**
   * @description 완료된보내기 ZIP을 Blob으로 다운로드합니다.
   * @param jobId 작업 ID
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
