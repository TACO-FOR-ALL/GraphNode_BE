import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import { AddNodeResultHandler } from '../../src/workers/handlers/AddNodeResultHandler';
import type { AddNodeResultPayload } from '../../src/shared/dtos/queue';
import type { AiAddNodeBatchResult } from '../../src/shared/dtos/ai_graph_output';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/workers/utils/augmentAddNodeBatchWithUserFiles', () => ({
  augmentAddNodeBatchWithUserFiles: jest.fn((batch: unknown) => batch),
}));

jest.mock('../../src/workers/utils/sourceTypeResolver', () => ({
  resolveSourceTypesByOrigIds: jest.fn(async () => ({
    sourceTypesByOrigId: new Map<string, 'chat' | 'markdown' | 'file'>([['uf-1', 'file']]),
    userFileHintsByOrigId: new Map<string, { mimeType?: string; macroFileType?: string }>([
      ['uf-1', { mimeType: 'application/pdf', macroFileType: 'pdf' }],
    ]),
    unresolvedOrigIds: [],
  })),
}));

describe('AddNodeResultHandler', () => {
  const userId = 'user-1';
  const taskId = 'task_add_node_user-1_01TEST';
  const resultS3Key = `add-node/${taskId}/result.json`;

  let handler: AddNodeResultHandler;
  let mockContainer: any;
  let storagePort: any;
  let graphService: any;

  beforeEach(() => {
    handler = new AddNodeResultHandler();

    storagePort = {
      downloadJson: jest.fn(),
    };
    graphService = {
      getStats: jest.fn(async () => ({ userId, status: 'CREATED' })),
      saveStats: jest.fn(async () => undefined),
      listNodesAll: jest.fn(async () => []),
      upsertNode: jest.fn(async () => undefined),
      upsertEdge: jest.fn(async () => 'ok'),
      upsertNodes: jest.fn(async () => undefined),
      upsertEdges: jest.fn(async () => undefined),
      upsertClusters: jest.fn(async () => undefined),
      upsertCluster: jest.fn(async () => undefined),
      removeEmptyClusters: jest.fn(async () => undefined),
      pruneIncompatibleSubclusterMemberships: jest.fn(async () => ({
        containsDeleted: 0,
        representsDeleted: 0,
      })),
      reconcileSubclusterMemberships: jest.fn(async () => ({
        deletedSubclusters: 0,
        reassignedRepresentatives: 0,
        removedInvalidRepresents: 0,
      })),
    };

    mockContainer = {
      getAwsS3Adapter: jest.fn(() => storagePort),
      getGraphEmbeddingService: jest.fn(() => graphService),
      getNotificationService: jest.fn(() => ({
        sendAddConversationFailed: jest.fn(async () => undefined),
        sendAddConversationCompleted: jest.fn(async () => undefined),
        sendFcmPushNotification: jest.fn(async () => undefined),
      })),
      getConversationService: jest.fn(() => ({ findDocById: jest.fn(async () => null) })),
      getNoteService: jest.fn(() => ({ getNoteDoc: jest.fn(async () => null) })),
      getUserFileService: jest.fn(() => ({ getActiveUserFileById: jest.fn(async () => ({ _id: 'uf-1' })) })),
      getCreditService: jest.fn(() => ({
        commitByTaskId: jest.fn(async () => undefined),
        rollbackByTaskId: jest.fn(async () => undefined),
      })),
    };
  });

  it('downloads add-node batch.json and augments AI result when batch input exists', async () => {
    const batchResult: AiAddNodeBatchResult = {
      userId,
      processedCount: 1,
      results: [
        {
          fileId: 'uf-1',
          nodes: [
            {
              id: 'tmp-1',
              userId,
              origId: 'uf-1',
              clusterId: 'c1',
              clusterName: 'C1',
              numSections: 1,
            } as any,
          ],
          edges: [],
        } as any,
      ],
    };

    storagePort.downloadJson.mockImplementation(async (key: string) => {
      if (key === resultS3Key) return batchResult;
      if (key === `add-node/${taskId}/batch.json`)
        return { userId, existingClusters: [], files: [{ fileId: 'uf-1', title: 'a.pdf', s3Key: 'x', mimeType: 'application/pdf' }] };
      throw new Error(`unexpected key: ${key}`);
    });

    const message: AddNodeResultPayload = {
      taskId,
      taskType: 'ADD_NODE_RESULT' as any,
      timestamp: new Date().toISOString(),
      payload: { userId, status: 'COMPLETED', resultS3Key },
    };

    await handler.handle(message, mockContainer);

    expect(storagePort.downloadJson).toHaveBeenCalledWith(resultS3Key);
    expect(storagePort.downloadJson).toHaveBeenCalledWith(`add-node/${taskId}/batch.json`);
    expect(graphService.saveStats).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'UPDATED', updatedAt: expect.any(String) })
    );
  });

  it('continues when batch.json is missing (legacy AI result only)', async () => {
    const batchResult: AiAddNodeBatchResult = {
      userId,
      processedCount: 1,
      results: [
        {
          fileId: 'uf-1',
          nodes: [
            {
              id: 'tmp-1',
              userId,
              origId: 'uf-1',
              clusterId: 'c1',
              clusterName: 'C1',
              numSections: 1,
            } as any,
          ],
          edges: [],
        } as any,
      ],
    };

    storagePort.downloadJson.mockImplementation(async (key: string) => {
      if (key === resultS3Key) return batchResult;
      if (key === `add-node/${taskId}/batch.json`) throw new Error('NoSuchKey');
      throw new Error(`unexpected key: ${key}`);
    });

    const message: AddNodeResultPayload = {
      taskId,
      taskType: 'ADD_NODE_RESULT' as any,
      timestamp: new Date().toISOString(),
      payload: { userId, status: 'COMPLETED', resultS3Key },
    };

    await handler.handle(message, mockContainer);

    expect(storagePort.downloadJson).toHaveBeenCalledWith(`add-node/${taskId}/batch.json`);
    expect(graphService.upsertNodes).toHaveBeenCalled();
  });
});

