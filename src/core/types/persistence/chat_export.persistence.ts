export interface ChatExportJobDoc {
    jobId: string;
    userId: string;
    conversationId: string;
    status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
    fileKey?: string;
    errorMessage?: string;
    createdAt: number;
    updatedAt: number;
  }