/**
 * File Service (internal MSA) 연동 포트.
 */
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

export interface FileServicePort {
  listProviders(userId: string): Promise<ImportProviderDescriptor[]>;
  createImport(
    userId: string,
    provider: string,
    zipBuffer: Buffer,
    originalName: string
  ): Promise<{ jobId: string; status: string }>;
  getJob(userId: string, jobId: string): Promise<ImportJobStatusDto>;
  getResult(userId: string, jobId: string): Promise<ImportCompleteDto>;
  cancelJob(userId: string, jobId: string): Promise<void>;
  presignFileAccess(
    userId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedFileAccessDto>;
}
