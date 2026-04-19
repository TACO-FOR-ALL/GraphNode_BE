import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import type { Container } from '../../src/bootstrap/container';
import { GraphGenerationProgressHandler } from '../../src/workers/handlers/GraphGenerationProgressHandler';
import { TaskType, type GraphProgressPayload } from '../../src/shared/dtos/queue';

describe('GraphGenerationProgressHandler', () => {
  let handler: GraphGenerationProgressHandler;
  let mockNotificationService: { sendGraphGenerationProgressUpdated: jest.Mock };
  let mockContainer: Container;

  beforeEach(() => {
    handler = new GraphGenerationProgressHandler();

    mockNotificationService = {
      sendGraphGenerationProgressUpdated: jest.fn(),
    };

    mockContainer = {
      getNotificationService: jest.fn().mockReturnValue(mockNotificationService),
    } as unknown as Container;
  });

  it('SQS 진행률 메시지를 NotificationService로 전달해야 한다', async () => {
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS,
      timestamp: '2026-04-18T07:47:46.067554Z',
      payload: {
        userId: 'user_123',
        currentStage: '[1단계] 임베딩 생성 중',
        progressPercent: 30,
        etaSeconds: 12,
      },
    };

    await handler.handle(message, mockContainer);

    expect(mockNotificationService.sendGraphGenerationProgressUpdated).toHaveBeenCalledWith({
      userId: 'user_123',
      taskId: 'task_001',
      sourceTimestamp: '2026-04-18T07:47:46.067554Z',
      currentStage: '[1단계] 임베딩 생성 중',
      progressPercent: 30,
      etaSeconds: 12,
    });
  });

  it('progressPercent 범위를 0~100 정수로 보정해야 한다', async () => {
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS,
      timestamp: '2026-04-18T07:47:46.067554Z',
      payload: {
        userId: 'user_123',
        currentStage: '[5단계] 그래프 보정 완료',
        progressPercent: 100.9,
        etaSeconds: null,
      },
    };

    await handler.handle(message, mockContainer);

    expect(mockNotificationService.sendGraphGenerationProgressUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        progressPercent: 100,
        etaSeconds: null,
      })
    );
  });

  it('currentStage가 비어 있으면 알림을 보내지 않아야 한다', async () => {
    const message: GraphProgressPayload = {
      taskId: 'task_001',
      taskType: TaskType.GRAPH_GENERATION_PROGRESS,
      timestamp: '2026-04-18T07:47:46.067554Z',
      payload: {
        userId: 'user_123',
        currentStage: '   ',
        progressPercent: 30,
        etaSeconds: null,
      },
    };

    await handler.handle(message, mockContainer);

    expect(mockNotificationService.sendGraphGenerationProgressUpdated).not.toHaveBeenCalled();
  });
});
