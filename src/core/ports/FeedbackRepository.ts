/**
 * @module FeedbackRepository (Port)
 * @description 피드백 저장소 추상화 인터페이스.
 * Core 계층이 인프라 구현에 의존하지 않도록 의존성 역전 원칙(DIP)을 적용한다.
 * 실제 구현체는 `src/infra/repositories/FeedbackRepositoryPrisma.ts`에 위치한다.
 *
 * Public interface:
 * - {@link FeedbackRepository.create} — 피드백 신규 저장
 * - {@link FeedbackRepository.findById} — ID로 단건 조회
 * - {@link FeedbackRepository.findAll} — 커서 기반 목록 조회
 * - {@link FeedbackRepository.updateStatus} — 처리 상태 변경
 * - {@link FeedbackRepository.deleteById} — 레코드 영구 삭제
 */

import type { CreateFeedbackRecord, FeedbackRecord } from '../types/persistence/feedback.persistence';

/**
 * 피드백 저장소 인터페이스.
 * 의존성 역전 원칙에 따라 인프라 구현체가 이 인터페이스를 구현한다.
 */
export interface FeedbackRepository {
  /**
   * 새 피드백 레코드를 저장하고 DB가 생성한 완전한 레코드를 반환한다.
   *
   * @description `id`, `createdAt`, `updatedAt`은 DB가 자동 생성하므로 입력에서 제외한다.
   * @param data - 저장할 피드백 데이터 (`id`/`createdAt`/`updatedAt` 제외)
   * @returns 생성된 완전한 피드백 레코드 (DB 자동 생성 필드 포함)
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 쓰기 실패 시
   * @example
   * const record = await repo.create({
   *   category: 'BUG',
   *   userName: '홍길동',
   *   userEmail: 'hong@example.com',
   *   title: '버그 제보',
   *   content: '앱이 갑자기 종료됩니다.',
   *   status: 'UNREAD',
   * });
   */
  create(data: CreateFeedbackRecord): Promise<FeedbackRecord>;

  /**
   * 피드백 ID로 단건을 조회한다.
   *
   * @param id - 조회할 피드백 ID (UUID)
   * @returns 해당 피드백 레코드. 존재하지 않으면 null.
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const record = await repo.findById('uuid-123');
   * if (!record) throw new NotFoundError('feedback not found');
   */
  findById(id: string): Promise<FeedbackRecord | null>;

  /**
   * 커서 기반 페이지네이션으로 피드백 목록을 조회한다.
   * 결과는 `createdAt DESC` 순으로 정렬된다.
   *
   * @param limit - 한 번에 가져올 최대 레코드 수. 1~100.
   * @param cursor - 이전 페이지의 마지막 레코드 ID (첫 페이지는 undefined)
   * @returns 피드백 목록과 다음 페이지 커서.
   *   - `items`: 현재 페이지 레코드 배열
   *   - `nextCursor`: 다음 페이지 커서 ID. 마지막 페이지이면 null.
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 조회 실패 시
   * @example
   * const page1 = await repo.findAll(20);
   * const page2 = await repo.findAll(20, page1.nextCursor ?? undefined);
   */
  findAll(limit: number, cursor?: string): Promise<{ items: FeedbackRecord[]; nextCursor: string | null }>;

  /**
   * 피드백의 처리 상태를 변경하고 갱신된 레코드를 반환한다.
   *
   * @param id - 상태를 변경할 피드백 ID (UUID)
   * @param status - 변경할 상태값. 허용값: "UNREAD" | "READ" | "IN_PROGRESS" | "DONE"
   * @returns 상태가 갱신된 피드백 레코드
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 쓰기 실패 시
   * @example
   * const updated = await repo.updateStatus('uuid-123', 'READ');
   */
  updateStatus(id: string, status: string): Promise<FeedbackRecord>;

  /**
   * 피드백 레코드를 DB에서 영구적으로 삭제한다.
   *
   * @param id - 삭제할 피드백 ID (UUID)
   * @returns void
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — DB 삭제 실패 시
   * @example
   * await repo.deleteById('uuid-123');
   */
  deleteById(id: string): Promise<void>;
}
