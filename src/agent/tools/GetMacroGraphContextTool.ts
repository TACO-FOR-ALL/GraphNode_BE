import { OpenAI } from 'openai';

import { AgentServiceDeps } from '../../core/services/AgentService';
import { IAgentTool } from '../types';

/**
 * @description 사용자 Macro Graph 전체 컨텍스트를 반환하는 도구입니다.
 */
export class GetMacroGraphContextTool implements IAgentTool {
  readonly name = 'get_macro_graph_context';

  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_macro_graph_context',
      description:
        "그래프의 '모든 노드와 엣지 구조 데이터'를 통째로 가져와야 할 때만 사용하세요. '전체 그래프를 상세히 분석해 줘', '모든 노드의 연결 관계를 볼래'와 같은 요구에 적합합니다. 단순 요약 텍스트만 필요하다면 get_graph_summary를 사용하여 토큰 낭비를 방지하세요.",
      parameters: {
        type: 'object',
        properties: {
          graphId: {
            type: 'string',
            description:
              '향후 다중 그래프 지원용 선택 파라미터. 현재는 1유저 1매크로 그래프라 무시됩니다.',
          },
        },
      },
    },
  };

  /**
   * @description 사용자 Macro Graph의 전체 스냅샷과 요약을 직렬화하여 반환합니다.
   * @param userId 요청 사용자 ID
   * @param args 도구 인자 (graphId 선택)
   * @param deps Agent 의존성
   * @returns 전체 그래프 컨텍스트 JSON 문자열
   */
  async execute(
    userId: string,
    args: { graphId?: string },
    deps: AgentServiceDeps,
    _openai: OpenAI
  ): Promise<string> {
    const graphId = typeof args?.graphId === 'string' ? args.graphId : null;
    const snapshot = await this.fetchMacroSnapshot(deps, userId, graphId ?? undefined);
    const summary = await deps.graphEmbeddingService.getGraphSummary(userId);
    const stats = await deps.graphEmbeddingService.getStats(userId);

    return JSON.stringify({
      message: 'Macro graph 전체 컨텍스트입니다.',
      scope: {
        userId,
        graphId,
        multiGraphReady: true,
      },
      stats,
      summary,
      snapshot,
    });
  }

  /**
   * @description graphId 확장 포인트를 유지하며 스냅샷을 가져옵니다.
   * @param deps Agent 의존성
   * @param userId 사용자 ID
   * @param _graphId 향후 다중 그래프 지원용
   * @returns 사용자 그래프 스냅샷
   */
  private async fetchMacroSnapshot(
    deps: AgentServiceDeps,
    userId: string,
    _graphId?: string
  ): Promise<Awaited<ReturnType<AgentServiceDeps['graphEmbeddingService']['getSnapshotForUser']>>> {
    return deps.graphEmbeddingService.getSnapshotForUser(userId);
  }
}
