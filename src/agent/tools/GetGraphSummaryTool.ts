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
      description: '사용자의 지식 그래프 전체에 대한 통계 및 요약 정보를 가져옵니다. (노드 수, 엣지 수, 핵심 클러스터 등)',
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
