import { GraphVectorRepository } from '../../infra/repositories/GraphVectorRepository';
import { logger } from '../../shared/utils/logger';

/**
 * Service: GraphVectorService
 *
 * 책임:
 * - 그래프 임베딩 벡터와 관련된 비즈니스 로직을 처리합니다.
 * - GraphVectorRepository를 통해 Vector DB와 상호작용합니다.
 * - 현재는 주로 AI 파이프라인 결과(features.json)를 저장하는 역할을 수행합니다.
 * - 추후 벡터 검색, 유사도 분석 등의 기능이 추가될 수 있습니다.
 */
export class GraphVectorService {
  constructor(private readonly graphVectorRepo: GraphVectorRepository) {}

  /**
   * UI/Handler에서 구성한 Vector Item 배열을 저장합니다.
   *
   * @param userId - 사용자 ID
   * @param items - 저장할 Vector Items
   */
  async saveGraphFeatures(userId: string, items: any[]): Promise<void> {
    logger.info({ userId, count: items.length }, 'GraphVectorService: Saving graph features');
    await this.graphVectorRepo.saveGraphFeatures(userId, items);
  }

  /**
   * 벡터 유사도 검색을 수행합니다. (예시)
   *
   * @param userId - 사용자 ID
   * @param queryVector - 검색할 벡터
   * @param limit - 결과 개수
   */
  async searchNodes(userId: string, queryVector: number[], limit: number = 5) {
    return this.graphVectorRepo.searchNodes(userId, queryVector, limit);
  }
}
