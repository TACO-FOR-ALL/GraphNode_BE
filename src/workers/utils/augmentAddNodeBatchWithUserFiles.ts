import type { AiAddNodeBatchRequest } from '../../shared/dtos/ai_input';
import type {
  AiAddNodeBatchResult,
  AiAddNodeResultItem,
} from '../../shared/dtos/ai_graph_output';
import { normalizeAiOrigId } from '../../shared/utils/aiNodeId';

const DEFAULT_FILE_CLUSTER_ID = 'cluster_user_files';
const DEFAULT_FILE_CLUSTER_NAME = 'User Files';

/**
 * @description AddNode 배치 결과에 AI가 누락한 user_files 항목을 synthetic result로 보강합니다.
 * @param batch AI AddNode 배치 결과입니다.
 * @param batchRequest S3에 업로드된 AddNode 입력(batch.json)입니다.
 * @returns 보강된 배치 결과입니다.
 */
export function augmentAddNodeBatchWithUserFiles(
  batch: AiAddNodeBatchResult,
  batchRequest: Pick<AiAddNodeBatchRequest, 'userId' | 'files' | 'existingClusters'>
): AiAddNodeBatchResult {
  const requested = batchRequest.files ?? [];
  if (requested.length === 0) {
    return batch;
  }

  const coveredOrigIds = new Set<string>();
  for (const item of batch.results ?? []) {
    for (const node of item.nodes ?? []) {
      coveredOrigIds.add(normalizeAiOrigId(node.origId).normalizedOrigId);
    }
    if (item.noteId) coveredOrigIds.add(item.noteId);
    if (item.conversationId) coveredOrigIds.add(item.conversationId);
    if (item.fileId) coveredOrigIds.add(item.fileId);
  }

  const missing = requested.filter((f) => !coveredOrigIds.has(f.fileId));
  if (missing.length === 0) {
    return batch;
  }

  const firstExisting = batchRequest.existingClusters?.[0];
  const clusterId =
    firstExisting?.id ??
    batch.results?.[0]?.assignedCluster?.clusterId ??
    DEFAULT_FILE_CLUSTER_ID;
  const clusterName =
    firstExisting?.name ??
    batch.results?.[0]?.assignedCluster?.name ??
    batch.results?.[0]?.nodes?.[0]?.clusterName ??
    DEFAULT_FILE_CLUSTER_NAME;

  const syntheticItems: AiAddNodeResultItem[] = missing.map((file) => ({
    fileId: file.fileId,
    nodes: [
      {
        id: `${batchRequest.userId}_${file.fileId}`,
        userId: batchRequest.userId,
        origId: file.fileId,
        clusterId,
        clusterName,
        numSections: 1,
        timestamp: null,
        createdAt: null,
        updatedAt: null,
      },
    ],
    edges: [],
    assignedCluster: {
      clusterId,
      isNewCluster: false,
      confidence: 1,
      reasoning: 'BE backfill for user_files missing from AI AddNode output',
      name: clusterName,
      themes: [],
    },
  }));

  return {
    ...batch,
    results: [...(batch.results ?? []), ...syntheticItems],
    processedCount: (batch.processedCount ?? 0) + syntheticItems.length,
  };
}
