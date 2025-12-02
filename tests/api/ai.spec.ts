
import request from 'supertest';
import express from 'express';

import { createAiRouter } from '../../src/app/routes/ai';
import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import { AIChatService } from '../../src/core/services/AIChatService';
import { errorHandler } from '../../src/app/middlewares/error';
import { getUserIdFromRequest } from '../../src/app/utils/request';

// Mock dependencies
jest.mock('../../src/core/services/ConversationService');
jest.mock('../../src/core/services/MessageService');
jest.mock('../../src/core/services/AIChatService');
jest.mock('../../src/app/utils/request');
jest.mock('../../src/app/middlewares/session', () => ({
  bindSessionUser: (req: any, res: any, next: any) => next(),
}));
jest.mock('../../src/app/middlewares/auth', () => ({
  requireLogin: (req: any, res: any, next: any) => next(),
}));

describe('AiController', () => {
  let app: express.Application;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockMessageService: jest.Mocked<MessageService>;
  let mockAIChatService: jest.Mocked<AIChatService>;
  const mockGetUserId = getUserIdFromRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConversationService = new ConversationService(null as any, null as any) as any;
    mockMessageService = new MessageService(null as any, null as any) as any;
    mockAIChatService = new AIChatService(null as any, null as any) as any;

    const router = createAiRouter({
      conversationService: mockConversationService,
      messageService: mockMessageService,
      aiChatService: mockAIChatService,
    });

    app = express();
    app.use(express.json());
    app.use('/v1/ai', router);
    app.use(errorHandler);

    mockGetUserId.mockReturnValue('user-123');
  });

  describe('POST /v1/ai/conversations', () => {
    it('should create a conversation and return 201', async () => {
      const newThread = { id: 'thread-1', title: 'New Chat', messages: [] };
      mockConversationService.create.mockResolvedValue(newThread as any);

      const res = await request(app)
        .post('/v1/ai/conversations')
        .send({ title: 'New Chat' });

      expect(res.status).toBe(201);
      expect(res.header.location).toBe('/v1/ai/conversations/thread-1');
      expect(res.body).toEqual(newThread);
      expect(mockConversationService.create).toHaveBeenCalledWith('user-123', undefined, 'New Chat', undefined);
    });

    it('should return 400 for invalid body', async () => {
      const res = await request(app)
        .post('/v1/ai/conversations')
        .send({ title: '' }); // Empty title

      expect(res.status).toBe(400);
      expect(res.body.type).toContain('validation-failed');
    });
  });

  describe('POST /v1/ai/conversations/bulk', () => {
    it('should bulk create conversations and return 201', async () => {
      const conversations = [{ title: 'Chat 1' }, { title: 'Chat 2' }];
      const created = [{ id: '1', title: 'Chat 1' }, { id: '2', title: 'Chat 2' }];
      mockConversationService.bulkCreate.mockResolvedValue(created as any);

      const res = await request(app)
        .post('/v1/ai/conversations/bulk')
        .send({ conversations });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ conversations: created });
      expect(mockConversationService.bulkCreate).toHaveBeenCalledWith('user-123', conversations);
    });
  });

  describe('GET /v1/ai/conversations', () => {
    it('should list conversations and return 200', async () => {
      const result = { items: [], nextCursor: null };
      mockConversationService.listByOwner.mockResolvedValue(result);

      const res = await request(app).get('/v1/ai/conversations?limit=10&cursor=abc');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(result);
      expect(mockConversationService.listByOwner).toHaveBeenCalledWith('user-123', 10, 'abc');
    });
  });

  describe('GET /v1/ai/conversations/:conversationId', () => {
    it('should get a conversation and return 200', async () => {
      const thread = { id: 'thread-1', title: 'Chat' };
      mockConversationService.getById.mockResolvedValue(thread as any);

      const res = await request(app).get('/v1/ai/conversations/thread-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(thread);
      expect(mockConversationService.getById).toHaveBeenCalledWith('thread-1', 'user-123');
    });
  });

  describe('PATCH /v1/ai/conversations/:conversationId', () => {
    it('should update a conversation and return 200', async () => {
      const updated = { id: 'thread-1', title: 'Updated' };
      mockConversationService.update.mockResolvedValue(updated as any);

      const res = await request(app)
        .patch('/v1/ai/conversations/thread-1')
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updated);
      expect(mockConversationService.update).toHaveBeenCalledWith('thread-1', 'user-123', { title: 'Updated' });
    });
  });

  describe('DELETE /v1/ai/conversations/:conversationId', () => {
    it('should delete a conversation and return 204', async () => {
      mockConversationService.delete.mockResolvedValue(true);

      const res = await request(app).delete('/v1/ai/conversations/thread-1?permanent=true');

      expect(res.status).toBe(204);
      expect(mockConversationService.delete).toHaveBeenCalledWith('thread-1', 'user-123', true);
    });
  });

  describe('POST /v1/ai/conversations/:conversationId/restore', () => {
    it('should restore a conversation and return 204', async () => {
      mockConversationService.restore.mockResolvedValue(true);

      const res = await request(app).post('/v1/ai/conversations/thread-1/restore');

      expect(res.status).toBe(204);
      expect(mockConversationService.restore).toHaveBeenCalledWith('thread-1', 'user-123');
    });
  });

  describe('POST /v1/ai/conversations/:conversationId/messages', () => {
    it('should create a message and return 201', async () => {
      const msgData = { role: 'user', content: 'Hello' };
      const newMsg = { id: 'msg-1', ...msgData };
      mockMessageService.create.mockResolvedValue(newMsg as any);

      const res = await request(app)
        .post('/v1/ai/conversations/thread-1/messages')
        .send(msgData);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(newMsg);
      expect(mockMessageService.create).toHaveBeenCalledWith('user-123', 'thread-1', msgData);
    });
  });

  describe('PATCH /v1/ai/conversations/:conversationId/messages/:messageId', () => {
    it('should update a message and return 200', async () => {
      const updates = { content: 'Updated' };
      const updatedMsg = { id: 'msg-1', ...updates };
      mockMessageService.update.mockResolvedValue(updatedMsg as any);

      const res = await request(app)
        .patch('/v1/ai/conversations/thread-1/messages/msg-1')
        .send(updates);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedMsg);
      expect(mockMessageService.update).toHaveBeenCalledWith('user-123', 'thread-1', 'msg-1', updates);
    });
  });

  describe('DELETE /v1/ai/conversations/:conversationId/messages/:messageId', () => {
    it('should delete a message and return 204', async () => {
      mockMessageService.delete.mockResolvedValue(true);

      const res = await request(app).delete('/v1/ai/conversations/thread-1/messages/msg-1?permanent=true');

      expect(res.status).toBe(204);
      expect(mockMessageService.delete).toHaveBeenCalledWith('user-123', 'thread-1', 'msg-1', true);
    });
  });

  describe('POST /v1/ai/conversations/:conversationId/messages/:messageId/restore', () => {
    it('should restore a message and return 204', async () => {
      mockMessageService.restore.mockResolvedValue(true);

      const res = await request(app).post('/v1/ai/conversations/thread-1/messages/msg-1/restore');

      expect(res.status).toBe(204);
      expect(mockMessageService.restore).toHaveBeenCalledWith('user-123', 'thread-1', 'msg-1');
    });
  });
});
