import { OpenAI } from 'openai';

import type { GraphNodeDto, GraphSnapshotDto } from '../../shared/dtos/graph';
import { AgentServiceDeps } from '../../core/services/AgentService';
import { IAgentTool } from '../types';

type NodeDetailsArgs = {
  nodeId?: number | string;
  keyword?: string;
  graphId?: string;
  limit?: number;
};

/**
 * @description Macro Graph 노드 상세 메타데이터를 조회하는 도구입니다.
 */
export class GetGraphNodeDetailsTool implements IAgentTool {
  readonly name = 'get_graph_node_details';

  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_graph_node_details',
      description:
        "사용자가 특정 노드의 상세 정보(원본 소스, 소속 클러스터, 생성/수정일 등)를 물을 때 호출합니다. nodeId가 있으면 단건 조회, 없으면 keyword로 관련 노드를 찾아 상세 정보를 반환합니다.",
      parameters: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'number',
            description: '상세 조회할 그래프 노드 ID',
          },
          keyword: {
            type: 'string',
            description: 'nodeId가 없을 때 title/요약/origId 기준으로 노드 검색 키워드',
          },
          graphId: {
            type: 'string',
            description:
              '향후 다중 그래프 지원용 선택 파라미터. 현재는 1유저 1매크로 그래프라 무시됩니다.',
          },
          limit: {
            type: 'number',
            description: 'keyword 검색 시 반환할 최대 개수 (기본 5)',
          },
        },
      },
    },
  };

  /**
   * @description 단건(nodeId) 또는 키워드 기반으로 노드 상세 정보를 반환합니다.
   * @param userId 사용자 ID
   * @param args 도구 인자
   * @param deps Agent 의존성
   * @returns 노드 상세 JSON 문자열
   */
  async execute(
    userId: string,
    args: NodeDetailsArgs,
    deps: AgentServiceDeps,
    _openai: OpenAI
  ): Promise<string> {
    const snapshot = await this.fetchMacroSnapshot(deps, userId, args.graphId);
    const nodeId = this.parseNodeId(args.nodeId);
    const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
    const limit = Math.max(1, Number(args.limit) || 5);

    if (nodeId == null && !keyword) {
      return JSON.stringify({
        error: 'nodeId 또는 keyword 중 하나는 반드시 필요합니다.',
      });
    }

    const targetNodes =
      nodeId != null
        ? snapshot.nodes.filter((node) => node.id === nodeId)
        : this.searchNodesByKeyword(snapshot.nodes, keyword).slice(0, limit);

    if (targetNodes.length === 0) {
      return JSON.stringify({
        message: '조건에 해당하는 그래프 노드를 찾지 못했습니다.',
        nodes: [],
      });
    }

    const details = targetNodes.map((node) => this.toNodeDetails(node, snapshot));
    return JSON.stringify({
      message: '노드 상세 조회 결과입니다.',
      scope: {
        userId,
        graphId: args.graphId ?? null,
        multiGraphReady: true,
      },
      nodes: details,
    });
  }

  /**
   * @description graphId 확장 포인트를 유지하며 사용자 스냅샷을 조회합니다.
   * @param deps Agent 의존성
   * @param userId 사용자 ID
   * @param _graphId 향후 다중 그래프 지원용
   * @returns 그래프 스냅샷
   */
  private async fetchMacroSnapshot(
    deps: AgentServiceDeps,
    userId: string,
    _graphId?: string
  ): Promise<GraphSnapshotDto> {
    return deps.graphEmbeddingService.getSnapshotForUser(userId);
  }

  /**
   * @description nodeId 인자를 number로 정규화합니다.
   * @param raw nodeId 원본 값
   * @returns number 또는 null
   */
  private parseNodeId(raw: number | string | undefined): number | null {
    if (raw == null) return null;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  /**
   * @description 키워드로 노드 제목/요약/origId를 검색합니다.
   * @param nodes 노드 배열
   * @param keyword 검색어
   * @returns 매칭 노드 배열
   */
  private searchNodesByKeyword(nodes: GraphNodeDto[], keyword: string): GraphNodeDto[] {
    return nodes.filter((node) => {
      const haystack = [
        node.nodeTitle,
        node.summary,
        node.origId,
        node.clusterName,
        node.label,
        typeof node.metadata?.sourceLink === 'string' ? node.metadata.sourceLink : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }

  /**
   * @description 노드 + 클러스터/엣지 정보를 합쳐 상세 응답 객체를 구성합니다.
   * @param node 대상 노드
   * @param snapshot 전체 스냅샷
   * @returns 상세 응답 객체
   */
  private toNodeDetails(node: GraphNodeDto, snapshot: GraphSnapshotDto) {
    const cluster = snapshot.clusters.find((c) => c.id === node.clusterId) ?? null;
    const relatedEdges = snapshot.edges.filter((edge) => edge.source === node.id || edge.target === node.id);

    return {
      nodeId: node.id,
      title: node.nodeTitle ?? node.label ?? null,
      summary: node.summary ?? null,
      sourceType: node.sourceType ?? null,
      sourceReference: {
        origId: node.origId,
        sourceLink: typeof node.metadata?.sourceLink === 'string' ? node.metadata.sourceLink : null,
        metadata: node.metadata ?? null,
      },
      cluster: cluster
        ? {
            id: cluster.id,
            name: cluster.name,
            description: cluster.description,
          }
        : null,
      timestamps: {
        createdAt: node.createdAt ?? null,
        updatedAt: node.updatedAt ?? null,
        deletedAt: node.deletedAt ?? null,
      },
      relationSummary: {
        edgeCount: relatedEdges.length,
        edges: relatedEdges.map((edge) => ({
          id: edge.id ?? `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          relationType: edge.relationType ?? null,
          weight: edge.weight,
          updatedAt: edge.updatedAt ?? null,
        })),
      },
    };
  }
}
