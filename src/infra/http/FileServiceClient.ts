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
import { UpstreamTimeout } from '../../shared/errors/domain';
import { mapFileServiceError } from './mapFileServiceError';
import { parseFileServiceProblemDetail } from './fileServiceLog';

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

  private async request<T>(
    path: string,
    userId: string | undefined,
    fn: () => Promise<T>,
    opts?: { quietSuccess?: boolean }
  ): Promise<T> {
    const correlationId = getCorrelationId();
    const started = Date.now();

    try {
      const result = await fn();
      if (!opts?.quietSuccess) {
        logger.info(
          {
            event: 'be.fileservice.request.success',
            correlationId,
            userId,
            path,
            durationMs: Date.now() - started,
          },
          'File Service request succeeded'
        );
      }
      return result;
    } catch (err) {
      const ax = err as AxiosError;
      const durationMs = Date.now() - started;

      if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') {
        logger.error(
          {
            event: 'be.fileservice.request.timeout',
            correlationId,
            userId,
            path,
            durationMs,
            axiosCode: ax.code,
          },
          'File Service request timed out'
        );
        throw new UpstreamTimeout('File Service timeout', { service: 'FileService', path });
      }

      const upstreamStatus = ax.response?.status;
      const upstreamBody = ax.response?.data;
      const upstreamDetail = parseFileServiceProblemDetail(upstreamBody, ax.message);
      const upstreamCode =
        upstreamBody && typeof upstreamBody === 'object'
          ? (upstreamBody as { code?: string }).code
          : undefined;

      const mapped = mapFileServiceError(ax);
      logger.error(
        {
          event: 'be.fileservice.request.failed',
          correlationId,
          userId,
          path,
          durationMs,
          upstreamStatus,
          upstreamCode,
          upstreamDetail,
          errorCode: mapped.code,
          axiosCode: ax.code,
          service: 'FileService',
        },
        'File Service request failed'
      );
      throw mapped;
    }
  }

  async listProviders(userId: string): Promise<ImportProviderDescriptor[]> {
    const data = await this.request('/internal/import-providers', userId, async () => {
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
    return this.request('/internal/imports/init', userId, async () => {
      const res = await this.client.post<ImportUploadInitDto>(
        '/internal/imports/init',
        { provider, originalName, sizeBytes },
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async startImport(userId: string, jobId: string): Promise<{ jobId: string; status: string }> {
    const path = `/internal/imports/${jobId}/start`;
    return this.request(path, userId, async () => {
      const res = await this.client.post<{ jobId: string; status: string }>(
        path,
        {},
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async getJob(userId: string, jobId: string): Promise<ImportJobStatusDto> {
    const path = `/internal/imports/${jobId}`;
    return this.request(path, userId, async () => {
      const res = await this.client.get<ImportJobStatusDto>(path, {
        headers: this.headers(userId),
      });
      return res.data;
    }, { quietSuccess: true });
  }

  async getResult(userId: string, jobId: string): Promise<ImportCompleteDto> {
    const path = `/internal/imports/${jobId}/result`;
    return this.request(path, userId, async () => {
      const res = await this.client.get<ImportCompleteDto>(path, {
        headers: this.headers(userId),
      });
      return res.data;
    });
  }

  async claimFinalize(userId: string, jobId: string): Promise<ImportFinalizeClaimDto> {
    const path = `/internal/imports/${jobId}/finalize/claim`;
    return this.request(path, userId, async () => {
      const res = await this.client.post<ImportFinalizeClaimDto>(
        path,
        {},
        { headers: this.headers(userId) }
      );
      return res.data;
    });
  }

  async completeFinalize(userId: string, jobId: string, conversationIds: string[]): Promise<void> {
    const path = `/internal/imports/${jobId}/finalize/complete`;
    await this.request(path, userId, async () => {
      await this.client.post(path, { conversationIds }, { headers: this.headers(userId) });
    });
  }

  async failFinalize(userId: string, jobId: string, error: string): Promise<void> {
    const path = `/internal/imports/${jobId}/finalize/fail`;
    await this.request(path, userId, async () => {
      await this.client.post(path, { error }, { headers: this.headers(userId) });
    });
  }

  async cancelJob(userId: string, jobId: string): Promise<void> {
    const path = `/internal/imports/${jobId}`;
    await this.request(path, userId, async () => {
      await this.client.delete(path, { headers: this.headers(userId) });
    });
  }

  async presignFileAccess(
    userId: string,
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<PresignedFileAccessDto> {
    const path = `/internal/files/${fileId}/presign`;
    return this.request(path, userId, async () => {
      const res = await this.client.get<PresignedFileAccessDto>(path, {
        headers: this.headers(userId),
        params: options?.disposition ? { disposition: options.disposition } : undefined,
      });
      return res.data;
    });
  }
}
