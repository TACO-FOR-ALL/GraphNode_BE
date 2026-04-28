import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ChatExportService } from '../../src/core/services/ChatExportService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { ChatExportRepository } from '../../src/core/ports/ChatExportRepository';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { ChatExportJobDoc } from '../../src/core/types/persistence/chat_export.persistence';
import { ConflictError } from '../../src/shared/errors/domain';

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ChatExportService', () => {
  let jobs: Map<string, ChatExportJobDoc>;
  let uploadedFiles: Map<string, Buffer>;
  let chatManagementService: jest.Mocked<ChatManagementService>;
  let getConversationMock: any;
  let chatExportRepository: jest.Mocked<ChatExportRepository>;
  let storage: jest.Mocked<StoragePort>;
  let service: ChatExportService;

  beforeEach(() => {
    jobs = new Map();
    uploadedFiles = new Map();

    const validateConversationOwner = jest.fn<any>().mockResolvedValue({
      _id: 'conv-1',
      ownerUserId: 'user-1',
    });
    getConversationMock = jest.fn<any>().mockResolvedValue({
      id: 'conv-1',
      title: 'Test Conversation',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    chatManagementService = {
      validateConversationOwner,
      getConversation: getConversationMock,
    } as unknown as jest.Mocked<ChatManagementService>;

    chatExportRepository = {
      create: jest.fn(async (job) => {
        jobs.set(job.jobId, { ...job });
      }),
      findByJobId: jest.fn(async (jobId, userId) => {
        const job = jobs.get(jobId);
        return job && job.userId === userId ? { ...job } : null;
      }),
      update: jest.fn(async (jobId, userId, patch) => {
        const current = jobs.get(jobId);
        if (!current || current.userId !== userId) return;
        jobs.set(jobId, { ...current, ...patch });
      }),
    };

    storage = {
      upload: jest.fn(async (key: string, body: string | Buffer) => {
        const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
        uploadedFiles.set(key, buffer);
      }),
      uploadJson: jest.fn(),
      downloadStream: jest.fn(),
      downloadFile: jest.fn(async (key: string) => {
        const buffer = uploadedFiles.get(key);
        if (!buffer) throw new Error('file not found');
        return {
          buffer,
          contentType: 'application/json; charset=utf-8',
          contentLength: buffer.length,
        };
      }),
      downloadJson: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<StoragePort>;

    service = new ChatExportService(chatManagementService, chatExportRepository, storage);
  });

  it('creates export job, uploads file, and returns downloadable status', async () => {
    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    const status = await service.getExportStatus('user-1', started.jobId);

    expect(started.status).toBe('PENDING');
    expect(chatManagementService.validateConversationOwner).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(chatManagementService.getConversation).toHaveBeenCalledWith('conv-1', 'user-1');
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('DONE');
    expect(status.downloadUrl).toBe(`/v1/ai/chat-exports/${started.jobId}/download`);

    const file = await service.downloadExportFile('user-1', started.jobId);
    const parsed = JSON.parse(file.buffer.toString('utf-8'));
    expect(parsed.conversation.id).toBe('conv-1');
    expect(parsed.messages).toHaveLength(1);
  });

  it('marks failed export jobs and blocks download before completion', async () => {
    getConversationMock.mockRejectedValueOnce(new Error('db failed'));

    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    const status = await service.getExportStatus('user-1', started.jobId);
    expect(status.status).toBe('FAILED');
    expect(status.errorMessage).toContain('Failed to export chat');

    await expect(service.downloadExportFile('user-1', started.jobId)).rejects.toThrow(ConflictError);
  });
});
