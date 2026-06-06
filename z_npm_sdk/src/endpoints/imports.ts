import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  ImportFinalizeResponse,
  ImportJobStatusDto,
  ImportProviderDescriptor,
  ImportUploadInitDto,
  PresignedFileAccessDto,
} from '../types/import.js';

/** AI export archive import API. */
export class ImportsApi {
  constructor(private readonly rb: RequestBuilder) {}

  listProviders(): Promise<HttpResponse<{ providers: ImportProviderDescriptor[] }>> {
    return this.rb.path('/v1/import-providers').get<{ providers: ImportProviderDescriptor[] }>();
  }

  /** presigned PUT 1단계 — uploadUrl 로 ZIP 직접 PUT */
  initUpload(
    provider: string,
    originalName: string,
    sizeBytes: number
  ): Promise<HttpResponse<ImportUploadInitDto>> {
    return this.rb.path('/v1/imports/init').post<ImportUploadInitDto>({
      provider,
      originalName,
      sizeBytes,
    });
  }

  /** presigned PUT 2단계 — S3 업로드 후 worker enqueue */
  startImport(jobId: string): Promise<HttpResponse<{ jobId: string; status: string }>> {
    return this.rb.path(`/v1/imports/${jobId}/start`).post<{ jobId: string; status: string }>({});
  }

  /**
   * ZIP 1회 업로드 (init → S3 PUT → start).
   * S3 PUT 은 브라우저 fetch 로 presigned URL 에 직접 전송합니다.
   */
  async uploadImport(
    provider: string,
    zipFile: File | Blob,
    fileName = 'export.zip'
  ): Promise<HttpResponse<{ jobId: string; status: string }>> {
    const sizeBytes = zipFile.size;
    const init = await this.initUpload(provider, fileName, sizeBytes);
    if (!init.isSuccess) {
      return init as HttpResponse<{ jobId: string; status: string }>;
    }

    const putRes = await fetch(init.data.uploadUrl, {
      method: 'PUT',
      headers: init.data.uploadHeaders,
      body: zipFile,
    });

    if (!putRes.ok) {
      let body: unknown;
      try {
        body = await putRes.text();
      } catch {
        body = undefined;
      }
      return {
        isSuccess: false,
        error: {
          statusCode: putRes.status,
          message: `S3 upload failed: HTTP ${putRes.status}`,
          body,
        },
      };
    }

    return this.startImport(init.data.jobId);
  }

  getJob(jobId: string): Promise<HttpResponse<ImportJobStatusDto>> {
    return this.rb.path(`/v1/imports/${jobId}`).get<ImportJobStatusDto>();
  }

  finalize(jobId: string): Promise<HttpResponse<ImportFinalizeResponse>> {
    return this.rb.path(`/v1/imports/${jobId}/finalize`).post<ImportFinalizeResponse>({});
  }

  cancelJob(jobId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/v1/imports/${jobId}`).delete<void>();
  }

  /**
   * Import 첨부 fileId → S3 presigned GET URL 발급.
   * FE는 응답 `url`로 이미지 표시(inline) 또는 파일 다운로드(attachment)를 수행합니다.
   */
  getFileAccessUrl(
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<HttpResponse<PresignedFileAccessDto>> {
    const base = `/v1/files/${fileId}/access-url`;
    const path = options?.disposition ? `${base}?disposition=${options.disposition}` : base;
    return this.rb.path(path).get<PresignedFileAccessDto>();
  }
}
