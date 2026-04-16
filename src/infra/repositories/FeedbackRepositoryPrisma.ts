/**
 * @module FeedbackRepositoryPrisma
 * @description Prisma(PostgreSQL)를 이용한 FeedbackRepository 구현체.
 * Core Port `FeedbackRepository`를 구현하며, `src/infra` 계층에 위치한다.
 *
 * Public interface:
 * - {@link FeedbackRepositoryPrisma.create} — 피드백 저장
 * - {@link FeedbackRepositoryPrisma.findById} — ID로 단건 조회
 * - {@link FeedbackRepositoryPrisma.findAll} — 커서 기반 목록 조회
 * - {@link FeedbackRepositoryPrisma.updateStatus} — 처리 상태 변경
 * - {@link FeedbackRepositoryPrisma.deleteById} — 영구 삭제
 */

import prisma from '../db/prisma';
import type { FeedbackRepository } from '../../core/ports/FeedbackRepository';
import type { CreateFeedbackRecord, FeedbackRecord } from '../../core/types/persistence/feedback.persistence';
import { NotFoundError } from '../../shared/errors/domain';

/**
 * Prisma 클라이언트를 통해 PostgreSQL `feedbacks` 테이블에 접근하는 저장소 구현체.
 *
 * @implements {FeedbackRepository}
 */
export class FeedbackRepositoryPrisma implements FeedbackRepository {
  /**
   * 새 피드백 레코드를 `feedbacks` 테이블에 저장한다.
   * `id`, `createdAt`, `updatedAt`은 DB schema 기본값(`@default(uuid())`, `@default(now())`, `@updatedAt`)으로 자동 생성된다.
   *
   * @description `id`는 `schema.prisma`의 `@default(uuid())`로 PostgreSQL이 자동 생성한다.
   * @param data - 저장할 피드백 데이터 (`id`/`createdAt`/`updatedAt` 제외)
   * @returns 생성된 완전한 피드백 레코드
   * @throws {UpstreamError} UPSTREAM_ERROR — Prisma DB 쓰기 실패 시 (Service 계층에서 래핑)
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
  async create(data: CreateFeedbackRecord): Promise<FeedbackRecord> {
    const feedback = await prisma.feedback.create({
      data: {
        category: data.category,
        userName: data.userName ?? null,
        userEmail: data.userEmail ?? null,
        title: data.title,
        content: data.content,
        status: data.status,
      },
    });

    return this.toRecord(feedback);
  }

  /**
   * 피드백 ID로 단건을 조회한다.
   *
   * @param id - 조회할 피드백 ID (UUID)
   * @returns 해당 피드백 레코드. 존재하지 않으면 null.
   * @throws {UpstreamError} UPSTREAM_ERROR — Prisma DB 조회 실패 시 (Service 계층에서 래핑)
   * @example
   * const record = await repo.findById('uuid-123');
   */
  async findById(id: string): Promise<FeedbackRecord | null> {
    const feedback = await prisma.feedback.findUnique({
      where: { id },
    });

    return feedback ? this.toRecord(feedback) : null;
  }

  /**
   * 커서 기반 페이지네이션으로 피드백 목록을 조회한다.
   * `createdAt DESC` 순으로 정렬되며, 동일 시각 레코드는 `id DESC`로 2차 정렬된다.
   *
   * @description Prisma의 cursor 기반 페이지네이션을 사용한다.
   * cursor가 있으면 해당 ID 레코드의 다음부터 조회한다 (`skip: 1`).
   *
   * @param limit - 한 번에 가져올 최대 레코드 수. 1~100.
   * @param cursor - 이전 페이지의 마지막 레코드 ID. 첫 페이지는 undefined.
   * @returns 현재 페이지 레코드 배열과 다음 페이지 커서.
   * @throws {UpstreamError} UPSTREAM_ERROR — Prisma DB 조회 실패 시 (Service 계층에서 래핑)
   * @example
   * const { items, nextCursor } = await repo.findAll(20);
   */
  async findAll(
    limit: number,
    cursor?: string
  ): Promise<{ items: FeedbackRecord[]; nextCursor: string | null }> {
    const feedbacks = await prisma.feedback.findMany({
      take: limit + 1, // 다음 페이지 존재 여부 확인을 위해 1개 더 조회
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1, // cursor 자체는 제외
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasNextPage = feedbacks.length > limit;
    const items = hasNextPage ? feedbacks.slice(0, limit) : feedbacks;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    return {
      items: items.map((f) => this.toRecord(f)),
      nextCursor,
    };
  }

  /**
   * 피드백의 처리 상태(`status`)를 변경하고 갱신된 레코드를 반환한다.
   *
   * @param id - 상태를 변경할 피드백 ID (UUID)
   * @param status - 변경할 상태값. 허용값: "UNREAD" | "READ" | "IN_PROGRESS" | "DONE"
   * @returns 상태가 갱신된 피드백 레코드
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — Prisma DB 쓰기 실패 시 (Service 계층에서 래핑)
   * @example
   * const updated = await repo.updateStatus('uuid-123', 'READ');
   */
  async updateStatus(id: string, status: string): Promise<FeedbackRecord> {
    const existing = await prisma.feedback.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Feedback not found: ${id}`);
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: { status },
    });

    return this.toRecord(updated);
  }

  /**
   * 피드백 레코드를 `feedbacks` 테이블에서 영구 삭제한다.
   *
   * @param id - 삭제할 피드백 ID (UUID)
   * @returns void
   * @throws {NotFoundError} NOT_FOUND — 해당 ID의 피드백이 존재하지 않을 때
   * @throws {UpstreamError} UPSTREAM_ERROR — Prisma DB 삭제 실패 시 (Service 계층에서 래핑)
   * @example
   * await repo.deleteById('uuid-123');
   */
  async deleteById(id: string): Promise<void> {
    const existing = await prisma.feedback.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Feedback not found: ${id}`);
    }

    await prisma.feedback.delete({ where: { id } });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Prisma 모델 객체를 도메인 `FeedbackRecord` 타입으로 변환한다.
   *
   * @param feedback - Prisma가 반환한 Feedback 모델 인스턴스
   * @returns 도메인 레코드 타입으로 변환된 FeedbackRecord
   * @returns 불변 객체
   */
  private toRecord(feedback: {
    id: string;
    category: string;
    userName: string | null;
    userEmail: string | null;
    title: string;
    content: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): FeedbackRecord {
    return {
      id: feedback.id,
      category: feedback.category,
      userName: feedback.userName,
      userEmail: feedback.userEmail,
      title: feedback.title,
      content: feedback.content,
      status: feedback.status,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    };
  }
}
