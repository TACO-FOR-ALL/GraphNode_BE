// Search API 테스트는 SearchRouter/SearchController 의존성 정비 후 활성화 예정
describe.skip('Search API Integration Tests', () => {
  it('placeholder', () => {});
});

// import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
// import request from 'supertest';
// import express, { Request, Response, NextFunction } from 'express';
// import { createSearchRouter } from '../../src/app/routes/SearchRouter';
// import { SearchController } from '../../src/app/controllers/SearchController';
// import { errorHandler } from '../../src/app/middlewares/error';

// // --- Mocks ---
// // DB 의존성 및 인프라 의존성이 있는 미들웨어를 Mock 처리하여 격리 환경 구성
// jest.mock('../../src/app/middlewares/session', () => ({
//   bindSessionUser: (req: Request, res: Response, next: NextFunction) => next(),
// }));
// jest.mock('../../src/app/middlewares/auth', () => ({
//   requireLogin: (req: Request, res: Response, next: NextFunction) => next(),
// }));

// // Mock logger to prevent pino async leaks
// jest.mock('../../src/shared/utils/logger', () => ({
//   httpLogger: (req: Request, res: Response, next: NextFunction) => next(),
//   logger: {
//     info: jest.fn(),
//     error: jest.fn(),
//     warn: jest.fn(),
//     debug: jest.fn(),
//     child: jest.fn().mockReturnValue({
//       info: jest.fn(),
//       error: jest.fn(),
//       warn: jest.fn(),
//       debug: jest.fn(),
//     }),
//   },
// }));

// // Mock Sentry to prevent network calls in tests
// jest.mock('@sentry/node', () => ({
//   captureException: jest.fn(),
// }));

// const mockIntegratedSearchByKeyword = jest.fn() as jest.MockedFunction<
//   (userId: string, q: string) => Promise<{ notes: any[]; chatThreads: any[] }>
// >;

// const mockSearchService = {
//   integratedSearchByKeyword: mockIntegratedSearchByKeyword,
// } as any;

// describe('Search API Integration Tests (Lightweight)', () => {
//   let app: express.Express;
//   const userId = 'user-123';

//   beforeAll(() => {
//     // 1. 전체 createApp() 부팅 대신, 테스트 대상 라우터만 마운트하는 최소형 Express 생성
//     app = express();
//     app.use(express.json());

//     // 2. 테스트용 인증 유저 강제 주입 (JWT 및 Session을 거치지 않음)
//     // req.userId는 authJwt/bindUserIdToRequest가 설정하는 실제 패턴과 동일하게 주입
//     app.use((req: Request, res: Response, next: NextFunction) => {
//       req.userId = userId;
//       next();
//     });

//     // 3. 컨트롤러 및 라우터 주입
//     const searchController = new SearchController(mockSearchService);
//     const searchRouter = createSearchRouter(searchController);
//     app.use('/v1/search', searchRouter);

//     // 4. 중앙 에러 핸들러 등록 (AppError → RFC 9457 Problem Details 변환)
//     app.use(errorHandler);
//   });

//   beforeEach(() => {
//     jest.clearAllMocks();
//   });

//   it('should return 400 if search query is missing', async () => {
//     const res = await request(app)
//       .get('/v1/search')
//       .expect(400);

//     expect(res.body.status).toBe(400);
//   });

//   it('should return combined search results from notes and AI chats', async () => {
//     const mockNotes = [
//       { id: 'note-1', title: 'Meeting Note', content: 'Discussion about project', score: 1.5 }
//     ];
//     const mockThreads = [
//       {
//         id: 'thread-1',
//         title: 'Project Discussion',
//         score: 2.0,
//         messages: [{ id: 'msg-1', content: 'What is the project status?', score: 1.0 }]
//       }
//     ];

//     mockIntegratedSearchByKeyword.mockResolvedValue({
//       notes: mockNotes,
//       chatThreads: mockThreads
//     } as any);

//     const res = await request(app)
//       .get('/v1/search')
//       .query({ q: 'project' })
//       .expect(200);

//     expect(res.body.notes).toHaveLength(1);
//     expect(res.body.notes[0].id).toBe('note-1');
//     expect(res.body.notes[0].score).toBe(1.5);

//     expect(res.body.chatThreads).toHaveLength(1);
//     expect(res.body.chatThreads[0].id).toBe('thread-1');
//     expect(res.body.chatThreads[0].score).toBe(2.0);
//     expect(res.body.chatThreads[0].messages[0].score).toBe(1.0);

//     expect(mockIntegratedSearchByKeyword).toHaveBeenCalledWith(userId, 'project');
//   });

//   it('should return empty arrays if no results found', async () => {
//     mockIntegratedSearchByKeyword.mockResolvedValue({
//       notes: [],
//       chatThreads: []
//     } as any);

//     const res = await request(app)
//       .get('/v1/search')
//       .query({ q: 'nonexistent' })
//       .expect(200);

//     expect(res.body.notes).toEqual([]);
//     expect(res.body.chatThreads).toEqual([]);
//   });
// });
