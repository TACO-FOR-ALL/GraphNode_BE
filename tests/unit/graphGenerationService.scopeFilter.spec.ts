/**
 * Unit Tests: GraphGenerationService — scopeFilter 1:N 모드 + 레거시 하위 호환
 */

import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { UpstreamError } from '../../src/shared/errors/domain';

const makeEmptyChatService = () => ({
  listConversations: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
});
const makeEmptyNoteService = () => ({
  findNotesModifiedSince: jest.fn().mockResolvedValue([]),
});
const makeEmptyFileService = () => ({
  listAllActiveFiles: jest.fn().mockResolvedValue([]),
});
const makeUserService = () => ({
  getPreferredLanguage: jest.fn().mockResolvedValue('ko'),
});
const makeEmbeddingService = () => ({
  saveStats: jest.fn().mockResolvedValue(undefined),
  listClusters: jest.fn().mockResolvedValue([]),
});
const makeQueuePort = () => ({ sendMessage: jest.fn().mockResolvedValue(undefined) });
const makeStoragePort = () => ({ upload: jest.fn().mockResolvedValue(undefined) });
const makeNotificationService = () => ({
  sendGraphGenerationRequested: jest.fn().mockResolvedValue(undefined),
  sendGraphGenerationRequestFailed: jest.fn().mockResolvedValue(undefined),
});
const makeMacroGraphStore = (overrides: object = {}) => ({
  createMacroView: jest.fn().mockResolvedValue({ macroId: 'new_macro', userId: 'user_A' }),
  ...overrides,
});

const buildService = (macroGraphStore?: object) =>
  new (GraphGenerationService as unknown as new (...args: unknown[]) => GraphGenerationService)(
    makeEmptyChatService(),
    makeEmbeddingService(),
    makeEmptyNoteService(),
    makeEmptyFileService(),
    makeUserService(),
    makeQueuePort(),
    makeStoragePort(),
    makeNotificationService(),
    undefined,
    undefined,
    macroGraphStore
  );

// resolveSinceDateFromPeriod 직접 테스트 (private static)
describe('GraphGenerationService.resolveSinceDateFromPeriod (private)', () => {
  const resolve = (period?: string): Date =>
    (GraphGenerationService as unknown as Record<string, (p?: string) => Date>)
      .resolveSinceDateFromPeriod(period);

  it('undefined → epoch (new Date(0))', () => {
    expect(resolve(undefined).getTime()).toBe(0);
  });

  it("'1w' → 7일 전", () => {
    const now = Date.now();
    const d = resolve('1w').getTime();
    expect(Math.abs(d - (now - 7 * 86_400_000))).toBeLessThan(1000);
  });

  it("'1m' → 30일 전", () => {
    const now = Date.now();
    const d = resolve('1m').getTime();
    expect(Math.abs(d - (now - 30 * 86_400_000))).toBeLessThan(1000);
  });

  it("'3m' → 90일 전", () => {
    const now = Date.now();
    const d = resolve('3m').getTime();
    expect(Math.abs(d - (now - 90 * 86_400_000))).toBeLessThan(1000);
  });

  it("'1y' → 365일 전", () => {
    const now = Date.now();
    const d = resolve('1y').getTime();
    expect(Math.abs(d - (now - 365 * 86_400_000))).toBeLessThan(1000);
  });

  it('알 수 없는 값 → epoch', () => {
    expect(resolve('5y').getTime()).toBe(0);
  });
});

describe('GraphGenerationService.requestGraphGenerationViaQueue', () => {
  it('레거시 모드: 데이터가 없으면 null을 반환한다 (scopeFilter 없음)', async () => {
    const svc = buildService(makeMacroGraphStore());
    const result = await svc.requestGraphGenerationViaQueue('user_A');
    expect(result).toBeNull();
  });

  it('1:N 모드: 데이터가 없으면 null을 반환한다 (scopeFilter 있어도 early return)', async () => {
    const store = makeMacroGraphStore();
    const svc = buildService(store);

    const result = await svc.requestGraphGenerationViaQueue('user_A', {
      scopeFilter: { mode: 'auto', intent: '테스트' },
    });

    expect(result).toBeNull();
    // 데이터 없으므로 createMacroView 미호출
    expect(store.createMacroView).not.toHaveBeenCalled();
  });

  it('1:N 모드: macroGraphStore가 없으면 UpstreamError를 던진다', async () => {
    // macroGraphStore가 undefined이면 데이터 조회 전에 즉시 UpstreamError를 던진다
    const svc = buildService(undefined); // macroGraphStore 없음
    await expect(
      svc.requestGraphGenerationViaQueue('user_A', {
        scopeFilter: { mode: 'manual', filters: { dataTypes: ['chat'] } },
      })
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it('레거시 모드: scopeFilter 없이 호출하면 macroGraphStore.createMacroView를 호출하지 않는다', async () => {
    const store = makeMacroGraphStore();
    const svc = buildService(store);
    await svc.requestGraphGenerationViaQueue('user_A', { macroId: 'user_A' });
    // 데이터 없어서 null 반환, 레거시 경로: createMacroView 미호출
    expect(store.createMacroView).not.toHaveBeenCalled();
  });
});
