import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { GraphGenerationProgressResultHandler } from '../../src/workers/handlers/GraphGenerationProgressResultHandler';
import { TaskType, type GraphProgressPayload } from '../../src/shared/dtos/queue';

describe('GraphGenerationProgressResultHandler', () => {
  let handler: GraphGenerationProgressResultHandler;
  let mockNotificationService: any;
  let mockContainer: any;

  beforeEach(() => {
    handler = new GraphGenerationProgressResultHandler();

    mockNotificationService = {
      sendGraphGenerationProgressUpdated: jest.fn(),
    };

    mockContainer = {
      getNotificationService: jest.fn().mockReturnValue(mockNotificationService),
    };
  });

  it('AI progress payload를 받아 FE 알림 메서드로 전달해야 한다', async () => {
    // Arrange: AI가 result queue에 넣는 진행률 메시지 형태를 그대로 구성한다.
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS_RESULT,
      timestamp: '2026-04-14T15:00:20Z',
      payload: {
        userId: 'user_123',
        completedStage: 'keywords_extracted',
        progressPercent: 30,
      },
    };

    // Act
    await handler.handle(message, mockContainer);

    // Assert: Worker는 payload를 변형 없이 NotificationService에 전달한다.
    expect(mockNotificationService.sendGraphGenerationProgressUpdated).toHaveBeenCalledWith(
      'user_123',
      'task_001',
      'keywords_extracted',
      30
    );
  });

  it('progressPercent가 소수/범위 초과면 0~100 정수로 보정해야 한다', async () => {
    // Arrange: 100 초과 + 소수 입력
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS_RESULT,
      timestamp: '2026-04-14T15:00:20Z',
      payload: {
        userId: 'user_123',
        completedStage: 'edges_reviewed',
        progressPercent: 120.9,
      },
    };

    // Act
    await handler.handle(message, mockContainer);

    // Assert: Math.floor 후 100으로 clamp
    expect(mockNotificationService.sendGraphGenerationProgressUpdated).toHaveBeenCalledWith(
      'user_123',
      'task_001',
      'edges_reviewed',
      100
    );
  });

  it('필수 필드가 없으면 알림 발행을 건너뛰어야 한다', async () => {
    // Arrange: completedStage 누락(빈 문자열)
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS_RESULT,
      timestamp: '2026-04-14T15:00:20Z',
      payload: {
        userId: 'user_123',
        completedStage: '',
        progressPercent: 30,
      },
    };

    // Act
    await handler.handle(message, mockContainer);

    // Assert: 잘못된 메시지는 FE로 전달하지 않는다.
    expect(mockNotificationService.sendGraphGenerationProgressUpdated).not.toHaveBeenCalled();
  });
});
