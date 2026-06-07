/**
 * AI export ZIP import — File Service 연동 + GraphNode 대화 저장.
 */
import type {
  FileServicePort,
  ImportFinalizeResponse,
} from '../ports/FileServicePort';
import type { ChatManagementService } from './ChatManagementService';
import type { ConversationService } from './ConversationService';
import type { ImportFinalizeProcessor } from './ImportFinalizeProcessor';
import type { QueuePort } from '../ports/QueuePort';
import type { ChatThread } from '../../shared/dtos/ai';
import { loadEnv } from '../../config/env';
import type { ImportFinalizeQueueMessage } from '../../shared/dtos/importFinalize';
import { toChatThreadDto } from '../../shared/mappers/ai';
import { logger } from '../../shared/utils/logger';

export class ImportArchiveService {
  constructor(
    private readonly fileService: FileServicePort,
    private readonly chatManagementService: ChatManagementService,
    private readonly conversationService: ConversationService,
    private readonly finalizeProcessor: ImportFinalizeProcessor,
    private readonly queue: QueuePort
  ) {}

  listProviders(userId: string) {
    return this.fileService.listProviders(userId);
  }

  initImportUpload(
    userId: string,
    provider: string,
    originalName: string,
    sizeBytes: number
  ) {
    return this.fileService.initImportUpload(userId, provider, originalName, sizeBytes);
  }

  startImport(userId: string, jobId: string) {
    return this.fileService.startImport(userId, jobId);
  }

  getJob(userId: string, jobId: string) {
    return this.fileService.getJob(userId, jobId);
  }

  cancelJob(userId: string, jobId: string) {
    return this.fileService.cancelJob(userId, jobId);
  }

  getFileAccessUrl(
    userId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ) {
    return this.fileService.presignFileAccess(userId, fileId, options);
  }

  /**
   * import job 완료 후 S3 result → Mongo 저장 (비동기 SQS 또는 로컬 동기 fallback).
   */
  async finalizeImport(userId: string, jobId: string): Promise<ImportFinalizeResponse> {
    const claim = await this.fileService.claimFinalize(userId, jobId);

    if (claim.claim === 'already_finalized') {
      const conversations = await this.loadConversationsByIds(userId, claim.conversationIds ?? []);
      return { status: 'finalized', jobId, conversations };
    }

    if (claim.claim === 'in_progress') {
      return { status: 'finalizing', jobId };
    }

    const env = loadEnv();
    const queueUrl = env.SQS_IMPORT_FINALIZE_QUEUE_URL;

    if (queueUrl) {
      const message: ImportFinalizeQueueMessage = {
        jobId,
        userId,
        resultS3Key: claim.resultS3Key,
        provider: claim.provider,
        timestamp: new Date().toISOString(),
      };
      await this.queue.sendMessage(queueUrl, message);
      logger.info({ jobId, userId }, 'Import finalize enqueued');
      return { status: 'finalizing', jobId };
    }

    const conversations = await this.finalizeProcessor.process(
      userId,
      jobId,
      claim.resultS3Key,
      claim.provider
    );
    return { status: 'finalized', jobId, conversations };
  }

  private async loadConversationsByIds(
    userId: string,
    ids: string[]
  ): Promise<ChatThread[]> {
    if (ids.length === 0) return [];
    const docs = await this.conversationService.findDocsByIds(ids, userId);
    const order = new Map(ids.map((id, i) => [id, i]));
    docs.sort((a, b) => (order.get(a._id) ?? 0) - (order.get(b._id) ?? 0));
    return docs.map((doc) => toChatThreadDto(doc, []));
  }
}
