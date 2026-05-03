import type { ChatExportJobDoc } from '../types/persistence/chat_export.persistence';

/**
 * 모듈: ChatExportRepository Port
 *
 * 책임:
 * - 채팅 내보내기 작업 메타데이터를 영속화합니다.
 */
export interface ChatExportRepository {
  /**
   * @description 내보내기 작업 문서를 생성합니다.
   * @param job 저장할 작업 문서. `jobId`는 ULID 등 전역 유일 값이어야 합니다.
   */
  create(job: ChatExportJobDoc): Promise<void>;

  /**
   * @description 사용자 소유의 작업을 jobId로 조회합니다.
   * @param jobId 작업 식별자
   * @param userId 소유자 사용자 ID
   */
  findByJobId(jobId: string, userId: string): Promise<ChatExportJobDoc | null>;

  /**
   * @description 작업 문서를 부분 갱신합니다.
   * @param jobId 작업 식별자
   * @param userId 소유자 사용자 ID
   * @param patch 갱신 필드
   */
  update(jobId: string, userId: string, patch: Partial<ChatExportJobDoc>): Promise<void>;
}
