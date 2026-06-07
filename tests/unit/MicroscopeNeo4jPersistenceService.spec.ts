import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { MicroscopeNeo4jPersistenceService } from '../../src/core/services/MicroscopeNeo4jPersistenceService';
import type { GraphNeo4jStore } from '../../src/core/ports/GraphNeo4jStore';
import type { AiMicroscopeIngestBundle } from '../../src/shared/dtos/ai_graph_output';
import { UpstreamError } from '../../src/shared/errors/domain';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('MicroscopeNeo4jPersistenceService', () => {
  let store: jest.Mocked<Pick<GraphNeo4jStore, 'persistMicroscopeIngest'>>;
  let service: MicroscopeNeo4jPersistenceService;

  const validBundle: AiMicroscopeIngestBundle = {
    standardized_graphs: [{ nodes: [], edges: [] }],
    source_id: 'src-1',
    source_name: 'note.md',
    user_id: 'user-1',
    group_id: 'group-1',
    chunk_id_map: {},
    chunks: [],
  };

  beforeEach(() => {
    store = {
      persistMicroscopeIngest: jest.fn(async () => ({
        chunks_written: 2,
        entities_written: 3,
        edges_written: 1,
        chunk_entity_links: 4,
      })),
    };
    service = new MicroscopeNeo4jPersistenceService(store as unknown as GraphNeo4jStore);
  });

  it('유효한 ingest_bundle 을 Neo4j store 에 위임한다', async () => {
    const stats = await service.persistIngestBundle(validBundle);

    expect(store.persistMicroscopeIngest).toHaveBeenCalledWith(validBundle);
    expect(stats.entities_written).toBe(3);
  });

  it('source_id 가 없으면 UpstreamError 를 던진다', async () => {
    const invalid = { ...validBundle, source_id: '' };

    await expect(service.persistIngestBundle(invalid)).rejects.toThrow(UpstreamError);
    expect(store.persistMicroscopeIngest).not.toHaveBeenCalled();
  });

  it('Neo4j store 실패 시 UpstreamError 로 래핑한다', async () => {
    store.persistMicroscopeIngest.mockRejectedValue(new Error('neo4j down'));

    await expect(service.persistIngestBundle(validBundle)).rejects.toThrow(
      'MicroscopeNeo4jPersistenceService.persistIngestBundle failed'
    );
  });
});
