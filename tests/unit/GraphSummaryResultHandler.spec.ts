import { GraphSummaryResultHandler } from '../../src/workers/handlers/GraphSummaryResultHandler';
import { TaskType, GraphSummaryResultPayload } from '../../src/shared/dtos/queue';

describe('GraphSummaryResultHandler', () => {
  let handler: GraphSummaryResultHandler;
  let mockContainer: any;
  let mockStoragePort: any;
  let mockGraphService: any;
  let mockNotiService: any;

  beforeEach(() => {
    handler = new GraphSummaryResultHandler();

    mockStoragePort = {
      downloadJson: jest.fn(),
    };
    mockGraphService = {
      upsertGraphSummary: jest.fn(),
    };
    mockNotiService = {
      sendNotification: jest.fn(),
      sendFcmPushNotification: jest.fn(),
    };

    mockContainer = {
      getAwsS3Adapter: jest.fn().mockReturnValue(mockStoragePort),
      getGraphEmbeddingService: jest.fn().mockReturnValue(mockGraphService),
      getNotificationService: jest.fn().mockReturnValue(mockNotiService),
    };
  });

  it('should handle COMPLETED status correctly', async () => {
    const message: GraphSummaryResultPayload = {
      taskId: 'task_1',
      taskType: TaskType.GRAPH_SUMMARY_RESULT,
      timestamp: '2023-01-01T00:00:00Z',
      payload: {
        userId: 'user_1',
        status: 'COMPLETED',
        summaryS3Key: 'key/summary.json',
      },
    };

    const summaryData = { overview: { summary_text: 'test' }, generated_at: '2023-01-02T00:00:00Z' };
    mockStoragePort.downloadJson.mockResolvedValue(summaryData);
    mockGraphService.upsertGraphSummary.mockResolvedValue(undefined);

    await handler.handle(message, mockContainer);

    expect(mockContainer.getAwsS3Adapter).toHaveBeenCalled();
    expect(mockStoragePort.downloadJson).toHaveBeenCalledWith('key/summary.json');
    expect(mockGraphService.upsertGraphSummary).toHaveBeenCalledWith('user_1', expect.objectContaining({
      overview: { summary_text: 'test' },
      generatedAt: '2023-01-02T00:00:00Z'
    }));
    expect(mockNotiService.sendFcmPushNotification).toHaveBeenCalledWith('user_1', 'Graph Ready', 'Your graph is ready', expect.objectContaining({ taskId: 'task_1', status: 'COMPLETED' }));
  });

  it('should handle FAILED status correctly', async () => {
    const message: GraphSummaryResultPayload = {
      taskId: 'task_1',
      taskType: TaskType.GRAPH_SUMMARY_RESULT,
      timestamp: '2023-01-01T00:00:00Z',
      payload: {
        userId: 'user_1',
        status: 'FAILED',
        error: 'Something went wrong',
      },
    };

    await handler.handle(message, mockContainer);

    expect(mockGraphService.upsertGraphSummary).not.toHaveBeenCalled();
    expect(mockNotiService.sendFcmPushNotification).toHaveBeenCalledWith('user_1', 'Graph Generation Failed', expect.stringContaining('Something went wrong'), expect.objectContaining({ taskId: 'task_1', status: 'FAILED' }));
  });
});
