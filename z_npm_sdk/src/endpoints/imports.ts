import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  ImportFinalizeResponse,
  ImportJobStatusDto,
  ImportProviderDescriptor,
  PresignedFileAccessDto,
} from '../types/import.js';

/** AI export archive import API. */
export class ImportsApi {
  constructor(private readonly rb: RequestBuilder) {}

  listProviders(): Promise<HttpResponse<{ providers: ImportProviderDescriptor[] }>> {
    return this.rb.path('/v1/import-providers').get<{ providers: ImportProviderDescriptor[] }>();
  }

  createImport(
    provider: string,
    zipFile: File | Blob
  ): Promise<HttpResponse<{ jobId: string; status: string }>> {
    const form = new FormData();
    form.append('provider', provider);
    form.append('file', zipFile);
    return this.rb.path('/v1/imports').post<{ jobId: string; status: string }>(form);
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

  getFileAccessUrl(
    fileId: string,
    options?: { disposition?: 'inline' | 'attachment' }
  ): Promise<HttpResponse<PresignedFileAccessDto>> {
    const base = `/v1/files/${fileId}/access-url`;
    const path = options?.disposition ? `${base}?disposition=${options.disposition}` : base;
    return this.rb.path(path).get<PresignedFileAccessDto>();
  }
}
