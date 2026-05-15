import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AdmZip from 'adm-zip';

import { ChatExportService } from '../../src/core/services/ChatExportService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { ChatExportRepository } from '../../src/core/ports/ChatExportRepository';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { EmailPort } from '../../src/core/ports/EmailPort';
import { UserService } from '../../src/core/services/UserService';
import { ChatExportJobDoc } from '../../src/core/types/persistence/chat_export.persistence';
import { ConflictError, ValidationError } from '../../src/shared/errors/domain';
import { STORAGE_BUCKETS } from '../../src/config/storageConfig';

jest.mock('../../src/config/env', () => ({
  loadEnv: jest.fn(() => ({
    CHAT_EXPORT_RETENTION_DAYS: 3,
    CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES: 20 * 1024 * 1024,
  })),
}));

const TEST_EXPORT_RECIPIENT_EMAIL = 'Test@example.com';

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ChatExportService', () => {
  let jobs: Map<string, ChatExportJobDoc>;
  let uploadedFiles: Map<string, Buffer>;
  let chatManagementService: jest.Mocked<ChatManagementService>;
  let getConversationMock: jest.Mock;
  let listConversationsMock: jest.Mock;
  let userService: jest.Mocked<UserService>;
  let chatExportRepository: jest.Mocked<ChatExportRepository>;
  let storage: jest.Mocked<StoragePort>;
  let email: jest.Mocked<EmailPort>;
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
      createdAt: '2020-06-15T12:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'hello',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          attachments: [
            {
              id: 'att-1',
              type: 'file',
              url: 'chat-files/sample-doc.pdf',
              name: 'sample-doc.pdf',
              mimeType: 'application/pdf',
              size: 12,
            },
          ],
        },
      ],
    });
    listConversationsMock = jest.fn<any>().mockResolvedValue({
      items: [
        {
          id: 'conv-1',
          title: 'A',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-02-01T00:00:00.000Z',
          messages: [],
        },
      ],
      nextCursor: null,
    });

    chatManagementService = {
      validateConversationOwner,
      getConversation: getConversationMock,
      listConversations: listConversationsMock,
    } as unknown as jest.Mocked<ChatManagementService>;

    userService = {
      getUserProfile: jest.fn<any>().mockResolvedValue({
        id: 'user-1',
        email: TEST_EXPORT_RECIPIENT_EMAIL,
        provider: 'google',
        providerUserId: 'p-1',
        preferredLanguage: 'en',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    } as unknown as jest.Mocked<UserService>;

    chatExportRepository = {
      create: jest.fn(async (job) => {
        jobs.set(job.jobId, { ...job });
      }),
      findByJobId: jest.fn(async (jobId, userId) => {
        const job = jobs.get(jobId);
        return job && job.userId === userId ? { ...job } : null;
      }),
      findActiveJob: jest.fn(async (userId, exportScope, conversationId) => {
        for (const job of jobs.values()) {
          if (job.userId !== userId) continue;
          if (!['PENDING', 'PROCESSING'].includes(job.status)) continue;
          if (job.exportScope !== exportScope) continue;
          if (exportScope === 'conversation' && job.conversationId !== conversationId) continue;
          return { ...job };
        }
        return null;
      }),
      findExpiredDoneJobs: jest.fn(async (before) => {
        return [...jobs.values()].filter(
          (j) => j.status === 'DONE' && j.expiresAt <= before
        );
      }),
      update: jest.fn(async (jobId, userId, patch) => {
        const current = jobs.get(jobId);
        if (!current || current.userId !== userId) return;
        jobs.set(jobId, { ...current, ...patch });
      }),
      delete: jest.fn(async (jobId, userId) => {
        const current = jobs.get(jobId);
        if (current?.userId === userId) jobs.delete(jobId);
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
        const buffer = uploadedFiles.get(key) ?? Buffer.from('%PDF-mock', 'utf-8');
        return {
          buffer,
          contentType: key.endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
          contentLength: buffer.length,
        };
      }),
      downloadJson: jest.fn(),
      delete: jest.fn(async (key: string) => {
        uploadedFiles.delete(key);
      }),
    } as unknown as jest.Mocked<StoragePort>;

    email = {
      sendEmail: jest.fn(async () => {}),
      sendEmailWithAttachment: jest.fn(async () => {}),
    } as unknown as jest.Mocked<EmailPort>;

    service = new ChatExportService(
      chatManagementService,
      userService,
      chatExportRepository,
      storage,
      email
    );

    jest.mocked(require('../../src/config/env').loadEnv).mockReturnValue({
      CHAT_EXPORT_RETENTION_DAYS: 3,
      CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES: 20 * 1024 * 1024,
    });
  });

  it('creates export job, uploads zip to chat-exports prefix, and sends email', async () => {
    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    const status = await service.getExportStatus('user-1', started.jobId);

    expect(started.status).toBe('PENDING');
    expect(started.exportScope).toBe('conversation');
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const uploadKey = jest.mocked(storage.upload).mock.calls[0][0] as string;
    expect(uploadKey.startsWith(`${STORAGE_BUCKETS.CHAT_EXPORT_FILES.prefix}/`)).toBe(true);
    expect(uploadKey.endsWith('.zip')).toBe(true);

    expect(email.sendEmailWithAttachment).toHaveBeenCalledTimes(1);
    expect(status.status).toBe('DONE');

    const file = await service.downloadExportFile('user-1', started.jobId);
    expect(file.filename).toBe('conv-1-export.zip');
    expect(file.contentType).toBe('application/zip');

    const zip = new AdmZip(file.buffer);
    const exportJson = zip.readAsText('export.json');
    const parsed = JSON.parse(exportJson);
    expect(parsed.conversations[0].conversation.id).toBe('conv-1');
    expect(parsed.conversations[0].conversation.createdAt).toBe('2020-06-15T12:00:00.000Z');
    expect(parsed.conversations[0].messages[0].attachments[0].s3Key).toBe('chat-files/sample-doc.pdf');
    expect(parsed.conversations[0].messages[0].attachments[0].archivePath).toContain('attachments/conv-1/msg-1/');
  });

  it('rejects duplicate active export for the same conversation', async () => {
    jobs.set('existing', {
      jobId: 'existing',
      userId: 'user-1',
      exportScope: 'conversation',
      conversationId: 'conv-1',
      status: 'PROCESSING',
      expiresAt: Date.now() + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(service.startExport('user-1', 'conv-1')).rejects.toThrow(ConflictError);
  });

  it('starts export-all job and includes multiple conversations in zip', async () => {
    const started = await service.startExportAll('user-1');
    await flushPromises();
    await flushPromises();

    expect(started.exportScope).toBe('all');
    expect(listConversationsMock).toHaveBeenCalled();
    const status = await service.getExportStatus('user-1', started.jobId);
    expect(status.status).toBe('DONE');
  });

  it('sends link-only email when zip exceeds SMTP attachment limit', async () => {
    jest.mocked(require('../../src/config/env').loadEnv).mockReturnValue({
      CHAT_EXPORT_RETENTION_DAYS: 3,
      CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES: 10,
      PUBLIC_API_BASE_URL: 'https://api.example.test',
    });

    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    expect(email.sendEmailWithAttachment).not.toHaveBeenCalled();
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const sent = jest.mocked(email.sendEmail).mock.calls[0][0] as { to: string; text: string };
    expect(sent.to).toBe(TEST_EXPORT_RECIPIENT_EMAIL);
    expect(sent.text).toContain(`https://api.example.test/v1/exports/${started.jobId}/download`);
    expect(sent.text).toContain('too large to attach');
  });

  it('link-only email has no https URL when PUBLIC_API_BASE_URL is unset', async () => {
    jest.mocked(require('../../src/config/env').loadEnv).mockReturnValue({
      CHAT_EXPORT_RETENTION_DAYS: 3,
      CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES: 10,
    });

    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    const sent = jest.mocked(email.sendEmail).mock.calls[0][0] as { text: string };
    expect(sent.text).toContain('Set PUBLIC_API_BASE_URL');
    expect(sent.text).toContain(started.jobId);
    expect(sent.text).not.toMatch(/https:\/\//);
  });

  it('cleans up expired export jobs and S3 objects', async () => {
    const fileKey = `${STORAGE_BUCKETS.CHAT_EXPORT_FILES.prefix}/user-1/old.zip`;
    uploadedFiles.set(fileKey, Buffer.from('zip'));
    jobs.set('old-job', {
      jobId: 'old-job',
      userId: 'user-1',
      exportScope: 'conversation',
      conversationId: 'conv-1',
      status: 'DONE',
      fileKey,
      expiresAt: Date.now() - 1,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    });

    const removed = await service.cleanupExpiredExports();
    expect(removed).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith(fileKey, { bucketType: 'file' });
    expect(jobs.has('old-job')).toBe(false);
  });

  it('marks failed export jobs and blocks download before completion', async () => {
    (getConversationMock as any).mockRejectedValueOnce(new Error('db failed'));

    const started = await service.startExport('user-1', 'conv-1');
    await flushPromises();
    await flushPromises();

    const status = await service.getExportStatus('user-1', started.jobId);
    expect(status.status).toBe('FAILED');
    expect(status.errorMessage).toContain('db failed');

    await expect(service.downloadExportFile('user-1', started.jobId)).rejects.toThrow(ConflictError);
  });

  it('requires conversationId for single export', async () => {
    await expect(service.startExport('user-1', '   ')).rejects.toThrow(ValidationError);
  });
});
