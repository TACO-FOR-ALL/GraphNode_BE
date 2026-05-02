/**
 * @file feedback.spec.ts
 * @description Feedback HTTP API 통합 테스트.
 *
 * 전략:
 * - FeedbackService는 실제 비즈니스 로직을 수행한다.
 * - FeedbackRepositoryPrisma를 인메모리 Mock으로 대체하여 DB 의존성 제거.
 * - AwsS3Adapter를 Mock으로 대체하여 S3 의존성 제거.
 * - Zod 검증, HTTP 상태 코드, RFC 9457 에러 응답 형식 검증.
 * - 인증이 불필요한 엔드포인트 (피드백 제출은 공개 API).
 * - 파일 첨부(multipart/form-data) 및 미첨부(JSON) 양쪽 경로를 검증.
 */

import { jest, describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../../src/bootstrap/server';
import { closeDatabases } from '../../src/infra/db';
import { Neo4jMacroGraphAdapter } from '../../src/infra/graph/Neo4jMacroGraphAdapter';
import { AwsSqsAdapter } from '../../src/infra/aws/AwsSqsAdapter';
import { AwsS3Adapter } from '../../src/infra/aws/AwsS3Adapter';
import { RedisEventBusAdapter } from '../../src/infra/redis/RedisEventBusAdapter';
import type {
  CreateFeedbackRecord,
  FeedbackRecord,
} from '../../src/core/types/persistence/feedback.persistence';
import { NotFoundError } from '../../src/shared/errors/domain';

// ─── 인프라 목(Mock) — 타 모듈 hang 방지 ────────────────────────────────────

jest.mock('../../src/infra/graph/Neo4jMacroGraphAdapter');
jest.mock('../../src/infra/aws/AwsSqsAdapter');
jest.mock('../../src/infra/aws/AwsS3Adapter');
jest.mock('../../src/infra/redis/RedisEventBusAdapter');
jest.mock('../../src/infra/db/mongodb', () => ({
  getMongo: jest.fn().mockReturnValue({
    startSession: jest.fn().mockReturnValue({
      withTransaction: async (fn: any) => await fn(),
      endSession: jest.fn(),
    }),
  }),
  initMongo: jest.fn(),
}));
jest.mock('../../src/infra/db', () => ({
  initDatabases: jest.fn(),
  closeDatabases: jest.fn(),
}));

(Neo4jMacroGraphAdapter as unknown as jest.Mock).mockImplementation(() => ({
  upsertNode: jest.fn<any>().mockResolvedValue(undefined),
  findNode: jest.fn<any>().mockResolvedValue(null),
  listNodes: jest.fn<any>().mockResolvedValue([]),
}));
(AwsSqsAdapter as jest.Mock).mockImplementation(() => ({ sendMessage: jest.fn() }));
(AwsS3Adapter as jest.Mock).mockImplementation(() => ({
  upload: jest.fn<any>().mockResolvedValue(undefined),
  uploadJson: jest.fn<any>().mockResolvedValue(undefined),
  downloadStream: jest.fn<any>().mockResolvedValue(null),
  downloadFile: jest.fn<any>().mockResolvedValue({ buffer: Buffer.from(''), contentType: 'application/octet-stream' }),
  downloadJson: jest.fn<any>().mockResolvedValue({}),
  delete: jest.fn<any>().mockResolvedValue(undefined),
}));
(RedisEventBusAdapter as jest.Mock).mockImplementation(() => ({
  publish: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
}));

// ─── FeedbackRepositoryPrisma In-Memory Mock ──────────────────────────────────

let feedbackStore = new Map<string, FeedbackRecord>();
let idCounter = 0;

jest.mock('../../src/infra/repositories/FeedbackRepositoryPrisma', () => ({
  FeedbackRepositoryPrisma: class {
    async create(data: CreateFeedbackRecord): Promise<FeedbackRecord> {
      const id = `test-fb-${++idCounter}`;
      const now = new Date();
      const record: FeedbackRecord = { id, ...data, createdAt: now, updatedAt: now };
      feedbackStore.set(id, record);
      return record;
    }

    async findById(id: string): Promise<FeedbackRecord | null> {
      return feedbackStore.get(id) ?? null;
    }

    async findAll(
      limit: number,
      cursor?: string
    ): Promise<{ items: FeedbackRecord[]; nextCursor: string | null }> {
      const all = Array.from(feedbackStore.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
      const startIndex = cursor ? all.findIndex((r) => r.id === cursor) + 1 : 0;
      const items = all.slice(startIndex, startIndex + limit);
      const nextCursor =
        startIndex + limit < all.length ? items[items.length - 1].id : null;
      return { items, nextCursor };
    }

    async updateStatus(id: string, status: string): Promise<FeedbackRecord> {
      const record = feedbackStore.get(id);
      if (!record) throw new NotFoundError(`Feedback not found: ${id}`);
      const updated = { ...record, status, updatedAt: new Date() };
      feedbackStore.set(id, updated);
      return updated;
    }

    async deleteById(id: string): Promise<void> {
      if (!feedbackStore.has(id)) throw new NotFoundError(`Feedback not found: ${id}`);
      feedbackStore.delete(id);
    }
  },
}));

// ─── UserRepository Mock (미들웨어용) ─────────────────────────────────────────

jest.mock('../../src/infra/repositories/UserRepositoryMySQL', () => ({
  UserRepositoryMySQL: class {
    async findById(id: any) {
      return { id: String(id), email: 'u@test.com' };
    }
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Feedback API Integration Tests', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    process.env.SESSION_SECRET = 'test-secret';
    app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
  });

  afterAll(async () => {
    await closeDatabases();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    feedbackStore.clear();
    idCounter = 0;
  });

  // ─── POST /v1/feedback ───────────────────────────────────────────────────────

  describe('POST /v1/feedback', () => {
    it('201: 유효한 피드백 생성 (JSON, 파일 없음)', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '로그인 오류',
        content: '소셜 로그인 시 500 에러가 발생합니다.',
        userName: '홍길동',
        userEmail: 'hong@example.com',
      });

      expect(res.status).toBe(201);
      expect(res.headers['location']).toMatch(/^\/v1\/feedback\//);
      expect(res.body.feedback).toBeDefined();
      expect(res.body.feedback.category).toBe('BUG');
      expect(res.body.feedback.title).toBe('로그인 오류');
      expect(res.body.feedback.status).toBe('UNREAD');
      expect(res.body.feedback.id).toBeDefined();
      expect(res.body.feedback.attachments).toBeNull();
    });

    it('201: userName, userEmail 없이 익명 생성', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: 'FEATURE',
        title: '다크모드 요청',
        content: '다크모드를 지원해주세요.',
      });

      expect(res.status).toBe(201);
      expect(res.body.feedback.userName).toBeNull();
      expect(res.body.feedback.userEmail).toBeNull();
      expect(res.body.feedback.attachments).toBeNull();
    });

    it('201: multipart/form-data로 파일 첨부 포함 생성', async () => {
      const fileContent = Buffer.from('fake image data');
      const res = await request(app)
        .post('/v1/feedback')
        .field('category', 'BUG')
        .field('title', '스크린샷 첨부')
        .field('content', '오류 화면입니다.')
        .attach('files', fileContent, { filename: 'screenshot.png', contentType: 'image/png' });

      expect(res.status).toBe(201);
      expect(res.body.feedback.category).toBe('BUG');
      expect(res.body.feedback.attachments).not.toBeNull();
      expect(Array.isArray(res.body.feedback.attachments)).toBe(true);
      expect(res.body.feedback.attachments).toHaveLength(1);
      expect(res.body.feedback.attachments[0].name).toBe('screenshot.png');
      expect(res.body.feedback.attachments[0].mimeType).toBe('image/png');
      expect(res.body.feedback.attachments[0].url).toMatch(/^feedback-files\//);
      expect(typeof res.body.feedback.attachments[0].size).toBe('number');
    });

    it('201: 여러 파일 동시 첨부', async () => {
      const file1 = Buffer.from('image data');
      const file2 = Buffer.from('log data');
      const res = await request(app)
        .post('/v1/feedback')
        .field('category', 'BUG')
        .field('title', '다중 파일 첨부')
        .field('content', '여러 첨부파일 테스트.')
        .attach('files', file1, { filename: 'screen.png', contentType: 'image/png' })
        .attach('files', file2, { filename: 'error.log', contentType: 'text/plain' });

      expect(res.status).toBe(201);
      expect(res.body.feedback.attachments).toHaveLength(2);
      const names = res.body.feedback.attachments.map((a: any) => a.name);
      expect(names).toContain('screen.png');
      expect(names).toContain('error.log');
    });

    it('400: category 누락 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).post('/v1/feedback').send({
        title: '제목',
        content: '내용',
      });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.status).toBe(400);
      expect(res.body.type).toBeDefined();
    });

    it('400: title 누락 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        content: '내용',
      });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('400: content 누락 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
      });

      expect(res.status).toBe(400);
    });

    it('400: 유효하지 않은 이메일 형식 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
        userEmail: 'invalid-email',
      });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('400: category가 빈 문자열이면 에러 반환', async () => {
      const res = await request(app).post('/v1/feedback').send({
        category: '',
        title: '제목',
        content: '내용',
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /v1/feedback ────────────────────────────────────────────────────────

  describe('GET /v1/feedback', () => {
    it('200: 빈 목록 반환 (데이터 없음)', async () => {
      const res = await request(app).get('/v1/feedback');

      expect(res.status).toBe(200);
      expect(res.body.feedbacks).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('200: 생성된 피드백 목록 반환 (attachments 포함)', async () => {
      await request(app)
        .post('/v1/feedback')
        .send({ category: 'BUG', title: '제목1', content: '내용1' });
      await request(app)
        .post('/v1/feedback')
        .send({ category: 'BUG', title: '제목2', content: '내용2' });

      const res = await request(app).get('/v1/feedback');

      expect(res.status).toBe(200);
      expect(res.body.feedbacks).toHaveLength(2);
      expect(res.body.feedbacks[0]).toHaveProperty('attachments');
    });

    it('200: limit 쿼리 파라미터가 동작한다', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/v1/feedback')
          .send({ category: 'BUG', title: `제목 ${i}`, content: '내용' });
      }

      const res = await request(app).get('/v1/feedback?limit=3');

      expect(res.status).toBe(200);
      expect(res.body.feedbacks).toHaveLength(3);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it('400: limit이 범위를 벗어나면 에러 반환', async () => {
      const res = await request(app).get('/v1/feedback?limit=200');

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /v1/feedback/:id ────────────────────────────────────────────────────

  describe('GET /v1/feedback/:id', () => {
    it('200: 존재하는 피드백 단건 조회 (attachments null)', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '로그인 오류',
        content: '오류 내용',
      });

      const id = created.body.feedback.id;
      const res = await request(app).get(`/v1/feedback/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.feedback.id).toBe(id);
      expect(res.body.feedback.title).toBe('로그인 오류');
      expect(res.body.feedback.attachments).toBeNull();
    });

    it('200: 파일 첨부된 피드백 단건 조회 (attachments 포함)', async () => {
      const created = await request(app)
        .post('/v1/feedback')
        .field('category', 'BUG')
        .field('title', '첨부 피드백')
        .field('content', '파일 포함')
        .attach('files', Buffer.from('data'), { filename: 'log.txt', contentType: 'text/plain' });

      const id = created.body.feedback.id;
      const res = await request(app).get(`/v1/feedback/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.feedback.attachments).toHaveLength(1);
      expect(res.body.feedback.attachments[0].name).toBe('log.txt');
    });

    it('404: 존재하지 않는 ID 조회 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).get('/v1/feedback/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.status).toBe(404);
    });
  });

  // ─── PATCH /v1/feedback/:id/status ───────────────────────────────────────────

  describe('PATCH /v1/feedback/:id/status', () => {
    it('200: 피드백 상태를 READ로 변경', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const id = created.body.feedback.id;
      const res = await request(app)
        .patch(`/v1/feedback/${id}/status`)
        .send({ status: 'READ' });

      expect(res.status).toBe(200);
      expect(res.body.feedback.status).toBe('READ');
      expect(res.body.feedback.id).toBe(id);
    });

    it('200: 피드백 상태를 DONE으로 변경', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const id = created.body.feedback.id;
      const res = await request(app)
        .patch(`/v1/feedback/${id}/status`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(200);
      expect(res.body.feedback.status).toBe('DONE');
    });

    it('400: 허용되지 않는 status 값이면 RFC 9457 에러 반환', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const id = created.body.feedback.id;
      const res = await request(app)
        .patch(`/v1/feedback/${id}/status`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('404: 존재하지 않는 피드백 상태 변경 시 RFC 9457 에러 반환', async () => {
      const res = await request(app)
        .patch('/v1/feedback/non-existent-id/status')
        .send({ status: 'READ' });

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });

  // ─── DELETE /v1/feedback/:id ──────────────────────────────────────────────────

  describe('DELETE /v1/feedback/:id', () => {
    it('204: 피드백 영구 삭제', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const id = created.body.feedback.id;
      const deleteRes = await request(app).delete(`/v1/feedback/${id}`);

      expect(deleteRes.status).toBe(204);
      expect(deleteRes.body).toEqual({});
    });

    it('204 후 동일 ID 조회 시 404 반환', async () => {
      const created = await request(app).post('/v1/feedback').send({
        category: 'BUG',
        title: '제목',
        content: '내용',
      });

      const id = created.body.feedback.id;
      await request(app).delete(`/v1/feedback/${id}`);

      const getRes = await request(app).get(`/v1/feedback/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('404: 존재하지 않는 피드백 삭제 시 RFC 9457 에러 반환', async () => {
      const res = await request(app).delete('/v1/feedback/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });
});
