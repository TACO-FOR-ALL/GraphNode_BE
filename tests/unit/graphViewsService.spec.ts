/**
 * Unit Tests: GraphManagementService — MacroView 관련 메서드
 * 테스트 대상: listMacroViews, getMacroView, updateMacroView, softDeleteMacroView, restoreMacroView, cloneMacroView
 *
 * Note: GraphViewsService가 GraphManagementService로 통합됨 (2026-06-21)
 */

import { GraphManagementService } from '../../src/core/services/GraphManagementService';
import { NotFoundError } from '../../src/shared/errors/domain';
import type { MacroGraphStore } from '../../src/core/ports/MacroGraphStore';
import type { MacroViewDto } from '../../src/shared/dtos/macro';

const makeMockStore = (): jest.Mocked<MacroGraphStore> =>
  ({
    listMacroViews: jest.fn(),
    getMacroView: jest.fn(),
    updateMacroView: jest.fn(),
    softDeleteMacroView: jest.fn(),
    restoreMacroView: jest.fn(),
    cloneMacroGraph: jest.fn(),
    createMacroView: jest.fn(),
    // port에 필요한 나머지 메서드는 테스트에 사용되지 않음
  } as unknown as jest.Mocked<MacroGraphStore>);

const makeView = (overrides: Partial<MacroViewDto> = {}): MacroViewDto => ({
  macroId: 'mac_01',
  userId: 'user_A',
  title: 'Test View',
  scopeFilter: { mode: 'auto', intent: 'test' },
  status: 'READY',
  nodeCount: 10,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('GraphManagementService — MacroView methods', () => {
  let store: jest.Mocked<MacroGraphStore>;
  let service: GraphManagementService;

  beforeEach(() => {
    store = makeMockStore();
    service = new GraphManagementService(store);
  });

  // ── listMacroViews ─────────────────────────────────────
  describe('listMacroViews', () => {
    it('스토어에서 반환된 목록을 그대로 반환한다', async () => {
      const views = [makeView(), makeView({ macroId: 'mac_02' })];
      store.listMacroViews.mockResolvedValue(views);

      const result = await service.listMacroViews('user_A');

      expect(store.listMacroViews).toHaveBeenCalledWith('user_A', undefined);
      expect(result).toBe(views);
    });

    it('query 파라미터를 스토어에 그대로 전달한다', async () => {
      store.listMacroViews.mockResolvedValue([]);
      await service.listMacroViews('user_A', { onlyDeleted: true });
      expect(store.listMacroViews).toHaveBeenCalledWith('user_A', { onlyDeleted: true });
    });
  });

  // ── getMacroView ───────────────────────────────────────
  describe('getMacroView', () => {
    it('뷰가 존재하면 반환한다', async () => {
      const view = makeView();
      store.getMacroView.mockResolvedValue(view);

      const result = await service.getMacroView('user_A', 'mac_01');
      expect(result).toBe(view);
    });

    it('뷰가 없으면 NotFoundError를 던진다', async () => {
      store.getMacroView.mockResolvedValue(null);
      await expect(service.getMacroView('user_A', 'mac_MISSING')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ── updateMacroView ────────────────────────────────────
  describe('updateMacroView', () => {
    it('patch를 스토어에 전달하고 업데이트된 뷰를 반환한다', async () => {
      const updated = makeView({ title: '새 제목' });
      store.updateMacroView.mockResolvedValue(updated);

      const result = await service.updateMacroView('user_A', 'mac_01', { title: '새 제목' });
      expect(store.updateMacroView).toHaveBeenCalledWith('user_A', 'mac_01', { title: '새 제목' });
      expect(result.title).toBe('새 제목');
    });
  });

  // ── softDeleteMacroView ────────────────────────────────
  describe('softDeleteMacroView', () => {
    it('스토어의 softDelete를 호출한다', async () => {
      store.softDeleteMacroView.mockResolvedValue(undefined);
      await service.softDeleteMacroView('user_A', 'mac_01');
      expect(store.softDeleteMacroView).toHaveBeenCalledWith('user_A', 'mac_01');
    });

    it('스토어에서 NotFoundError가 전파된다', async () => {
      store.softDeleteMacroView.mockRejectedValue(new NotFoundError('not found'));
      await expect(service.softDeleteMacroView('user_A', 'mac_GONE')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ── restoreMacroView ───────────────────────────────────
  describe('restoreMacroView', () => {
    it('스토어의 restore를 호출한다', async () => {
      store.restoreMacroView.mockResolvedValue(undefined);
      await service.restoreMacroView('user_A', 'mac_01');
      expect(store.restoreMacroView).toHaveBeenCalledWith('user_A', 'mac_01');
    });
  });

  // ── cloneMacroView ─────────────────────────────────────
  describe('cloneMacroView', () => {
    it('원본이 없으면 NotFoundError를 던진다', async () => {
      store.getMacroView.mockResolvedValue(null);
      await expect(service.cloneMacroView('user_A', 'mac_MISSING')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('원본이 있으면 새 macroId로 createMacroView + cloneMacroGraph를 호출한다', async () => {
      const source = makeView();
      const cloned = makeView({ macroId: 'mac_CLONE', title: 'Test View (복사본)' });

      store.getMacroView
        .mockResolvedValueOnce(source)   // 원본 조회
        .mockResolvedValueOnce(cloned);  // 복제 후 조회
      store.createMacroView.mockResolvedValue(cloned);
      store.cloneMacroGraph.mockResolvedValue(undefined);

      const result = await service.cloneMacroView('user_A', 'mac_01');

      expect(store.createMacroView).toHaveBeenCalledWith(
        'user_A',
        expect.any(String), // ULID
        expect.objectContaining({ title: 'Test View (복사본)' })
      );
      expect(store.cloneMacroGraph).toHaveBeenCalledWith('user_A', 'mac_01', expect.any(String));
      expect(result.macroId).toBe('mac_CLONE');
    });

    it('제목이 없는 원본을 복제할 때 title을 undefined로 유지한다', async () => {
      const source = makeView({ title: undefined });
      const cloned = makeView({ macroId: 'mac_CLONE', title: undefined });

      store.getMacroView
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(cloned);
      store.createMacroView.mockResolvedValue(cloned);
      store.cloneMacroGraph.mockResolvedValue(undefined);

      await service.cloneMacroView('user_A', 'mac_01');

      expect(store.createMacroView).toHaveBeenCalledWith(
        'user_A',
        expect.any(String),
        expect.objectContaining({ title: undefined })
      );
    });

    it('복제 후 getMacroView가 null이면 NotFoundError를 던진다', async () => {
      const source = makeView();
      store.getMacroView
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null); // 복제 후 조회 실패 (비정상)
      store.createMacroView.mockResolvedValue(source);
      store.cloneMacroGraph.mockResolvedValue(undefined);

      await expect(service.cloneMacroView('user_A', 'mac_01')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
