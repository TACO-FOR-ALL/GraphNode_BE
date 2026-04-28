import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';
import { logger } from '../../shared/utils/logger';
import type { GraphRagNodeResult } from '../../shared/dtos/search';

/**
 * 대화 내용 검색 (Graph RAG) 도구.
 *
 * 기존 단순 벡터 유사도 검색을 Graph RAG 파이프라인으로 교체했습니다.
 *
 * 검색 흐름:
 *   1. keyword → MiniLM embedding (SearchService 내부)
 *   2. ChromaDB top-K Seed 노드 추출 (GraphVectorService)
 *   3. Neo4j MACRO_RELATED 관계 1홉/2홉 이웃 탐색 (Neo4jMacroGraphAdapter)
 *   4. vector score × hop decay × edge weight × connection bonus 결합 랭킹
 *
 * Agent 프롬프트 컨텍스트에는 combinedScore 내림차순으로 정렬된 노드 목록이 전달됩니다.
 * 각 노드는 origId(원본 데이터 ID), nodeType, hopDistance, combinedScore를 포함합니다.
 */
export class SearchConversationsTool implements IAgentTool {
  readonly name = 'search_conversations';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'search_conversations',
      description:
        '사용자의 과거 대화·노트·지식 노드 중에서 키워드와 의미적으로 유사한 내용을 검색합니다. ' +
        '벡터 유사도 검색(ChromaDB)과 지식 그래프 확장(Neo4j)을 결합한 Graph RAG 방식으로 작동합니다.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '검색할 키워드 혹은 질문' },
          limit: { type: 'number', description: '반환할 최대 결과 수 (기본값: 10)' },
        },
        required: ['keyword'],
      },
    },
  };

  /**
   * Graph RAG 검색 실행.
   *
   * @description
   * SearchService.graphRagSearch()가 임베딩 → ChromaDB → Neo4j 전체 파이프라인을 처리합니다.
   * 결과는 combinedScore 내림차순으로 정렬되어 Agent 프롬프트 컨텍스트로 포맷팅됩니다.
   *
   * @param userId 사용자 ID
   * @param args 검색 파라미터 ({keyword: string, limit?: number})
   * @param deps AgentServiceDeps (searchService 포함)
   * @param openai OpenAI 인스턴스 (미사용)
   * @returns JSON 직렬화된 Graph RAG 검색 결과 문자열
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { searchService } = deps;
    const keyword = String(args.keyword ?? '');
    const limit = Number(args.limit) || 10;

    if (!keyword.trim()) {
      return JSON.stringify({ message: '검색 키워드를 입력해주세요.', nodes: [] });
    }

    try {
      const result = await searchService.graphRagSearch(userId, keyword, limit);

      if (result.nodes.length === 0) {
        return JSON.stringify({
          message: '검색 결과가 없습니다. 지식 그래프가 아직 생성되지 않았거나, 관련 노드가 없습니다.',
          nodes: [],
        });
      }

      return JSON.stringify({
        message: `${result.nodes.length}개의 관련 노드를 찾았습니다. (Seed ${result.seedCount}개 → 그래프 확장 포함)`,
        nodes: result.nodes.map((node: GraphRagNodeResult) => ({
          id: node.origId,
          nodeType: node.nodeType,
          hopDistance: node.hopDistance,
          relevanceScore: Number(node.combinedScore.toFixed(4)),
          connectionCount: node.connectionCount,
          // hopDistance=0은 벡터 직접 매칭(Seed), 1/2는 그래프 이웃
          matchSource: node.hopDistance === 0 ? 'vector_seed' : `graph_${node.hopDistance}hop`,
        })),
      });
    } catch (e: unknown) {
      logger.error({ err: e, userId, keyword }, '[SearchConversationsTool] Graph RAG 검색 오류');
      return JSON.stringify({
        message: '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        nodes: [],
      });
    }
  }
}
