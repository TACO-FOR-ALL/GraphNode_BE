import { ulid } from 'ulid';

import type { ChatExportRepository } from '../ports/ChatExportRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { EmailPort } from '../ports/EmailPort';
import type { ChatExportJobDoc, ChatExportScope } from '../types/persistence/chat_export.persistence';
import type {
  ChatExportStatusResponseDto,
  StartChatExportResponseDto,
} from '../../shared/dtos/chat-export';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { buildStorageKey, STORAGE_BUCKETS } from '../../config/storageConfig';
import { loadEnv } from '../../config/env';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';
import { buildExportZipBuffer, threadToExportConversation } from './chatExport/buildExportZip';
import type { ChatExportPayload } from './chatExport/types';

const EXPORT_LIST_PAGE_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 채팅보내기 유스케이스.
 * - 대화·메시지·첨부를 ZIP(`export.json` + attachments/)으로 S3에 저장합니다.
 * - 완료 후 SMTP로 알림(첨부 또는 다운로드 링크만)을 best-effort 발송합니다.
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
   * @description 단일 대화보내기 작업을 시작합니다.
   * @param userId 로그인 사용자 ID
   * @param conversationId 대화 ID
   */
  async startExport(userId: string, conversationId: string): Promise<StartChatExportResponseDto> {
    if (!conversationId?.trim()) {
      throw new ValidationError('conversationId is required');
    }
    await this.chatManagementService.validateConversationOwner(conversationId, userId);
    return this.enqueueExport(userId, 'conversation', conversationId.trim());
  }

  /**
   * @description 사용자의 전체 대화보내기 작업을 시작합니다.
   * @param userId 로그인 사용자 ID
   */
  async startExportAll(userId: string): Promise<StartChatExportResponseDto> {
    return this.enqueueExport(userId, 'all');
  }

  /**
   * @description 작업 상태를 조회합니다(downloadUrl은 Controller에서 조립).
   */
  async getExportStatus(userId: string, jobId: string): Promise<ChatExportStatusResponseDto> {
    const job = await this.requireJob(jobId, userId);
    return {
      jobId: job.jobId,
      status: job.status,
      exportScope: job.exportScope,
      conversationId: job.conversationId,
      errorMessage: job.errorMessage,
    };
  }

  /**
   * @description 완료된보내기 ZIP을 바이너리로 반환합니다.
   */
  async downloadExportFile(
    userId: string,
    jobId: string
  ): Promise<{
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
      filename: this.buildDownloadFilename(job),
      buffer: file.buffer,
      contentType: file.contentType ?? 'application/zip',
      contentLength: file.contentLength,
    };
  }

  /**
   * @description 만료된 완료 작업의 S3 객체와 job 문서를 정리합니다.
   * @returns 삭제된 작업 수
   */
  async cleanupExpiredExports(): Promise<number> {
    const now = Date.now();
    const expired = await this.chatExportRepository.findExpiredDoneJobs(now);
    let removed = 0;

    for (const job of expired) {
      try {
        if (job.fileKey) {
          await this.storage.delete(job.fileKey, { bucketType: 'file' });
        }
        await this.chatExportRepository.delete(job.jobId, job.userId);
        removed += 1;
      } catch (err: unknown) {
        logger.warn({ err, jobId: job.jobId, userId: job.userId }, 'Failed to cleanup expired export job');
      }
    }

    return removed;
  }

  private async enqueueExport(
    userId: string,
    exportScope: ChatExportScope,
    conversationId?: string
  ): Promise<StartChatExportResponseDto> {
    const active = await this.chatExportRepository.findActiveJob(userId, exportScope, conversationId);
    if (active) {
      throw new ConflictError(
        `An export job is already in progress (jobId: ${active.jobId}, status: ${active.status})`
      );
    }

    const env = loadEnv();
    const now = Date.now();
    const jobId = ulid();
    const job: ChatExportJobDoc = {
      jobId,
      userId,
      exportScope,
      conversationId: exportScope === 'conversation' ? conversationId : undefined,
      status: 'PENDING',
      expiresAt: now + env.CHAT_EXPORT_RETENTION_DAYS * MS_PER_DAY,
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

    return { jobId, status: job.status, exportScope };
  }

  private async processExportJob(job: ChatExportJobDoc): Promise<void> {
    await this.chatExportRepository.update(job.jobId, job.userId, {
      status: 'PROCESSING',
      updatedAt: Date.now(),
    });

    const conversations =
      job.exportScope === 'all'
        ? await this.loadAllConversationThreads(job.userId)
        : [
            await this.chatManagementService.getConversation(
              job.conversationId!,
              job.userId
            ),
          ];

    const payload: ChatExportPayload = {
      exportedAt: new Date().toISOString(),
      exportScope: job.exportScope,
      conversations: conversations.map(threadToExportConversation),
    };

    const zipBuffer = await buildExportZipBuffer(payload, this.storage);
    const fileKey = buildStorageKey(
      STORAGE_BUCKETS.CHAT_EXPORT_FILES,
      `${job.userId}/${job.jobId}.zip`
    );

    await this.storage.upload(fileKey, zipBuffer, 'application/zip', { bucketType: 'file' });

    await this.chatExportRepository.update(job.jobId, job.userId, {
      status: 'DONE',
      fileKey,
      updatedAt: Date.now(),
    });

    await this.sendExportNotification(job, payload, zipBuffer);
  }

  /**
   * @description 사용자의 모든 대화 스레드를 페이지네이션으로 수집합니다.
   */
  private async loadAllConversationThreads(userId: string) {
    const threads = [];
    let cursor: string | undefined;
    do {
      const page = await this.chatManagementService.listConversations(
        userId,
        EXPORT_LIST_PAGE_SIZE,
        cursor,
        { includeMessages: true }
      );
      threads.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return threads;
  }

  private async sendExportNotification(
    job: ChatExportJobDoc,
    payload: ChatExportPayload,
    zipBuffer: Buffer
  ): Promise<void> {
    try {
      const profile = await this.userService.getUserProfile(job.userId);
      if (!profile.email?.trim()) {
        logger.warn({ userId: job.userId, jobId: job.jobId }, 'User email is empty — skip export email');
        return;
      }

      const env = loadEnv();
      const to = profile.email.trim();
      const title =
        job.exportScope === 'all'
          ? 'All conversations'
          : payload.conversations[0]?.conversation.title ||
            payload.conversations[0]?.conversation.id ||
            'Chat export';

      const baseLines = [
        'Your chat export is ready.',
        '',
        `Scope: ${job.exportScope}`,
        `Exported at: ${payload.exportedAt}`,
        '',
      ];

      const filename = this.buildDownloadFilename(job);
      const maxBytes = env.CHAT_EXPORT_SMTP_MAX_ATTACHMENT_BYTES;

      if (zipBuffer.length <= maxBytes) {
        await this.email.sendEmailWithAttachment({
          to,
          subject: `GraphNode chat export: ${title}`,
          text: [...baseLines, 'The export ZIP is attached to this email.'].join('\n'),
          attachmentFilename: filename,
          attachmentContentType: 'application/zip',
          attachmentBuffer: zipBuffer,
        });
        return;
      }

      logger.warn(
        {
          userId: job.userId,
          jobId: job.jobId,
          zipBytes: zipBuffer.length,
          maxBytes,
        },
        'Export ZIP exceeds SMTP attachment limit — sending link-only email'
      );

      const downloadUrl = this.buildAbsoluteExportDownloadUrlForEmail(job.jobId);
      const linkBlock = downloadUrl
        ? [
            `The export file (${zipBuffer.length} bytes) is too large to attach to this email.`,
            '', 
            'Download (authentication required — use your app session or Authorization: Bearer):', 
            downloadUrl,
            '',
            `Job ID: ${job.jobId}`,
          ]
        : [
            `The export file (${zipBuffer.length} bytes) is too large to attach to this email.`,
            '',
            'Set PUBLIC_API_BASE_URL in server configuration to include a clickable download link here.',
            `Job ID: ${job.jobId}`,
            'Until then, open the export status screen in the app to copy downloadUrl.',
          ];

      await this.email.sendEmail({
        to,
        subject: `GraphNode chat export: ${title}`,
        text: [...baseLines, ...linkBlock].join('\n'),
      });
    } catch (err: unknown) {
      logger.warn(
        { err, userId: job.userId, jobId: job.jobId },
        'Failed to send chat export email (best-effort)'
      );
    }
  }

  /**
   * @description 링크 전용 이메일 본문에 넣을 절대 다운로드 URL. `PUBLIC_API_BASE_URL` 미설정 시 null.
   * @param jobId export 작업 ID.
   */
  private buildAbsoluteExportDownloadUrlForEmail(jobId: string): string | null {
    const env = loadEnv();
    const base = env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '');
    if (!base) {
      return null;
    }
    return `${base}/v1/exports/${jobId}/download`;
  }

  private buildDownloadFilename(job: ChatExportJobDoc): string {
    if (job.exportScope === 'all') {
      return 'all-conversations-export.zip';
    }
    return `${job.conversationId ?? 'conversation'}-export.zip`;
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
