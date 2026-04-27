import { DualWriteGraphStoreProxy } from '../../src/infra/graph/DualWriteGraphStoreProxy';
import type { GraphDocumentStore } from '../../src/core/ports/GraphDocumentStore';
import type { MacroGraphStore } from '../../src/core/ports/MacroGraphStore';
import type {
  GraphNodeDoc,
  GraphEdgeDoc,
  GraphClusterDoc,
  GraphSubclusterDoc,
  GraphStatsDoc,
  GraphSummaryDoc,
} from '../../src/core/types/persistence/graph.persistence';

// Sentry mock
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));
import * as Sentry from '@sentry/node';

// logger mock
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
import { logger } from '../../src/shared/utils/logger';

// ── fixtures ────────────────────────────────────────────────────────────────

const STATS: GraphStatsDoc = {
  id: 'user1',
  userId: 'user1',
  nodes: 1,
  edges: 0,
  clusters: 0,
  status: 'CREATED',
  generatedAt: '2026-01-01T00:00:00.000Z',
  metadata: {},
};

const NODE: GraphNodeDoc = {
  id: 1,
  userId: 'user1',
  origId: 'orig1',
  clusterId: 'c1',
  clusterName: 'Cluster 1',
  timestamp: null,
  numMessages: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ── helpers ─────────────────────────────────────────────────────────────────

function makePrimary(overrides?: Partial<GraphDocumentStore>): jest.Mocked<GraphDocumentStore> {
  return {
    upsertNode: jest.fn().mockResolvedValue(undefined),
    upsertNodes: jest.fn().mockResolvedValue(undefined),
    updateNode: jest.fn().mockResolvedValue(undefined),
    deleteNode: jest.fn().mockResolvedValue(undefined),
    deleteNodes: jest.fn().mockResolvedValue(undefined),
    deleteNodesByOrigIds: jest.fn().mockResolvedValue(undefined),
    restoreNode: jest.fn().mockResolvedValue(undefined),
    restoreNodesByOrigIds: jest.fn().mockResolvedValue(undefined),
    findNode: jest.fn().mockResolvedValue(null),
    findNodesByOrigIds: jest.fn().mockResolvedValue([]),
    findNodesByOrigIdsAll: jest.fn().mockResolvedValue([]),
    listNodes: jest.fn().mockResolvedValue([NODE]),
    listNodesAll: jest.fn().mockResolvedValue([NODE]),
    listNodesByCluster: jest.fn().mockResolvedValue([]),
    deleteAllGraphData: jest.fn().mockResolvedValue(undefined),
    restoreAllGraphData: jest.fn().mockResolvedValue(undefined),
    upsertEdge: jest.fn().mockResolvedValue('edge1'),
    upsertEdges: jest.fn().mockResolvedValue(undefined),
    deleteEdge: jest.fn().mockResolvedValue(undefined),
    deleteEdgeBetween: jest.fn().mockResolvedValue(undefined),
    deleteEdgesByNodeIds: jest.fn().mockResolvedValue(undefined),
    restoreEdge: jest.fn().mockResolvedValue(undefined),
    listEdges: jest.fn().mockResolvedValue([]),
    upsertCluster: jest.fn().mockResolvedValue(undefined),
    upsertClusters: jest.fn().mockResolvedValue(undefined),
    deleteCluster: jest.fn().mockResolvedValue(undefined),
    restoreCluster: jest.fn().mockResolvedValue(undefined),
    findCluster: jest.fn().mockResolvedValue(null),
    listClusters: jest.fn().mockResolvedValue([]),
    upsertSubcluster: jest.fn().mockResolvedValue(undefined),
    upsertSubclusters: jest.fn().mockResolvedValue(undefined),
    deleteSubcluster: jest.fn().mockResolvedValue(undefined),
    restoreSubcluster: jest.fn().mockResolvedValue(undefined),
    listSubclusters: jest.fn().mockResolvedValue([]),
    saveStats: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockResolvedValue(STATS),
    deleteStats: jest.fn().mockResolvedValue(undefined),
    upsertGraphSummary: jest.fn().mockResolvedValue(undefined),
    getGraphSummary: jest.fn().mockResolvedValue(null),
    deleteGraphSummary: jest.fn().mockResolvedValue(undefined),
    restoreGraphSummary: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<GraphDocumentStore>;
}

function makeSecondary(overrides?: Partial<MacroGraphStore>): jest.Mocked<MacroGraphStore> {
  return {
    upsertGraph: jest.fn().mockResolvedValue({ nodes: 1, edges: 0, clusters: 0, subclusters: 0, summary: false }),
    findNode: jest.fn().mockResolvedValue(null),
    findNodesByOrigIds: jest.fn().mockResolvedValue([]),
    listNodes: jest.fn().mockResolvedValue([NODE]),
    listNodesByCluster: jest.fn().mockResolvedValue([]),
    listEdges: jest.fn().mockResolvedValue([]),
    findCluster: jest.fn().mockResolvedValue(null),
    listClusters: jest.fn().mockResolvedValue([]),
    listSubclusters: jest.fn().mockResolvedValue([]),
    getStats: jest.fn().mockResolvedValue(STATS),
    getGraphSummary: jest.fn().mockResolvedValue(null),
    deleteGraph: jest.fn().mockResolvedValue(undefined),
    deleteGraphSummary: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<MacroGraphStore>;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('DualWriteGraphStoreProxy', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── secondaryWritesEnabled = false (default) ───────────────────────────────

  describe('secondaryWritesEnabled = false (default)', () => {
    it('upsertNode: primary만 호출하고 secondary는 호출하지 않는다', async () => {
      const primary = makePrimary();
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary);

      await proxy.upsertNode(NODE);

      expect(primary.upsertNode).toHaveBeenCalledWith(NODE, undefined);
      // shadowWritesEnabled=false이므로 syncFullGraphFromMongo가 실행되지 않아야 함
      // 단, fire-and-forget이므로 곧바로 단언하면 타이밍 이슈 가능 → setImmediate 이후 확인
      await new Promise((r) => setImmediate(r));
      expect(secondary.upsertGraph).not.toHaveBeenCalled();
    });
  });

  // ── write 흐름 ─────────────────────────────────────────────────────────────

  describe('secondaryWritesEnabled = true', () => {
    it('upsertNode: primary 먼저 호출, 이후 secondary.upsertGraph가 호출된다', async () => {
      const primary = makePrimary();
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      await proxy.upsertNode(NODE);
      await new Promise((r) => setImmediate(r));

      // primary가 먼저 호출됨을 순서로 검증
      const primaryCallOrder = (primary.upsertNode as jest.Mock).mock.invocationCallOrder[0];
      const secondaryCallOrder = (secondary.upsertGraph as jest.Mock).mock.invocationCallOrder[0];
      expect(primaryCallOrder).toBeLessThan(secondaryCallOrder);
      expect(secondary.upsertGraph).toHaveBeenCalledTimes(1);
    });

    it('primary write 실패 시 secondary sync가 호출되지 않고 예외가 전파된다', async () => {
      const error = new Error('Mongo write failed');
      const primary = makePrimary({ upsertNode: jest.fn().mockRejectedValue(error) });
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      await expect(proxy.upsertNode(NODE)).rejects.toThrow('Mongo write failed');
      await new Promise((r) => setImmediate(r));
      expect(secondary.upsertGraph).not.toHaveBeenCalled();
    });

    it('Neo4j write 실패 시 Mongo 결과는 유지되고 예외가 외부로 전파되지 않는다', async () => {
      const secondary = makeSecondary({
        upsertGraph: jest.fn().mockRejectedValue(new Error('Neo4j down')),
      });
      const primary = makePrimary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      // upsertNode 자체는 성공해야 한다
      await expect(proxy.upsertNode(NODE)).resolves.toBeUndefined();
      await new Promise((r) => setImmediate(r));

      // logger.warn 또는 Sentry가 호출되어야 한다
      expect((logger.warn as jest.Mock).mock.calls.length + (Sentry.captureException as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('stats가 null이면 Neo4j sync를 건너뛴다', async () => {
      const primary = makePrimary({ getStats: jest.fn().mockResolvedValue(null) });
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      await proxy.upsertNode(NODE);
      await new Promise((r) => setImmediate(r));

      expect(secondary.upsertGraph).not.toHaveBeenCalled();
    });

    it('deleteAllGraphData: Mongo 성공 후 secondary.deleteGraph를 호출한다', async () => {
      const primary = makePrimary();
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      await proxy.deleteAllGraphData('user1');

      expect(primary.deleteAllGraphData).toHaveBeenCalledWith('user1', undefined, undefined);
      expect(secondary.deleteGraph).toHaveBeenCalledWith('user1');
    });

    it('deleteGraphSummary: Mongo 성공 후 secondary.deleteGraphSummary를 호출한다', async () => {
      const primary = makePrimary();
      const secondary = makeSecondary();
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
      });

      await proxy.deleteGraphSummary('user1');

      expect(primary.deleteGraphSummary).toHaveBeenCalledWith('user1', undefined, undefined);
      expect(secondary.deleteGraphSummary).toHaveBeenCalledWith('user1');
    });
  });

  // ── read compare ──────────────────────────────────────────────────────────

  describe('shadowReadCompare = true', () => {
    it('listNodes: Mongo와 Neo4j 결과가 같으면 warn이 발생하지 않는다', async () => {
      const primary = makePrimary({ listNodes: jest.fn().mockResolvedValue([NODE]) });
      const secondary = makeSecondary({ listNodes: jest.fn().mockResolvedValue([NODE]) });
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
        shadowReadCompare: true,
      });

      const result = await proxy.listNodes('user1');

      expect(result).toEqual([NODE]);
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: 'listNodes' }),
        'Macro graph dual read mismatch'
      );
    });

    it('listNodes: 결과가 다르면 Mongo 값을 반환하고 warn이 발생한다', async () => {
      const differentNode = { ...NODE, id: 99 };
      const primary = makePrimary({ listNodes: jest.fn().mockResolvedValue([NODE]) });
      const secondary = makeSecondary({ listNodes: jest.fn().mockResolvedValue([differentNode]) });
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
        shadowReadCompare: true,
      });

      const result = await proxy.listNodes('user1');

      expect(result).toEqual([NODE]); // Mongo 값 반환
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'listNodes', userId: 'user1' }),
        'Macro graph dual read mismatch'
      );
    });

    it('getStats: Mongo와 Neo4j 결과가 같으면 warn 없이 Mongo 값 반환', async () => {
      const primary = makePrimary({ getStats: jest.fn().mockResolvedValue(STATS) });
      const secondary = makeSecondary({ getStats: jest.fn().mockResolvedValue(STATS) });
      const proxy = new DualWriteGraphStoreProxy(primary, secondary, {
        secondaryWritesEnabled: true,
        shadowReadCompare: true,
      });

      const result = await proxy.getStats('user1');

      expect(result).toEqual(STATS);
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ method: 'getStats' }),
        'Macro graph dual read mismatch'
      );
    });
  });
});
