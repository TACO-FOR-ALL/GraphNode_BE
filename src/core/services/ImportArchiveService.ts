/**
 * AI export ZIP import — File Service 연동 + GraphNode 대화 저장.
 */
import { ulid } from 'ulid';

import type { FileServicePort, ImportCompleteDto } from '../ports/FileServicePort';
import type { ChatManagementService } from './ChatManagementService';
import type { ChatThread } from '../../shared/dtos/ai';
import { ImportJobNotReadyError } from '../../shared/errors/domain';

export class ImportArchiveService {
  constructor(
    private readonly fileService: FileServicePort,
    private readonly chatManagementService: ChatManagementService
  ) {}

  listProviders(userId: string) {
    return this.fileService.listProviders(userId);
  }

  createImport(userId: string, provider: string, zipBuffer: Buffer, originalName: string) {
    return this.fileService.createImport(userId, provider, zipBuffer, originalName);
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
   * import job 완료 후 File Service 결과를 GraphNode 대화로 일괄 저장합니다.
   */
  async finalizeImport(userId: string, jobId: string): Promise<{ conversations: ChatThread[] }> {
    const job = await this.fileService.getJob(userId, jobId);
    if (job.status !== 'completed') {
      throw new ImportJobNotReadyError(`Import job ${jobId} is not completed (status=${job.status})`);
    }

    const result = await this.fileService.getResult(userId, jobId);
    const threads = this.mapToBulkCreateThreads(result);
    const created = await this.chatManagementService.bulkCreateConversations(userId, threads);
    return { conversations: created };
  }

  private mapToBulkCreateThreads(result: ImportCompleteDto) {
    return result.conversations.map((conv) => ({
      id: ulid(),
      title: conv.title || 'Untitled',
      messages: conv.messages.map((m) => ({
        id: ulid(),
        role: m.role,
        content: m.content,
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
}
