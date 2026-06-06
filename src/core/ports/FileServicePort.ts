/**
 * File Service (internal MSA) 연동 포트.
 */
import type { ChatThread } from '../../shared/dtos/ai';
export interface ImportProviderDescriptor {
  slug: string;
  label: string;
  enabled: boolean;
  reason?: 'coming_soon' | 'disabled';
}

export interface ImportJobStatusDto {
  jobId: string;
  status: string;
  progress: number;
  stats?: Record<string, unknown>;
  error?: { code: string; detail?: string };
  createdAt: string;
  completedAt?: string;
  finalizeStatus?: 'none' | 'finalizing' | 'finalized' | 'failed';
  finalizedAt?: string;
  finalizeConversationIds?: string[];
  finalizeError?: string;
}

export interface ImportAttachmentDto {
  id: string;
  type: 'image' | 'file';
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ImportMessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  attachments?: ImportAttachmentDto[];
}

export interface ImportConversationDto {
  id: string;
  title: string;
  messages: ImportMessageDto[];
}

export interface ImportCompleteDto {
  jobId: string;
  userId: string;
  provider: string;
  conversations: ImportConversationDto[];
  unresolvedLinks?: Array<{ providerMessageKey: string; reason: string }>;
}

export interface PresignedFileAccessDto {
  url: string;
  expiresAt: string;
  fileId: string;
  mimeType: string;
  name: string;
}

export interface ImportUploadInitDto {
  jobId: string;
  status: 'pending_upload';
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  stagingKey: string;
}

export type ImportFinalizeClaimState = 'claimed' | 'already_finalized' | 'in_progress';

export interface ImportFinalizeClaimDto {
  claim: ImportFinalizeClaimState;
  jobId: string;
  provider: string;
  resultS3Key: string;
  conversationIds?: string[];
}

export interface ImportFinalizeResponse {
  status: 'finalizing' | 'finalized';
  jobId: string;
  conversations?: ChatThread[];
}

export interface FileServicePort {
  listProviders(userId: string): Promise<ImportProviderDescriptor[]>;
  initImportUpload(
    userId: string,
    provider: string,
    originalName: string,
    sizeBytes: number
  ): Promise<ImportUploadInitDto>;
  startImport(userId: string, jobId: string): Promise<{ jobId: string; status: string }>;
  getJob(userId: string, jobId: string): Promise<ImportJobStatusDto>;
  getResult(userId: string, jobId: string): Promise<ImportCompleteDto>;
  claimFinalize(userId: string, jobId: string): Promise<ImportFinalizeClaimDto>;
  completeFinalize(userId: string, jobId: string, conversationIds: string[]): Promise<void>;
  failFinalize(userId: string, jobId: string, error: string): Promise<void>;
  cancelJob(userId: string, jobId: string): Promise<void>;
  presignFileAccess(
    userId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedFileAccessDto>;
}
