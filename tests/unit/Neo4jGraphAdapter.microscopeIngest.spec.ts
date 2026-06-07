/**
 * Neo4jGraphAdapter.persistMicroscopeIngest 단위 테스트
 * 실제 Neo4j 연결 없이 driver mock 으로 transaction 호출을 검증합니다.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { Neo4jGraphAdapter } from '../../src/infra/graph/Neo4jGraphAdapter';
import { MICROSCOPE_INGEST_CYPHER } from '../../src/infra/graph/cypher/microscopeIngest.cypher';
import type { AiMicroscopeIngestBundle } from '../../src/shared/dtos/ai_graph_output';

jest.mock('../../src/infra/db/neo4j', () => ({
  getNeo4jDriver: jest.fn(),
}));
import { getNeo4jDriver } from '../../src/infra/db/neo4j';

const BUNDLE: AiMicroscopeIngestBundle = {
  standardized_graphs: [
    {
      nodes: [
        {
          name: 'Alpha',
          type: 'Concept',
          description: 'desc',
          source_chunk_id: 0,
        },
      ],
      edges: [{ start: 'Alpha', target: 'Beta', type: 'relates', description: 'd' }],
    },
  ],
  source_id: 'src-1',
  source_name: 'a.md',
  user_id: 'user-1',
  group_id: 'group-1',
  chunk_id_map: { '0': 'chunk-0' },
  chunks: [{ uuid: 'chunk-0', chunk_index: 0, text: 'x'.repeat(600) }],
};

function makeMockDriver() {
  const tx = { run: jest.fn<() => Promise<{ records: unknown[] }>>(async () => ({ records: [] })) };
  const session = {
    executeWrite: jest.fn(async (fn: (innerTx: typeof tx) => Promise<void>) => fn(tx)),
    close: jest.fn(async () => undefined),
  };
  const driver = { session: jest.fn(() => session) };
  return { driver, session, tx };
}

describe('Neo4jGraphAdapter.persistMicroscopeIngest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('단일 write transaction 안에서 Chunk→Entity→Link→REL 순으로 쿼리를 실행한다', async () => {
    const { driver, session, tx } = makeMockDriver();
    (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

    const adapter = new Neo4jGraphAdapter();
    const stats = await adapter.persistMicroscopeIngest(BUNDLE);

    expect(session.executeWrite).toHaveBeenCalledTimes(1);
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(stats).toEqual({
      chunks_written: 1,
      entities_written: 1,
      edges_written: 1,
      chunk_entity_links: 1,
    });

    const queries: string[] = (tx.run.mock.calls as unknown as Array<[string, unknown]>).map(
      (c) => c[0]
    );
    expect(queries.some((q) => q.includes(MICROSCOPE_INGEST_CYPHER.mergeChunk.trim().slice(0, 20)))).toBe(
      true
    );
    expect(queries.some((q) => q.includes('MERGE (n:Entity'))).toBe(true);
    expect(queries.some((q) => q.includes('EXTRACTED_FROM'))).toBe(true);
    expect(queries.some((q) => q.includes('MERGE (a)-[r:REL'))).toBe(true);
  });

  it('Chunk text 는 500자로 잘린다', async () => {
    const { driver, tx } = makeMockDriver();
    (getNeo4jDriver as jest.Mock).mockReturnValue(driver);

    const adapter = new Neo4jGraphAdapter();
    await adapter.persistMicroscopeIngest(BUNDLE);

    const calls = tx.run.mock.calls as unknown as Array<[string, { text: string }]>;
    const chunkCall = calls.find((c) => c[0].includes('MERGE (c:Chunk'));
    expect(chunkCall).toBeDefined();
    const params = chunkCall?.[1];
    expect(params?.text).toHaveLength(500);
  });
});
