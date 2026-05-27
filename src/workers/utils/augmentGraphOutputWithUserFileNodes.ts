import type { AiGraphOutputDto, AiGraphNodeOutput } from '../../shared/dtos/ai_graph_output';
import type { UserFileDoc } from '../../core/types/persistence/userFile.persistence';

/**
 * @description Macro bundle에 포함됐으나 AI 그래프 출력에 없는 활성 user_files 노드를 보강합니다.
 * @param graph AI macro graph JSON.
 * @param activeUserFiles 사용자 활성 파일 목록.
 * @returns 누락 파일 노드가 추가된 graph JSON.
 */
export function augmentGraphOutputWithUserFileNodes(
  graph: AiGraphOutputDto,
  activeUserFiles: UserFileDoc[]
): AiGraphOutputDto {
  const presentOrigIds = new Set(graph.nodes.map((node) => node.orig_id));
  const missingFiles = activeUserFiles.filter((file) => !presentOrigIds.has(file._id));
  if (missingFiles.length === 0) {
    return graph;
  }

  const anchorNode = graph.nodes[0];
  const defaultClusterId = anchorNode?.cluster_id ?? 'cluster_files';
  const defaultClusterName = anchorNode?.cluster_name ?? 'User Files';
  const maxNodeId = graph.nodes.reduce((max, node) => Math.max(max, node.id), -1);
  let nextNodeId = maxNodeId + 1;
  const timestamp = new Date().toISOString();

  const backfilledNodes: AiGraphNodeOutput[] = missingFiles.map((file) => {
    const node: AiGraphNodeOutput = {
      id: nextNodeId,
      orig_id: file._id,
      cluster_id: defaultClusterId,
      cluster_name: defaultClusterName,
      keywords: [],
      top_keywords: [],
      timestamp,
      num_sections: 1,
      source_type: 'file',
      metadata: {},
    };
    nextNodeId += 1;
    return node;
  });

  return {
    ...graph,
    nodes: [...graph.nodes, ...backfilledNodes],
    metadata: {
      ...graph.metadata,
      total_nodes: graph.nodes.length + backfilledNodes.length,
    },
  };
}
