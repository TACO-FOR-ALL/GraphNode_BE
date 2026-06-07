import type {
  ChatExportJobDoc,
  ChatExportScope,
} from '../types/persistence/chat_export.persistence';

/**
 * 모듈: ChatExportRepository Port
 *
 * 책임:
 * - 채팅보내기 작업 메타데이터를 영속화합니다.
 */
export interface ChatExportRepository {
  /**
   * @description보내기 작업 문서를 생성합니다.
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
   * @description 진행 중인보내기 작업이 있는지 조회합니다.
   * @param userId 소유자 사용자 ID
   * @param exportScope보내기 범위
   * @param conversationId 단일 대화보내기 시 대화 ID
   */
  findActiveJob(
    userId: string,
    exportScope: ChatExportScope,
    conversationId?: string
  ): Promise<ChatExportJobDoc | null>;

  /**
   * @description 만료 시각이 지난 완료 작업 목록을 조회합니다.
   * @param expiresBeforeMs 이 시각(ms) 이전 `expiresAt` 인 DONE 작업
   */
  findExpiredDoneJobs(expiresBeforeMs: number): Promise<ChatExportJobDoc[]>;

  /**
   * @description 작업 문서를 부분 갱신합니다.
   * @param jobId 작업 식별자
   * @param userId 소유자 사용자 ID
   * @param patch 갱신 필드
   */
  update(jobId: string, userId: string, patch: Partial<ChatExportJobDoc>): Promise<void>;

  /**
   * @description 작업 문서를 삭제합니다.
   * @param jobId 작업 식별자
   * @param userId 소유자 사용자 ID
   */
  delete(jobId: string, userId: string): Promise<void>;
}
