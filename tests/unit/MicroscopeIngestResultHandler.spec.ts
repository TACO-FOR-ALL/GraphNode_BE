import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MicroscopeIngestResultHandler } from '../../src/workers/handlers/MicroscopeIngestResultHandler';
import { TaskType } from '../../src/shared/dtos/queue';

describe('MicroscopeIngestResultHandler', () => {
  let handler: MicroscopeIngestResultHandler;
  let mockMicroscopeService: {
    resolveGroupIdForIngestResult: ReturnType<typeof jest.fn>;
    updateDocumentStatus: ReturnType<typeof jest.fn>;
  };
  let mockContainer: {
    getMicroscopeManagementService: ReturnType<typeof jest.fn>;
    getNotificationService: ReturnType<typeof jest.fn>;
    getAwsS3Adapter: ReturnType<typeof jest.fn>;
    getCreditService: ReturnType<typeof jest.fn>;
  };

  beforeEach(() => {
    handler = new MicroscopeIngestResultHandler();
    mockMicroscopeService = {
      resolveGroupIdForIngestResult: jest.fn(async () => 'ws-resolved'),
      updateDocumentStatus: jest.fn(async () => ({
        _id: 'ws-resolved',
        name: 'ws',
        documents: [
          { id: 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5', status: 'COMPLETED' },
        ],
      })),
    };
    mockContainer = {
      getMicroscopeManagementService: jest.fn(() => mockMicroscopeService),
      getNotificationService: jest.fn(() => ({
        sendMicroscopeDocumentCompleted: jest.fn(),
        sendMicroscopeDocumentFailed: jest.fn(),
        sendMicroscopeWorkspaceCompleted: jest.fn(),
        sendFcmPushNotification: jest.fn(),
      })),
      getAwsS3Adapter: jest.fn(() => ({ downloadJson: jest.fn() })),
      getCreditService: jest.fn(() => ({
        commitByTaskId: jest.fn(),
        rollbackByTaskId: jest.fn(),
      })),
    };
  });

  it('downloads graph JSON from block_graph_s3_key when standardized_s3_key is absent', async () => {
    const downloadJson = jest.fn(async () => [{ nodes: [], edges: [] }]);
    mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

    await handler.handle(
      {
        taskId: 'task_microscope_file_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5',
        taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
        timestamp: '2026-01-01T00:00:00Z',
        payload: {
          status: 'COMPLETED',
          source_id: 'src-1',
          block_graph_s3_key: 'results/microscope/block_graph.json',
        },
      },
      mockContainer as never
    );

    expect(downloadJson).toHaveBeenCalledWith(
      'results/microscope/block_graph.json',
      expect.objectContaining({ bucketType: 'payload' })
    );

    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
      'user-12345',
      'ws-resolved',
      'task_microscope_file_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5',
      'COMPLETED',
      'src-1',
      expect.anything(),
      undefined,
      expect.objectContaining({
        outputMode: 'block',
        visualizationS3Key: 'results/microscope/block_graph.json',
        blockGraphS3Key: 'results/microscope/block_graph.json',
      })
    );
  });

  it('resolves workspace id via docId when group_id is omitted in AI payload', async () => {
    await handler.handle(
      {
        taskId: 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5',
        taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
        timestamp: '2026-01-01T00:00:00Z',
        payload: {
          status: 'COMPLETED',
          source_id: 'src-1',
          chunks_count: 2,
        },
      },
      mockContainer as never
    );

    expect(mockMicroscopeService.resolveGroupIdForIngestResult).toHaveBeenCalledWith(
      'user-12345',
      'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5',
      undefined
    );
    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
      'user-12345',
      'ws-resolved',
      'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5',
      'COMPLETED',
      'src-1',
      undefined,
      undefined,
      undefined
    );
  });
});
