import type { GraphNeo4jStore } from '../ports/GraphNeo4jStore';
import type {
  AiMicroscopeIngestBundle,
  MicroscopeIngestPersistStats,
} from '../../shared/dtos/ai_graph_output';
import { UpstreamError } from '../../shared/errors/domain';
import { isPersistableMicroscopeBundle } from '../../shared/utils/parseMicroscopeS3Payload';
import { logger } from '../../shared/utils/logger';

/**
 * Microscope ingest 결과를 Neo4j에 저장하는 서비스입니다.
 *
 * 정책: AI 서버는 Neo4j read + Chroma write 만 수행하고,
 * graph topology(Entity/Chunk/REL) 쓰기는 이 서비스를 통해 BE Worker에서만 실행합니다.
 */
export class MicroscopeNeo4jPersistenceService {
  constructor(private readonly neo4jStore: GraphNeo4jStore) {}

  /**
   * S3 ingest_bundle.json 페이로드를 Neo4j에 저장합니다.
   * @throws {UpstreamError} bundle 검증 실패 또는 Neo4j 저장 실패 시
   */
  async persistIngestBundle(
    bundle: AiMicroscopeIngestBundle
  ): Promise<MicroscopeIngestPersistStats> {
    if (!isPersistableMicroscopeBundle(bundle)) {
      throw new UpstreamError('Invalid microscope ingest bundle for Neo4j persist');
    }

    try {
      const stats = await this.neo4jStore.persistMicroscopeIngest(bundle);
      logger.info(
        {
          userId: bundle.user_id,
          groupId: bundle.group_id,
          sourceId: bundle.source_id,
          ...stats,
        },
        'Microscope ingest persisted to Neo4j'
      );
      return stats;
    } catch (err) {
      throw new UpstreamError('MicroscopeNeo4jPersistenceService.persistIngestBundle failed', {
        cause: String(err),
      });
    }
  }
}
