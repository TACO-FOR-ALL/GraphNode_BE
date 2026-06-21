/**
 * Unit Tests: MacroGraph Deep Clone — Cypher 쿼리 존재 확인 + 어댑터 메서드 검증
 */

import { MACRO_GRAPH_CYPHER } from '../../src/infra/graph/cypher/macroGraph.cypher';

// Neo4jMacroGraphAdapter는 getNeo4jDriver()를 직접 호출하므로 모킹이 필요
const mockTx = {
  run: jest.fn().mockResolvedValue({ records: [] }),
};
const mockSession = {
  executeWrite: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx)),
  close: jest.fn().mockResolvedValue(undefined),
};
const mockDriver = {
  session: jest.fn().mockReturnValue(mockSession),
};

jest.mock('../../src/infra/db/neo4j', () => ({
  getNeo4jDriver: () => mockDriver,
}));

const cypher = MACRO_GRAPH_CYPHER as unknown as Record<string, unknown>;

describe('MACRO_GRAPH_CYPHER — Deep Clone 쿼리 존재 확인', () => {
  const EXPECTED_CLONE_KEYS = [
    'cloneMacroGraphRoot',
    'cloneMacroGraphNodes',
    'cloneMacroGraphClusters',
    'cloneMacroGraphRelations',
    'cloneMacroGraphSubclusters',
    'cloneMacroGraphBelongsTo',
    'cloneMacroGraphRelatesSource',
    'cloneMacroGraphRelatesTarget',
    'cloneMacroGraphMacroRelated',
    'cloneMacroGraphContains',
    'cloneMacroGraphRepresents',
    'cloneMacroGraphHasSubcluster',
  ] as const;

  EXPECTED_CLONE_KEYS.forEach((key) => {
    it(`${key} 쿼리가 정의되어 있다`, () => {
      expect(cypher[key]).toBeDefined();
      expect(typeof cypher[key]).toBe('string');
    });
  });

  const expectQuery = (key: string) => {
    const q = cypher[key] as string;
    expect(typeof q).toBe('string');
    return q;
  };

  it('cloneMacroGraphBelongsTo는 BELONGS_TO 관계를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphBelongsTo');
    expect(q).toContain('BELONGS_TO');
    expect(q).toContain('MERGE');
    expect(q).toContain('IN TRANSACTIONS OF 500 ROWS');
    expect(q).toContain('$newMacroId');
    expect(q).toContain('$sourceMacroId');
  });

  it('cloneMacroGraphRelatesSource는 RELATES_SOURCE를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphRelatesSource');
    expect(q).toContain('RELATES_SOURCE');
    expect(q).toContain('MacroRelation');
    expect(q).toContain('MERGE');
  });

  it('cloneMacroGraphRelatesTarget는 RELATES_TARGET를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphRelatesTarget');
    expect(q).toContain('RELATES_TARGET');
    expect(q).toContain('MacroRelation');
  });

  it('cloneMacroGraphMacroRelated는 MACRO_RELATED를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphMacroRelated');
    expect(q).toContain('MACRO_RELATED');
    expect(q).toContain('MacroNode');
  });

  it('cloneMacroGraphContains는 CONTAINS를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphContains');
    expect(q).toContain('CONTAINS');
    expect(q).toContain('MacroSubcluster');
  });

  it('cloneMacroGraphRepresents는 REPRESENTS를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphRepresents');
    expect(q).toContain('REPRESENTS');
    expect(q).toContain('MacroSubcluster');
  });

  it('cloneMacroGraphHasSubcluster는 MacroCluster→MacroSubcluster HAS_SUBCLUSTER를 MERGE한다', () => {
    const q = expectQuery('cloneMacroGraphHasSubcluster');
    expect(q).toContain('HAS_SUBCLUSTER');
    expect(q).toContain('MacroCluster');
    expect(q).toContain('MacroSubcluster');
  });
});

describe('Neo4jMacroGraphAdapter.cloneMacroGraph — session.run 호출 순서', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.run.mockResolvedValue({ records: [] });
    mockSession.executeWrite.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx));
    mockSession.close.mockResolvedValue(undefined);
  });

  it('단일 executeWrite 트랜잭션 내에서 tx.run 12회 호출 (5 엔티티 + 7 관계)', async () => {
    const { Neo4jMacroGraphAdapter } = await import('../../src/infra/graph/Neo4jMacroGraphAdapter');
    const adapter = new Neo4jMacroGraphAdapter();

    await adapter.cloneMacroGraph('user_A', 'mac_SRC', 'mac_DST');

    // executeWrite가 단 1번 호출되어야 함 (단일 트랜잭션)
    expect(mockSession.executeWrite).toHaveBeenCalledTimes(1);
    // 5(엔티티) + 7(관계) = 12번 tx.run 호출
    expect(mockTx.run).toHaveBeenCalledTimes(12);
    expect(mockSession.close).toHaveBeenCalledTimes(1);

    // 파라미터에 sourceMacroId와 newMacroId가 모두 포함되어야 함
    const calls = mockTx.run.mock.calls as Array<[string, Record<string, unknown>]>;
    calls.forEach(([, params]) => {
      expect(params).toMatchObject({
        userId: 'user_A',
        sourceMacroId: 'mac_SRC',
        newMacroId: 'mac_DST',
      });
    });
  });

  it('트랜잭션 실패 시 session.close가 반드시 호출된다 (finally 보장)', async () => {
    mockSession.executeWrite.mockRejectedValue(new Error('Neo4j Error'));

    const { Neo4jMacroGraphAdapter } = await import('../../src/infra/graph/Neo4jMacroGraphAdapter');
    const adapter = new Neo4jMacroGraphAdapter();

    await expect(adapter.cloneMacroGraph('user_A', 'mac_SRC', 'mac_DST')).rejects.toThrow('Neo4j Error');
    expect(mockSession.close).toHaveBeenCalledTimes(1); // finally에서 반드시 호출
  });
});
