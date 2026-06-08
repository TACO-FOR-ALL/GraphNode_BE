/**
 * GraphNode File Service internal API 클라이언트.
 */
import axios, { AxiosError, type AxiosInstance } from 'axios';

import type {
  FileServicePort,
  ImportCompleteDto,
  ImportFinalizeClaimDto,
  ImportJobStatusDto,
  ImportProviderDescriptor,
  ImportUploadInitDto,
  PresignedFileAccessDto,
} from '../../core/ports/FileServicePort';
import { getCorrelationId } from '../../shared/context/requestStore';
import { logger } from '../../shared/utils/logger';
import { UpstreamError, UpstreamTimeout } from '../../shared/errors/domain';

export interface FileServiceClientConfig {
  baseURL: string;
  apiKey: string;
  timeoutMs?: number;
}

export class FileServiceClient implements FileServicePort {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(config: FileServiceClientConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseURL.replace(/\/$/, ''),
      timeout: config.timeoutMs ?? 120_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  private headers(userId: string): Record<string, string> {
    const h: Record<string, string> = {
      'X-Internal-Api-Key': this.apiKey,
      'X-User-Id': userId,
    };
    const correlationId = getCorrelationId();
    if (correlationId) h['X-Correlation-Id'] = correlationId;
    return h;
  }

  private async request<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') {
        throw new UpstreamTimeout('File Service timeout', { service: 'FileService' });
      }
      const status = ax.response?.status;
      const detail =
        (ax.response?.data as { detail?: string })?.detail ??
        (ax.response?.data as { message?: string })?.message ??
        ax.message;
      logger.error({ status, detail, service: 'FileService' }, 'File Service request failed');
      throw new UpstreamError('File Service error', {
        service: 'FileService',
        status,
        detail,
      });
    }
  }

  async listProviders(userId: string): Promise<ImportProviderDescriptor[]> {
    const data = await this.request(async () => {
      const res = await this.client.get<{ providers: ImportProviderDescriptor[] }>(
        '/internal/import-providers',
        { headers: this.headers(userId) }
      );
      return res.data;
    });
    return data.providers;
  }

  async initImportUpload(
    userId: string,
    provider: string,
    originalName: string,
    sizeBytes: number
  ): Promise<ImportUploadInitDto> {
    return this.request(async () => {
      const res = await this.client.post<ImportUploadInitDto>(
        '/internal/imports/init',
        { provider, originalName, sizeBytes },
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async startImport(userId: string, jobId: string): Promise<{ jobId: string; status: string }> {
    return this.request(async () => {
      const res = await this.client.post<{ jobId: string; status: string }>(
        `/internal/imports/${jobId}/start`,
        {},
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async getJob(userId: string, jobId: string): Promise<ImportJobStatusDto> {
    return this.request(async () => {
      const res = await this.client.get<ImportJobStatusDto>(`/internal/imports/${jobId}`, {
        headers: this.headers(userId),
      });
      return res.data;
    });
  }

  async getResult(userId: string, jobId: string): Promise<ImportCompleteDto> {
    return this.request(async () => {
      const res = await this.client.get<ImportCompleteDto>(`/internal/imports/${jobId}/result`, {
        headers: this.headers(userId),
      });
      return res.data;
    });
  }

  async claimFinalize(userId: string, jobId: string): Promise<ImportFinalizeClaimDto> {
    return this.request(async () => {
      const res = await this.client.post<ImportFinalizeClaimDto>(
        `/internal/imports/${jobId}/finalize/claim`,
        {},
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async completeFinalize(userId: string, jobId: string, conversationIds: string[]): Promise<void> {
    await this.request(async () => {
      await this.client.post(
        `/internal/imports/${jobId}/finalize/complete`,
        { conversationIds },
        { headers: this.headers(userId) }
      );
    });
  }

  async failFinalize(userId: string, jobId: string, error: string): Promise<void> {
    await this.request(async () => {
      await this.client.post(
        `/internal/imports/${jobId}/finalize/fail`,
        { error },
        { headers: this.headers(userId) }
      );
    });
  }

  async cancelJob(userId: string, jobId: string): Promise<void> {
    await this.request(async () => {
      await this.client.delete(`/internal/imports/${jobId}`, {
        headers: this.headers(userId),
      });
    });
  }

  async presignFileAccess(
    userId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedFileAccessDto> {
    return this.request(async () => {
      const res = await this.client.get<PresignedFileAccessDto>(`/internal/files/${fileId}/presign`, {
        headers: this.headers(userId),
        params: options?.disposition ? { disposition: options.disposition } : undefined,
      });
      return res.data;
    });
  }
}
