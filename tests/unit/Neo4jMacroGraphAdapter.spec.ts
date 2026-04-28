/**
 * Neo4jMacroGraphAdapter 단위 테스트
 *
 * 실제 Neo4j DB에 접속하지 않습니다. neo4j-driver와 getNeo4jDriver를 mock합니다.
 */

import { Neo4jMacroGraphAdapter } from '../../src/infra/graph/Neo4jMacroGraphAdapter';
import { MACRO_GRAPH_CYPHER } from '../../src/infra/graph/cypher/macroGraph.cypher';
import type { MacroGraphUpsertInput } from '../../src/core/ports/MacroGraphStore';
import type {
  GraphNodeDoc,
  GraphStatsDoc,
} from '../../src/core/types/persistence/graph.persistence';

// neo4j driver mock
jest.mock('../../src/infra/db/neo4j', () => ({
  getNeo4jDriver: jest.fn(),
}));
import { getNeo4jDriver } from '../../src/infra/db/neo4j';

// logger mock
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── fixtures ─────────────────────────────────────────────────────────────────

const NODE: GraphNodeDoc = {
  id: 1,
  userId: 'user1',
  origId: 'orig1',
  clusterId: 'c1',
  clusterName: 'Cluster 1',
  timestamp: null,
  numMessages: 5,
  sourceType: 'chat',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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

const UPSERT_INPUT: MacroGraphUpsertInput = {
  userId: 'user1',
  nodes: [NODE],
  edges: [],
  clusters: [],
  subclusters: [],
  stats: STATS,
  summary: undefined,
};

// ── mock driver factory ───────────────────────────────────────────────────────

function makeMockTx(runResults: Map<string, { records: unknown[] }> = new Map()) {
  return {
    run: jest.fn().mockImplementation((query: string, _params?: unknown) => {
      // 쿼리 내용으로 결과 매핑 (prefix match)
      for (const [key, val] of runResults.entries()) {
        if (query.includes(key)) return Promise.resolve(val);
      }
      return Promise.resolve({ records: [] });
    }),
  };
}

function makeMockDriver(txFn: (tx: ReturnType<typeof makeMockTx>) => void = () => {}) {
  const tx = makeMockTx();
  const session = {
    executeWrite: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => {
      txFn(tx);
      await fn(tx);
    }),
    run: jest.fn().mockResolvedValue({ records: [] }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    driver: { session: jest.fn().mockReturnValue(session) },
    session,
    tx,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('Neo4jMacroGraphAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('upsertGraph', () => {
    it('MACRO_GRAPH_CYPHER와 mapper를 사용해 write transaction 안에서 batch query를 호출한다', async () => {
      const { driver, session, tx } = makeMockDriver();
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      const result = await adapter.upsertGraph(UPSERT_INPUT);

      expect(session.executeWrite).toHaveBeenCalledTimes(1);

      // purgeUserData, upsertGraphRoot, upsertNodes가 tx.run에서 호출됨을 검증
      const calledQueries: string[] = (tx.run as jest.Mock).mock.calls.map(
        (c: [string, ...unknown[]]) => c[0]
      );
      const hasQuery = (fragment: string) =>
        calledQueries.some((q) => q.includes(fragment));

      expect(hasQuery('DETACH DELETE n, cl, sc, rel, st, sm')).toBe(true); // purgeUserData
      expect(hasQuery('MERGE (g:MacroGraph')).toBe(true);                  // upsertGraphRoot
      expect(hasQuery('UNWIND $rows AS row')).toBe(true);                   // batch upsert

      expect(result).toEqual({
        nodes: 1,
        edges: 0,
        clusters: 0,
        subclusters: 0,
        summary: false,
      });
    });

    it('노드가 없으면 upsertNodes query를 호출하지 않는다', async () => {
      const { driver, tx } = makeMockDriver();
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      await adapter.upsertGraph({ ...UPSERT_INPUT, nodes: [] });

      const calledQueries: string[] = (tx.run as jest.Mock).mock.calls.map(
        (c: [string, ...unknown[]]) => c[0]
      );
      // upsertNodes는 UNWIND + MacroNode label을 포함 — nodes=[]이면 호출하지 않아야 함
      const nodeUpsertCalls = calledQueries.filter((q) => q.includes('MacroNode') && q.includes('UNWIND'));
      expect(nodeUpsertCalls).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('Neo4j 저장 property가 아닌 count aggregate row를 mapper로 복원한다', async () => {
      const statsProps = {
        id: 'user1',
        userId: 'user1',
        status: 'CREATED',
        generatedAt: '2026-01-01T00:00:00.000Z',
        metadataJson: '{}',
      };

      // MATCH ... HAS_STATS 쿼리 결과를 mock
      const statsRecord = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'st') return { properties: statsProps };
          if (key === 'nodes') return 3;    // count aggregate
          if (key === 'edges') return 2;
          if (key === 'clusters') return 1;
          return null;
        }),
      };

      const session = {
        run: jest.fn().mockResolvedValue({ records: [statsRecord] }),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const driver = { session: jest.fn().mockReturnValue(session) };
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      const result = await adapter.getStats('user1');

      expect(result).not.toBeNull();
      expect(result!.nodes).toBe(3);   // aggregate에서 복원
      expect(result!.edges).toBe(2);
      expect(result!.clusters).toBe(1);
      expect(result!.status).toBe('CREATED');
    });

    it('MacroGraph가 없으면 null을 반환한다', async () => {
      const session = {
        run: jest.fn().mockResolvedValue({ records: [] }),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const driver = { session: jest.fn().mockReturnValue(session) };
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      const result = await adapter.getStats('user1');
      expect(result).toBeNull();
    });
  });

  describe('deleteGraph', () => {
    it('write session에서 deleteGraph Cypher를 실행한다', async () => {
      const tx = makeMockTx();
      const session = {
        executeWrite: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const driver = { session: jest.fn().mockReturnValue(session) };
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      await adapter.deleteGraph('user1');

      const calledQuery = (tx.run as jest.Mock).mock.calls[0][0] as string;
      expect(calledQuery).toContain('DETACH DELETE g, n, cl, sc, rel, st, sm');
    });
  });

  describe('deleteGraphSummary', () => {
    it('write session에서 deleteGraphSummary Cypher를 실행한다', async () => {
      const tx = makeMockTx();
      const session = {
        executeWrite: jest.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
        close: jest.fn().mockResolvedValue(undefined),
      };
      const driver = { session: jest.fn().mockReturnValue(session) };
      (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

      const adapter = new Neo4jMacroGraphAdapter();
      await adapter.deleteGraphSummary('user1');

      const calledQuery = (tx.run as jest.Mock).mock.calls[0][0] as string;
      expect(calledQuery).toContain('DETACH DELETE sm');
    });
  });
});
