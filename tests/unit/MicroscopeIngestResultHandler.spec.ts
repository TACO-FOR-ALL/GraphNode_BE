import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MicroscopeIngestResultHandler } from '../../src/workers/handlers/MicroscopeIngestResultHandler';
import { TaskType } from '../../src/shared/dtos/queue';

const BASE_LEGACY_DOC_ID = 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5';
const BASE_BLOCK_DOC_ID = 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5';
const BLOCK_TASK_ID = `${BASE_BLOCK_DOC_ID}_block`;
const NONBLOCK_TASK_ID = `${BASE_BLOCK_DOC_ID}_nonblock`;

describe('MicroscopeIngestResultHandler', () => {
  let handler: MicroscopeIngestResultHandler;
  let mockMicroscopeService: {
    resolveGroupIdForIngestResult: ReturnType<typeof jest.fn>;
    updateDocumentStatus: ReturnType<typeof jest.fn>;
    updateBlockViewDocumentStatus: ReturnType<typeof jest.fn>;
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
          { id: BASE_LEGACY_DOC_ID, status: 'COMPLETED' },
        ],
      })),
      updateBlockViewDocumentStatus: jest.fn(async () => ({
        _id: 'ws-resolved',
        name: 'ws',
        documents: [
          { id: BASE_BLOCK_DOC_ID, status: 'PROCESSING' },
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
      }),
      false
    );
  });

  it('resolves workspace id via docId when group_id is omitted in AI payload', async () => {
    await handler.handle(
      {
        taskId: BASE_LEGACY_DOC_ID,
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
      BASE_LEGACY_DOC_ID,
      undefined
    );
    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
      'user-12345',
      'ws-resolved',
      BASE_LEGACY_DOC_ID,
      'COMPLETED',
      'src-1',
      undefined,
      undefined,
      undefined,
      false
    );
  });

  describe('Dual SQS — _block mode fallback', () => {
    it('fallback: downloads from standardized_s3_key when block_graph_s3_key is absent', async () => {
      const downloadJson = jest.fn(async () => ({ blocks: [{ block_id: 'b1' }] }));
      mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

      await handler.handle(
        {
          taskId: BLOCK_TASK_ID,
          taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
          timestamp: '2026-01-01T00:00:00Z',
          payload: {
            user_id: 'user-12345',
            status: 'COMPLETED',
            source_id: 'src-block',
            // AI 워커가 block_graph_s3_key 대신 standardized_s3_key에 경로를 담아 전송
            standardized_s3_key: 'results/microscope/fallback_block.json',
          },
        },
        mockContainer as never
      );

      expect(downloadJson).toHaveBeenCalledWith(
        'results/microscope/fallback_block.json',
        expect.objectContaining({ bucketType: 'payload' })
      );
      expect(mockMicroscopeService.updateBlockViewDocumentStatus).toHaveBeenCalledWith(
        'user-12345',
        'ws-resolved',
        BASE_BLOCK_DOC_ID,
        'COMPLETED',
        expect.anything(),
        undefined,
        expect.objectContaining({ standardizedS3Key: 'results/microscope/fallback_block.json' })
      );
    });

    it('normal path: downloads from block_graph_s3_key when both keys are present', async () => {
      const downloadJson = jest.fn(async () => ({ blocks: [] }));
      mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

      await handler.handle(
        {
          taskId: BLOCK_TASK_ID,
          taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
          timestamp: '2026-01-01T00:00:00Z',
          payload: {
            user_id: 'user-12345',
            status: 'COMPLETED',
            source_id: 'src-block',
            block_graph_s3_key: 'results/microscope/block_graph.json',
            standardized_s3_key: 'results/microscope/std.json',
          },
        },
        mockContainer as never
      );

      // block_graph_s3_key가 우선
      expect(downloadJson).toHaveBeenCalledWith(
        'results/microscope/block_graph.json',
        expect.objectContaining({ bucketType: 'payload' })
      );
    });

    it('no crash and no download when both S3 keys are absent in block mode', async () => {
      const downloadJson = jest.fn();
      mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

      await expect(
        handler.handle(
          {
            taskId: BLOCK_TASK_ID,
            taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
            timestamp: '2026-01-01T00:00:00Z',
            payload: {
              user_id: 'user-12345',
              status: 'COMPLETED',
              source_id: 'src-block',
              // S3 키 완전 누락
            },
          },
          mockContainer as never
        )
      ).resolves.not.toThrow();

      expect(downloadJson).not.toHaveBeenCalled();
      expect(mockMicroscopeService.updateBlockViewDocumentStatus).toHaveBeenCalledWith(
        'user-12345',
        'ws-resolved',
        BASE_BLOCK_DOC_ID,
        'COMPLETED',
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('Dual SQS — _nonblock mode fallback', () => {
    it('fallback: downloads from block_graph_s3_key when standardized_s3_key is absent', async () => {
      const downloadJson = jest.fn(async () => [{ nodes: [], edges: [] }]);
      mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

      await handler.handle(
        {
          taskId: NONBLOCK_TASK_ID,
          taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
          timestamp: '2026-01-01T00:00:00Z',
          payload: {
            user_id: 'user-12345',
            status: 'COMPLETED',
            source_id: 'src-nonblock',
            // AI 워커가 standardized_s3_key 대신 block_graph_s3_key에 경로를 담아 전송
            block_graph_s3_key: 'results/microscope/fallback_std.json',
          },
        },
        mockContainer as never
      );

      expect(downloadJson).toHaveBeenCalledWith(
        'results/microscope/fallback_std.json',
        expect.objectContaining({ bucketType: 'payload' })
      );
      expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
        'user-12345',
        'ws-resolved',
        BASE_BLOCK_DOC_ID,
        'COMPLETED',
        'src-nonblock',
        expect.anything(),
        undefined,
        expect.objectContaining({ blockGraphS3Key: 'results/microscope/fallback_std.json' }),
        true
      );
    });
  });
});
