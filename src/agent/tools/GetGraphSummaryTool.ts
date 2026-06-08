import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';

/**
 * 그래프 요약 정보 조회 도구
 */
export class GetGraphSummaryTool implements IAgentTool {
  readonly name = 'get_graph_summary';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_graph_summary',
      description: "사용자 지식 그래프의 가벼운 '통계(노드/엣지 수)'와 '핵심 요약 텍스트'만 빠르게 보고 싶을 때 호출합니다. 구체적인 개별 노드나 엣지 데이터는 반환하지 않으므로, 토큰을 절약하면서 전체 흐름만 파악할 때 유용합니다.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  };

  async execute(userId: string, _args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { graphEmbeddingService } = deps;
    // Graph 정보 조회
    const stats = await graphEmbeddingService.getStats(userId);
    const snapshot = await graphEmbeddingService.getSnapshotForUser(userId);

    // FIXED(강현일) : SubCluster 등의 추가된 정보들도 돌려주게 변경
    return JSON.stringify({
      message: '그래프 요약 정보입니다.',
      stats: {
        totalNodes: stats?.nodes ?? 0,
        totalEdges: stats?.edges ?? 0,
        totalClusters: stats?.clusters ?? 0,
      },
      clusters:
        snapshot?.clusters?.map((c) => ({
          id: c.id,
          name: c.name,
          nodeCount: snapshot?.nodes?.filter((n) => n.clusterId === c.id).length ?? 0,
        })) ?? [],
      subclusters:
        snapshot?.subclusters?.map((s) => ({
          id: s.id,
          clusterId: s.clusterId,
          size: s.size,
          topKeywords: s.topKeywords,
        })) ?? [],
    });
  }
}
