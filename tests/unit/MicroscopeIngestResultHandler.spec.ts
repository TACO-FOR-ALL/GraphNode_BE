import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { MicroscopeIngestResultHandler } from '../../src/workers/handlers/MicroscopeIngestResultHandler';
import { TaskType } from '../../src/shared/dtos/queue';

const mockLoadEnv = jest.fn(() => ({ MICROSCOPE_NEO4J_WRITE_ON_BE: true }));

jest.mock('../../src/config/env', () => ({
  loadEnv: () => mockLoadEnv(),
}));

describe('MicroscopeIngestResultHandler', () => {
  let handler: MicroscopeIngestResultHandler;
  let mockMicroscopeService: {
    resolveGroupIdForIngestResult: ReturnType<typeof jest.fn>;
    updateDocumentStatus: ReturnType<typeof jest.fn>;
  };
  let mockNeo4jPersistence: { persistIngestBundle: ReturnType<typeof jest.fn> };
  let mockContainer: {
    getMicroscopeManagementService: ReturnType<typeof jest.fn>;
    getMicroscopeNeo4jPersistenceService: ReturnType<typeof jest.fn>;
    getNotificationService: ReturnType<typeof jest.fn>;
    getAwsS3Adapter: ReturnType<typeof jest.fn>;
    getCreditService: ReturnType<typeof jest.fn>;
  };

  const taskId = 'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5';
  const completedMessage = {
    taskId,
    taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT as const,
    timestamp: '2026-01-01T00:00:00Z',
    payload: {
      status: 'COMPLETED' as const,
      source_id: 'src-1',
      chunks_count: 1,
      standardized_s3_key: 'results/microscope/user-12345/task/ingest_bundle.json',
    },
  };

  const ingestBundlePayload = {
    standardized_graphs: [{ nodes: [], edges: [] }],
    source_id: 'src-1',
    source_name: 'note.md',
    user_id: 'user-12345',
    group_id: 'ws-resolved',
    chunk_id_map: { '0': 'chunk-0' },
    chunks: [{ uuid: 'chunk-0', chunk_index: 0, text: 'text' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadEnv.mockReturnValue({ MICROSCOPE_NEO4J_WRITE_ON_BE: true });
    handler = new MicroscopeIngestResultHandler();
    mockMicroscopeService = {
      resolveGroupIdForIngestResult: jest.fn(async () => 'ws-resolved'),
      updateDocumentStatus: jest.fn(async () => ({
        _id: 'ws-resolved',
        name: 'ws',
        documents: [{ id: taskId, status: 'COMPLETED' }],
      })),
    };
    mockNeo4jPersistence = {
      persistIngestBundle: jest.fn(async () => ({
        chunks_written: 1,
        entities_written: 1,
        edges_written: 0,
        chunk_entity_links: 1,
      })),
    };
    mockContainer = {
      getMicroscopeManagementService: jest.fn(() => mockMicroscopeService),
      getMicroscopeNeo4jPersistenceService: jest.fn(() => mockNeo4jPersistence),
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

  it('group_id 가 없을 때 docId 로 workspace 를 resolve 한다', async () => {
    await handler.handle(
      {
        taskId,
        taskType: TaskType.MICROSCOPE_INGEST_FROM_NODE_RESULT,
        timestamp: '2026-01-01T00:00:00Z',
        payload: { status: 'COMPLETED', source_id: 'src-1', chunks_count: 2 },
      },
      mockContainer as never
    );

    expect(mockMicroscopeService.resolveGroupIdForIngestResult).toHaveBeenCalledWith(
      'user-12345',
      taskId,
      undefined
    );
    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
      'user-12345',
      'ws-resolved',
      taskId,
      'COMPLETED',
      'src-1',
      undefined,
      undefined
    );
  });

  it('ingest_bundle 다운로드 시 Neo4j persist 를 Mongo 보다 먼저 호출한다', async () => {
    const callOrder: string[] = [];
    mockNeo4jPersistence.persistIngestBundle.mockImplementation(async () => {
      callOrder.push('neo4j');
      return {
        chunks_written: 1,
        entities_written: 1,
        edges_written: 0,
        chunk_entity_links: 1,
      };
    });
    mockMicroscopeService.updateDocumentStatus.mockImplementation(async () => {
      callOrder.push('mongo');
      return {
        _id: 'ws-resolved',
        name: 'ws',
        documents: [{ id: taskId, status: 'COMPLETED' }],
      };
    });

    const downloadJson = jest.fn(async () => ingestBundlePayload);
    mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

    await handler.handle(completedMessage, mockContainer as never);

    expect(mockNeo4jPersistence.persistIngestBundle).toHaveBeenCalled();
    expect(callOrder).toEqual(['neo4j', 'mongo']);
  });

  it('MICROSCOPE_NEO4J_WRITE_ON_BE=false 이면 Neo4j persist 를 건너뛴다', async () => {
    mockLoadEnv.mockReturnValue({ MICROSCOPE_NEO4J_WRITE_ON_BE: false });
    const downloadJson = jest.fn(async () => ingestBundlePayload);
    mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

    await handler.handle(completedMessage, mockContainer as never);

    expect(mockNeo4jPersistence.persistIngestBundle).not.toHaveBeenCalled();
    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalled();
  });

  it('레거시 배열 JSON 은 Mongo 만 갱신하고 Neo4j persist 는 하지 않는다', async () => {
    const downloadJson = jest.fn(async () => [{ nodes: [], edges: [] }]);
    mockContainer.getAwsS3Adapter = jest.fn(() => ({ downloadJson }));

    await handler.handle(completedMessage, mockContainer as never);

    expect(mockNeo4jPersistence.persistIngestBundle).not.toHaveBeenCalled();
    expect(mockMicroscopeService.updateDocumentStatus).toHaveBeenCalledWith(
      'user-12345',
      'ws-resolved',
      taskId,
      'COMPLETED',
      'src-1',
      [{ nodes: [], edges: [] }],
      undefined
    );
  });
});
