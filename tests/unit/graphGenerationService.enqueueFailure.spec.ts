jest.mock('../../src/shared/utils/retry', () => ({
  withRetry: async <T>(
    fn: (bail: (e: Error) => void, attempt: number) => Promise<T>
  ): Promise<T> => fn(() => undefined, 1),
}));

import { GraphGenerationService } from '../../src/core/services/GraphGenerationService';
import { UpstreamError } from '../../src/shared/errors/domain';

const makeService = () => {
  const userId = 'user_A';
  const chatService = {
    listConversations: jest.fn().mockResolvedValue({
      items: [{ id: 'conv_1', title: 'Conversation 1', messages: [] }],
      nextCursor: null,
    }),
  };
  const graphEmbeddingService = {
    saveStats: jest.fn().mockResolvedValue(undefined),
  };
  const noteService = {
    findNotesModifiedSince: jest.fn().mockResolvedValue([]),
  };
  const userFileService = {
    listAllActiveFiles: jest.fn().mockResolvedValue([]),
  };
  const userService = {
    getPreferredLanguage: jest.fn().mockResolvedValue('ko'),
  };
  const queuePort = {
    sendMessage: jest.fn().mockRejectedValue(new Error('SQS unavailable')),
  };
  const storagePort = {
    upload: jest.fn().mockResolvedValue(undefined),
  };
  const notificationService = {
    sendGraphGenerationRequested: jest.fn().mockResolvedValue(undefined),
    sendGraphGenerationRequestFailed: jest.fn().mockResolvedValue(undefined),
  };
  const creditService = {
    hold: jest.fn().mockResolvedValue(undefined),
    rollbackByTaskId: jest.fn().mockResolvedValue(undefined),
  };
  const macroGraphStore = {
    createMacroView: jest.fn().mockResolvedValue({ macroId: 'new_macro', userId }),
  };

  const service = new (GraphGenerationService as unknown as new (
    ...args: unknown[]
  ) => GraphGenerationService)(
    chatService,
    graphEmbeddingService,
    noteService,
    userFileService,
    userService,
    queuePort,
    storagePort,
    notificationService,
    creditService,
    undefined,
    macroGraphStore
  );

  return {
    service,
    userId,
    graphEmbeddingService,
    notificationService,
    creditService,
    macroGraphStore,
  };
};

describe('GraphGenerationService scoped enqueue failure', () => {
  it('marks newly created Macro View stats as FAILED and rolls back credit', async () => {
    const {
      service,
      userId,
      graphEmbeddingService,
      notificationService,
      creditService,
      macroGraphStore,
    } = makeService();

    await expect(
      service.requestGraphGenerationViaQueue(userId, {
        scopeFilter: { mode: 'auto', intent: 'test scoped enqueue failure' },
      })
    ).rejects.toBeInstanceOf(UpstreamError);

    const createdMacroId = macroGraphStore.createMacroView.mock.calls[0][1];
    expect(graphEmbeddingService.saveStats).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ userId, status: 'CREATING' }),
      { macroId: createdMacroId }
    );
    expect(graphEmbeddingService.saveStats).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ userId, status: 'FAILED' }),
      { macroId: createdMacroId }
    );
    expect(creditService.rollbackByTaskId).toHaveBeenCalledTimes(1);
    expect(notificationService.sendGraphGenerationRequestFailed).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^task_user_A_/),
      expect.stringContaining('SQS unavailable'),
      createdMacroId
    );
  });
});
