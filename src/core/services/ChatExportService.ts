import { ulid } from 'ulid';

import type { ChatExportRepository } from '../ports/ChatExportRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { EmailPort } from '../ports/EmailPort';
import type { ChatExportJobDoc } from '../types/persistence/chat_export.persistence';
import type {
  ChatExportStatusResponseDto,
  StartChatExportResponseDto,
} from '../../shared/dtos/chat-export';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { buildStorageKey, STORAGE_BUCKETS } from '../../config/storageConfig';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';

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
    deletedAt?: string | null;
    attachments?: unknown[];
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * 채팅 내보내기 유스케이스.
 * - 대화·메시지를 JSON으로 직렬화하여 S3에 저장합니다.
 * - 완료 후 사용자 프로필 이메일로 첨부 발송을 시도합니다(선택·best-effort).
 */
export class ChatExportService {
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly userService: UserService,
    private readonly chatExportRepository: ChatExportRepository,
    private readonly storage: StoragePort,
    private readonly email: EmailPort
  ) {}

  /**
   * @description 내보내기 작업을 큐에 넣고 즉시 jobId를 반환합니다.
   * @param userId 로그인 사용자 ID
   * @param conversationId 대화 ID
   */
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

  /**
   * @description 작업 상태를 조회합니다.
   */
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

  /**
   * @description 완료된 내보내기 파일을 바이너리로 반환합니다.
   */
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
        deletedAt: message.deletedAt ?? null,
        attachments: message.attachments,
        metadata: message.metadata,
      })),
    };

    const fileKey = buildStorageKey(
      STORAGE_BUCKETS.CHAT_FILES,
      `${job.userId}/${job.jobId}-${job.conversationId}.json`
    );

    const exportBuffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf-8');
    await this.storage.upload(fileKey, exportBuffer, 'application/json; charset=utf-8', {
      bucketType: 'file',
    });

    await this.chatExportRepository.update(job.jobId, job.userId, {
      status: 'DONE',
      fileKey,
      updatedAt: Date.now(),
    });

    try {
      const profile = await this.userService.getUserProfile(job.userId);
      if (!profile.email?.trim()) {
        logger.warn({ userId: job.userId, jobId: job.jobId }, 'User email is empty — skip export email');
        return;
      }

      await this.email.sendEmailWithAttachment({
        to: profile.email.trim(),
        subject: `GraphNode chat export: ${payload.conversation.title || payload.conversation.id}`,
        text: [
          'Your chat export is ready.',
          '',
          `Conversation: ${payload.conversation.title || payload.conversation.id}`,
          `Exported at: ${payload.exportedAt}`,
          '',
          'Attached is a JSON file containing the conversation and messages.',
        ].join('\n'),
        attachmentFilename: `${job.conversationId}.json`,
        attachmentContentType: 'application/json; charset=utf-8',
        attachmentBuffer: exportBuffer,
      });
    } catch (err: unknown) {
      logger.warn(
        { err, userId: job.userId, jobId: job.jobId },
        'Failed to send chat export email (best-effort)'
      );
    }
  }

  private async requireJob(jobId: string, userId: string): Promise<ChatExportJobDoc> {
    if (!jobId?.trim()) {
      throw new ValidationError('jobId is required');
    }

    const doc = await this.chatExportRepository.findByJobId(jobId, userId);
    if (!doc) {
      throw new NotFoundError(`Chat export job not found: ${jobId}`);
    }

    return doc;
  }
}
