import type { Collection } from 'mongodb';

import type { ChatExportRepository } from '../../core/ports/ChatExportRepository';
import type {
  ChatExportJobDoc,
  ChatExportScope,
} from '../../core/types/persistence/chat_export.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * ChatExportRepository의 MongoDB 구현체.
 */
export class ChatExportRepositoryMongo implements ChatExportRepository {
  private col(): Collection<ChatExportJobDoc> {
    return getMongo().db().collection<ChatExportJobDoc>('chat_export_jobs');
  }

  /**
   * @description 작업 문서를 삽입합니다.
   * @param job 삽입할 문서
   */
  async create(job: ChatExportJobDoc): Promise<void> {
    try {
      await this.col().insertOne({ ...job });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to create chat export job', { cause: err });
    }
  }

  /**
   * @description jobId 및 userId가 일치하는 문서를 조회합니다.
   */
  async findByJobId(jobId: string, userId: string): Promise<ChatExportJobDoc | null> {
    try {
      return await this.col().findOne({ jobId, userId });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to find chat export job', { cause: err });
    }
  }

  /**
   * @description 동일 사용자·범위의 진행 중 작업을 조회합니다.
   */
  async findActiveJob(
    userId: string,
    exportScope: ChatExportScope,
    conversationId?: string
  ): Promise<ChatExportJobDoc | null> {
    try {
      const filter: Record<string, unknown> = {
        userId,
        exportScope,
        status: { $in: ['PENDING', 'PROCESSING'] as const },
      };
      if (exportScope === 'conversation' && conversationId) {
        filter.conversationId = conversationId;
      }
      return await this.col().findOne(filter, { sort: { createdAt: -1 } });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to find active chat export job', { cause: err });
    }
  }

  /**
   * @description 만료된 완료 작업 목록을 조회합니다.
   */
  async findExpiredDoneJobs(expiresBeforeMs: number): Promise<ChatExportJobDoc[]> {
    try {
      return await this.col()
        .find({
          status: 'DONE',
          expiresAt: { $lte: expiresBeforeMs },
        })
        .toArray();
    } catch (err: unknown) {
      throw new UpstreamError('Failed to list expired chat export jobs', { cause: err });
    }
  }

  /**
   * @description jobId 및 userId가 일치하는 문서를 갱신합니다.
   */
  async update(jobId: string, userId: string, patch: Partial<ChatExportJobDoc>): Promise<void> {
    try {
      const updatedAt = patch.updatedAt ?? Date.now();
      await this.col().updateOne({ jobId, userId }, { $set: { ...patch, updatedAt } });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to update chat export job', { cause: err });
    }
  }

  /**
   * @description jobId 및 userId가 일치하는 문서를 삭제합니다.
   */
  async delete(jobId: string, userId: string): Promise<void> {
    try {
      await this.col().deleteOne({ jobId, userId });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to delete chat export job', { cause: err });
    }
  }
}
