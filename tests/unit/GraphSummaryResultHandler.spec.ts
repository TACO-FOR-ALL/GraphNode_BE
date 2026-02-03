import { GraphSummaryResultHandler } from '../../../src/workers/handlers/GraphSummaryResultHandler';
import { TaskType, GraphSummaryResultPayload } from '../../../src/shared/dtos/queue';

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

    const summaryData = { overview: { summary_text: 'test' } };
    mockStoragePort.downloadJson.mockResolvedValue(summaryData);
    mockGraphService.upsertGraphSummary.mockResolvedValue(undefined);

    await handler.handle(message, mockContainer);

    expect(mockContainer.getAwsS3Adapter).toHaveBeenCalled();
    expect(mockStoragePort.downloadJson).toHaveBeenCalledWith('key/summary.json');
    expect(mockGraphService.upsertGraphSummary).toHaveBeenCalledWith('user_1', summaryData);
    expect(mockNotiService.sendNotification).toHaveBeenCalledWith('user_1', 'GRAPH_SUMMARY_COMPLETED', expect.any(Object));
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
    expect(mockNotiService.sendNotification).toHaveBeenCalledWith('user_1', 'GRAPH_SUMMARY_FAILED', expect.any(Object));
  });
});
