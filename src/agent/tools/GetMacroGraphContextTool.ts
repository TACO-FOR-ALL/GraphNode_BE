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
        "사용자가 지식 그래프의 '전체 구조', '요약', '전체 맥락', '모든 노드'를 조망하고 싶을 때 호출합니다. 특정 키워드 검색이 아니라 전체 그래프 상태를 한 번에 확인할 때 사용하세요.",
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
