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

export interface PresignedFileAccessDto {
  url: string;
  expiresAt: string;
  fileId: string;
  mimeType: string;
  name: string;
}

export interface ImportFinalizeResponse {
  conversations: Array<{
    id: string;
    title: string;
    messages: unknown[];
  }>;
}
