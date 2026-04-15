/**
 * @file FeedbackService.spec.ts
 * @description FeedbackService 단위 테스트.
 *
 * 전략:
 * - FeedbackRepository를 인메모리 Map으로 구현하여 DB 의존성을 제거한다.
 * - FeedbackService의 비즈니스 로직(입력 정규화, 에러 처리, DTO 변환)만 검증한다.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { FeedbackService } from '../../src/core/services/FeedbackService';
import type { FeedbackRepository } from '../../src/core/ports/FeedbackRepository';
import type {
  CreateFeedbackRecord,
  FeedbackRecord,
} from '../../src/core/types/persistence/feedback.persistence';
import { NotFoundError, ValidationError } from '../../src/shared/errors/domain';

// ─── In-Memory Repository ─────────────────────────────────────────────────────

class InMemoryFeedbackRepo implements FeedbackRepository {
  private store = new Map<string, FeedbackRecord>();
  private idCounter = 0;

  async create(data: CreateFeedbackRecord): Promise<FeedbackRecord> {
    const id = `test-uuid-${++this.idCounter}`;
    const now = new Date();
    const record: FeedbackRecord = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, record);
    return record;
  }

  async findById(id: string): Promise<FeedbackRecord | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(
    limit: number,
    cursor?: string
  ): Promise<{ items: FeedbackRecord[]; nextCursor: string | null }> {
    const all = Array.from(this.store.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const startIndex = cursor ? all.findIndex((r) => r.id === cursor) + 1 : 0;
    const items = all.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < all.length ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  async updateStatus(id: string, status: string): Promise<FeedbackRecord> {
    const record = this.store.get(id);
    if (!record) throw new NotFoundError(`Feedback not found: ${id}`);
    const updated: FeedbackRecord = {
      ...record,
      status,
      updatedAt: new Date(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    if (!this.store.has(id)) throw new NotFoundError(`Feedback not found: ${id}`);
    this.store.delete(id);
  }

  // 테스트용 헬퍼
  size(): number {
    return this.store.size;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeedbackService', () => {
  let repo: InMemoryFeedbackRepo;
  let service: FeedbackService;

  beforeEach(() => {
    repo = new InMemoryFeedbackRepo();
    service = new FeedbackService(repo);
  });

  // ─── createFeedback ──────────────────────────────────────────────────────────

  describe('createFeedback', () => {
    it('정상 입력으로 피드백을 생성하고 FeedbackDto를 반환한다', async () => {
      const result = await service.createFeedback({
        category: 'BUG',
        title: '로그인 오류',
        content: '소셜 로그인 시 500 에러가 발생합니다.',
        userName: '홍길동',
        userEmail: 'hong@example.com',
      });

      expect(result.id).toBeDefined();
      expect(result.category).toBe('BUG');
      expect(result.title).toBe('로그인 오류');
      expect(result.content).toBe('소셜 로그인 시 500 에러가 발생합니다.');
      expect(result.userName).toBe('홍길동');
      expect(result.userEmail).toBe('hong@example.com');
      expect(result.status).toBe('UNREAD');
      expect(typeof result.createdAt).toBe('string'); // ISO 8601
      expect(typeof result.updatedAt).toBe('string');
    });

    it('userName, userEmail이 없어도 익명으로 생성된다', async () => {
      const result = await service.createFeedback({
        category: 'FEATURE',
        title: '다크모드 요청',
        content: '다크모드를 지원해주세요.',
      });

      expect(result.userName).toBeNull();
      expect(result.userEmail).toBeNull();
    });

    it('입력값을 trim하여 저장한다', async () => {
      const result = await service.createFeedback({
        category: '  BUG  ',
        title: '  제목에 공백  ',
        content: '  내용입니다  ',
        userName: '  홍길동  ',
      });

      expect(result.category).toBe('BUG');
      expect(result.title).toBe('제목에 공백');
      expect(result.content).toBe('내용입니다');
      expect(result.userName).toBe('홍길동');
    });

    it('공백만 있는 userName은 null로 처리한다', async () => {
      const result = await service.createFeedback({
        category: 'OTHER',
        title: '제목',
        content: '내용',
        userName: '   ',
      });

      expect(result.userName).toBeNull();
    });

    it('category가 빈 문자열이면 ValidationError를 던진다', async () => {
      await expect(
        service.createFeedback({
          category: '  ',
          title: '제목',
          content: '내용',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('title이 빈 문자열이면 ValidationError를 던진다', async () => {
      await expect(
        service.createFeedback({
          category: 'BUG',
          title: '',
          content: '내용',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('content가 빈 문자열이면 ValidationError를 던진다', async () => {
      await expect(
        service.createFeedback({
          category: 'BUG',
          title: '제목',
          content: '',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('title이 최대 길이(1000자)를 초과하면 ValidationError를 던진다', async () => {
      await expect(
        service.createFeedback({
          category: 'BUG',
          title: 'a'.repeat(1001),
          content: '내용',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('content가 최대 길이(10000자)를 초과하면 ValidationError를 던진다', async () => {
      await expect(
        service.createFeedback({
          category: 'BUG',
          title: '제목',
          content: 'a'.repeat(10001),
        })
      ).rejects.toThrow(ValidationError);
    });

    it('createdAt, updatedAt이 ISO 8601 형식의 문자열이다', async () => {
      const result = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      expect(() => new Date(result.createdAt)).not.toThrow();
      expect(() => new Date(result.updatedAt)).not.toThrow();
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ─── getFeedback ─────────────────────────────────────────────────────────────

  describe('getFeedback', () => {
    it('존재하는 피드백을 ID로 조회한다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const result = await service.getFeedback(created.id);
      expect(result.id).toBe(created.id);
      expect(result.title).toBe('제목');
    });

    it('존재하지 않는 ID로 조회하면 NotFoundError를 던진다', async () => {
      await expect(service.getFeedback('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  // ─── listFeedbacks ───────────────────────────────────────────────────────────

  describe('listFeedbacks', () => {
    it('빈 목록을 반환한다 (데이터 없을 때)', async () => {
      const result = await service.listFeedbacks();
      expect(result.feedbacks).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('생성된 피드백 목록을 반환한다', async () => {
      await service.createFeedback({ category: 'BUG', title: '제목1', content: '내용1' });
      await service.createFeedback({ category: 'BUG', title: '제목2', content: '내용2' });

      const result = await service.listFeedbacks();
      expect(result.feedbacks).toHaveLength(2);
    });

    it('limit을 초과하는 항목이 있으면 nextCursor를 반환한다', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createFeedback({
          category: 'BUG',
          title: `제목 ${i}`,
          content: '내용',
        });
      }

      const result = await service.listFeedbacks(3);
      expect(result.feedbacks).toHaveLength(3);
      expect(result.nextCursor).not.toBeNull();
    });

    it('정확히 limit만큼만 있으면 nextCursor가 null이다', async () => {
      for (let i = 0; i < 3; i++) {
        await service.createFeedback({
          category: 'BUG',
          title: `제목 ${i}`,
          content: '내용',
        });
      }

      const result = await service.listFeedbacks(3);
      expect(result.feedbacks).toHaveLength(3);
      expect(result.nextCursor).toBeNull();
    });
  });

  // ─── updateFeedbackStatus ─────────────────────────────────────────────────────

  describe('updateFeedbackStatus', () => {
    it('유효한 상태값으로 피드백 상태를 변경한다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const result = await service.updateFeedbackStatus(created.id, { status: 'READ' });
      expect(result.status).toBe('READ');
      expect(result.id).toBe(created.id);
    });

    it('DONE 상태로 변경한다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const result = await service.updateFeedbackStatus(created.id, { status: 'DONE' });
      expect(result.status).toBe('DONE');
    });

    it('유효하지 않은 상태값이면 ValidationError를 던진다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      await expect(
        service.updateFeedbackStatus(created.id, { status: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });

    it('존재하지 않는 ID면 NotFoundError를 던진다', async () => {
      await expect(
        service.updateFeedbackStatus('non-existent-id', { status: 'READ' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ─── deleteFeedback ───────────────────────────────────────────────────────────

  describe('deleteFeedback', () => {
    it('피드백을 삭제한다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      await service.deleteFeedback(created.id);
      expect(repo.size()).toBe(0);
    });

    it('삭제 후 해당 ID로 조회하면 NotFoundError를 던진다', async () => {
      const created = await service.createFeedback({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      await service.deleteFeedback(created.id);
      await expect(service.getFeedback(created.id)).rejects.toThrow(NotFoundError);
    });

    it('존재하지 않는 ID를 삭제하면 NotFoundError를 던진다', async () => {
      await expect(service.deleteFeedback('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });
});
