import { ChatExportJobDoc } from '../types/persistence/chat_export.persistence';
export interface ChatExportRepository {
  create(job: ChatExportJobDoc): Promise<void>;
  findByJobId(jobId: string, userId: string): Promise<ChatExportJobDoc | null>;
  update(jobId: string, userId: string, patch: Partial<ChatExportJobDoc>): Promise<void>;
}