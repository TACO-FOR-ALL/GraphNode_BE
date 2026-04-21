import { VectorStore, MacroNodeSearchResult } from '../ports/VectorStore';
import { GraphManagementService } from './GraphManagementService';
import { logger } from '../../shared/utils/logger';
import { GraphNodeDto } from '../../shared/dtos/graph';

/**
 * @class GraphVectorService
 * @description
 * 그래프 노드 임베딩 벡터의 저장 및 검색 전담 서비스.
 *
 * 역할:
 * - ChromaDB(VectorStore)를 통한 벡터 upsert/search
 * - 검색 결과(orig_id)를 GraphManagementService로 MongoDB 노드 정보와 결합(Enrichment)
 *
 * 범위:
 * - AI 생성 시 벡터 저장 (GraphGenerationResultHandler → saveGraphFeatures)
 * - 에이전트 기능의 의미 기반 노드 검색 (searchNodes)
 * - 사용자 편집 API와는 무관. 편집 시 벡터 재동기화는 별도 정책 결정 필요.
 *
 * 진입점: GraphEmbeddingService 또는 워커 핸들러에서만 호출.
 */
export class GraphVectorService {
  /** AI 워커와 동기화된 기본 컬렉션 명칭 */
  private static readonly COLLECTION_NAME = 'macro_node_all_minilm_l6_v2';

  constructor(
    private readonly vectorStore: VectorStore,
    private readonly graphMgmtService: GraphManagementService
  ) {}

  /**
   * AI 파이프라인에서 생성된 벡터 데이터를 저장합니다.
   *
   * @param userId 사용자 ID
   * @param items 저장할 벡터 항목 배열
   */
  async saveGraphFeatures(userId: string, items: any[]): Promise<void> {
    logger.info({ userId, count: items.length }, 'GraphVectorService: Saving graph features');
    await this.vectorStore.upsert(GraphVectorService.COLLECTION_NAME, items);
  }

  /**
   * 벡터 유사도 검색 및 데이터 보강(Enrichment)을 수행합니다.
   *
   * @param userId 사용자 ID
   * @param queryVector 검색할 질의 벡터
   * @param limit 결과 개수 제한
   * @returns 보강된 노드 데이터와 유사도 점수 배열
   */
  async searchNodes(
    userId: string,
    queryVector: number[],
    limit: number = 5
  ): Promise<Array<{ node: GraphNodeDto; score: number }>> {
    try {
      // 1. Vector Store에서 유사한 벡터 검색
      const vectorResults: MacroNodeSearchResult[] = await this.vectorStore.search(
        GraphVectorService.COLLECTION_NAME,
        queryVector,
        {
          filter: { user_id: userId },
          limit,
        }
      );

      if (vectorResults.length === 0) return [];

      // 2. 검색 결과에서 orig_id 추출 및 중복 제거
      const origIds = [...new Set(vectorResults.map((v) => v.payload.orig_id))];

      // 3. MongoDB에서 해당 orig_id를 가진 노드 정보 대량 조회
      const nodes = await this.graphMgmtService.findNodesByOrigIds(userId, origIds);

      // 4. 노드 맵 구축 (origId -> NodeDto)
      const nodeMap = new Map<string, GraphNodeDto>();
      nodes.forEach((n) => {
        if (n.origId) nodeMap.set(n.origId, n);
      });

      // 5. 검색 점수와 노드 데이터를 결합하여 최종 반환 (Enrichment)
      const results: Array<{ node: GraphNodeDto; score: number }> = [];

      for (const vectorResult of vectorResults) {
        // 벡터 데이터의 orig_id로 MongoDB에서 조회된 노드 정보를 찾습니다.
        const node = nodeMap.get(vectorResult.payload.orig_id);

        if (node) {
          // 일치하는 노드가 있을 경우에만 결과 목록에 추가합니다.
          results.push({
            node: node,
            score: vectorResult.score,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      logger.error({ err, userId }, 'GraphVectorService.searchNodes failed');
      throw err;
    }
  }
}
