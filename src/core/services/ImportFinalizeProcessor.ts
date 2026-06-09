/**
 * Import finalize worker 로직 — S3 result JSON 직접 read → Mongo bulk insert.
 */
import type { ImportCompleteDto, FileServicePort } from '../ports/FileServicePort';
import type { ChatManagementService } from './ChatManagementService';
import type { ConversationRepository } from '../ports/ConversationRepository';
import type { MessageRepository } from '../ports/MessageRepository';
import type { StoragePort } from '../ports/StoragePort';
import type { ChatThread } from '../../shared/dtos/ai';
import { importConversationId, importMessageId } from '../../shared/utils/importIds';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/base';
import { formatImportFailureDetail, summarizeMongoError } from '../../shared/utils/mongoError';

export class ImportFinalizeProcessor {
  constructor(
    private readonly fileService: FileServicePort,
    private readonly storage: StoragePort,
    private readonly chatManagementService: ChatManagementService,
    private readonly conversationRepo: ConversationRepository,
    private readonly messageRepo: MessageRepository
  ) {}

  async process(
    userId: string,
    jobId: string,
    resultS3Key: string,
    _provider: string
  ): Promise<ChatThread[]> {
    let conversationCount = 0;
    let messageCount = 0;

    try {
      const result = await this.storage.downloadJson<ImportCompleteDto>(resultS3Key, {
        bucketType: 'file',
      });
      const threads = this.mapToBulkCreateThreads(jobId, result);
      conversationCount = threads.length;
      messageCount = threads.reduce((n, t) => n + (t.messages?.length ?? 0), 0);
      const prepared = await this.prepareIdempotentThreads(threads);
      const created = await this.chatManagementService.bulkCreateConversations(userId, prepared);
      const conversationIds = threads.map((t) => t.id);
      await this.fileService.completeFinalize(userId, jobId, conversationIds);
      logger.info(
        { jobId, userId, conversations: conversationIds.length, messageCount },
        'Import finalize completed'
      );
      return created;
    } catch (err) {
      const failureDetail = formatImportFailureDetail(err, {
        stage: 'import_finalize',
        jobId,
        userId,
        resultS3Key,
        conversationCount,
        messageCount,
        appErrorCode: err instanceof AppError ? err.code : undefined,
      });

      logger.error(
        {
          err,
          jobId,
          userId,
          conversationCount,
          messageCount,
          ...summarizeMongoError(err),
        },
        'Import finalize failed'
      );
      await this.fileService.failFinalize(userId, jobId, failureDetail).catch(() => {});
      throw err;
    }
  }

  private mapToBulkCreateThreads(jobId: string, result: ImportCompleteDto) {
    return result.conversations.map((conv) => ({
      id: importConversationId(jobId, conv.id),
      title: conv.title || 'Untitled',
      importJobId: jobId,
      importSourceConversationId: conv.id,
      messages: conv.messages.map((m) => ({
        id: importMessageId(jobId, m.id),
        role: m.role,
        content: m.content,
        importSourceMessageId: m.id,
        attachments: m.attachments?.map((a) => ({
          id: a.id,
          type: a.type,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
        })),
      })),
    }));
  }

  private async prepareIdempotentThreads(
    threads: ReturnType<ImportFinalizeProcessor['mapToBulkCreateThreads']>
  ) {
    const convIds = threads.map((t) => t.id);
    const msgIds = threads.flatMap((t) => (t.messages ?? []).map((m) => m.id));
    const [existingConvIds, existingMsgIds] = await Promise.all([
      this.conversationRepo.findExistingIds(convIds),
      this.messageRepo.findExistingIds(msgIds),
    ]);

    return threads.map((thread) => ({
      ...thread,
      _skipConversationInsert: existingConvIds.has(thread.id),
      messages: (thread.messages ?? []).filter((m) => !existingMsgIds.has(m.id)),
    }));
  }
}
