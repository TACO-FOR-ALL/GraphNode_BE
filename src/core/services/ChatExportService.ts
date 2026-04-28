import { ulid } from 'ulid';

import type { ChatExportRepository } from '../ports/ChatExportRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { ChatExportJobDoc } from '../types/persistence/chat_export.persistence';
import type {
  ChatExportStatusResponseDto,
  StartChatExportResponseDto,
} from '../../shared/dtos/chat-export';
import { ChatManagementService } from './ChatManagementService';
import { buildStorageKey, STORAGE_BUCKETS } from '../../config/storageConfig';
import {
  NotFoundError,
  UpstreamError,
  ValidationError,
  ConflictError,
} from '../../shared/errors/domain';

interface ExportPayload {
  exportedAt: string;
  conversation: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
  }>;
}

export class ChatExportService {
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly chatExportRepository: ChatExportRepository,
    private readonly storage: StoragePort
  ) {}

  async startExport(userId: string, conversationId: string): Promise<StartChatExportResponseDto> {
    if (!conversationId?.trim()) {
      throw new ValidationError('conversationId is required');
    }

    await this.chatManagementService.validateConversationOwner(conversationId, userId);

    const now = Date.now();
    const jobId = ulid();
    const job: ChatExportJobDoc = {
      jobId,
      userId,
      conversationId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    await this.chatExportRepository.create(job);

    void this.processExportJob(job).catch(async (err) => {
      await this.chatExportRepository.update(job.jobId, job.userId, {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: Date.now(),
      });
    });

    return {
      jobId,
      status: job.status,
    };
  }

  async getExportStatus(userId: string, jobId: string): Promise<ChatExportStatusResponseDto> {
    const job = await this.requireJob(jobId, userId);
    return {
      jobId: job.jobId,
      status: job.status,
      downloadUrl:
        job.status === 'DONE' ? `/v1/ai/chat-exports/${job.jobId}/download` : undefined,
      errorMessage: job.errorMessage,
    };
  }

  async downloadExportFile(userId: string, jobId: string): Promise<{
    filename: string;
    buffer: Buffer;
    contentType?: string;
    contentLength?: number;
  }> {
    const job = await this.requireJob(jobId, userId);

    if (job.status !== 'DONE' || !job.fileKey) {
      throw new ConflictError('Export is not ready yet');
    }

    const file = await this.storage.downloadFile(job.fileKey, { bucketType: 'file' });
    return {
      filename: `${job.conversationId}.json`,
      buffer: file.buffer,
      contentType: file.contentType,
      contentLength: file.contentLength,
    };
  }

  private async processExportJob(job: ChatExportJobDoc): Promise<void> {
    await this.chatExportRepository.update(job.jobId, job.userId, {
      status: 'PROCESSING',
      updatedAt: Date.now(),
    });

    try {
      const conversation = await this.chatManagementService.getConversation(
        job.conversationId,
        job.userId
      );

      const payload: ExportPayload = {
        exportedAt: new Date().toISOString(),
        conversation: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt ?? new Date(job.createdAt).toISOString(),
          updatedAt: conversation.updatedAt ?? new Date(job.updatedAt).toISOString(),
        },
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt ?? null,
          updatedAt: message.updatedAt ?? null,
          attachments: message.attachments,
          metadata: message.metadata,
        })),
      };

      const fileKey = buildStorageKey(
        STORAGE_BUCKETS.CHAT_FILES,
        `${job.userId}/${job.jobId}-${job.conversationId}.json`
      );

      await this.storage.upload(
        fileKey,
        Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
        'application/json; charset=utf-8',
        { bucketType: 'file' }
      );

      await this.chatExportRepository.update(job.jobId, job.userId, {
        status: 'DONE',
        fileKey,
        errorMessage: undefined,
        updatedAt: Date.now(),
      });
    } catch (err: unknown) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        throw err;
      }
      throw new UpstreamError('Failed to export chat', { cause: String(err) });
    }
  }

  private async requireJob(jobId: string, userId: string): Promise<ChatExportJobDoc> {
    if (!jobId?.trim()) {
      throw new ValidationError('jobId is required');
    }

    const job = await this.chatExportRepository.findByJobId(jobId, userId);
    if (!job) {
      throw new NotFoundError(`Chat export job not found: ${jobId}`);
    }

    return job;
  }
}
