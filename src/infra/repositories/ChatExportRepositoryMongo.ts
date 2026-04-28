import type { Collection } from 'mongodb';

import type { ChatExportRepository } from '../../core/ports/ChatExportRepository';
import type { ChatExportJobDoc } from '../../core/types/persistence/chat_export.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError } from '../../shared/errors/domain';

export class ChatExportRepositoryMongo implements ChatExportRepository {
  private col(): Collection<ChatExportJobDoc> {
    return getMongo().db().collection<ChatExportJobDoc>('chat_export_jobs');
  }

  async create(job: ChatExportJobDoc): Promise<void> {
    try {
      await this.col().insertOne(job);
    } catch (err: unknown) {
      throw new UpstreamError('Failed to create chat export job', { originalError: err as any });
    }
  }

  async findByJobId(jobId: string, userId: string): Promise<ChatExportJobDoc | null> {
    try {
      return await this.col().findOne({ jobId, userId });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to load chat export job', { originalError: err as any });
    }
  }

  async update(jobId: string, userId: string, patch: Partial<ChatExportJobDoc>): Promise<void> {
    try {
      await this.col().updateOne({ jobId, userId }, { $set: patch });
    } catch (err: unknown) {
      throw new UpstreamError('Failed to update chat export job', { originalError: err as any });
    }
  }
}
