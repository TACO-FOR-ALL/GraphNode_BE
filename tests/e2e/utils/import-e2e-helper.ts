import axios from 'axios';

import { apiClient, getTestUserId } from './api-client';

const POLL_INTERVAL_MS = 1500;
const DEFAULT_JOB_TIMEOUT_MS = 120_000;

/** File Service presigned URL은 Docker 내부 호스트(localstack) — 호스트 Jest에서는 localhost로 치환 */
function rewritePresignedUrlForHost(uploadUrl: string): string {
  const hostEndpoint = process.env.AWS_ENDPOINT_URL || 'http://127.0.0.1:4566';
  try {
    const target = new URL(hostEndpoint);
    const parsed = new URL(uploadUrl);
    parsed.hostname = target.hostname;
    parsed.port = target.port;
    parsed.protocol = target.protocol;
    return parsed.toString();
  } catch {
    return uploadUrl
      .replace('://localstack:', '://127.0.0.1:')
      .replace('://localstack/', '://127.0.0.1:4566/');
  }
}

export type ImportInitResponse = {
  jobId: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
};

export async function initImportUpload(
  zipByteLength: number,
  originalName = 'e2e-export.zip'
): Promise<ImportInitResponse> {
  const res = await apiClient.post('/v1/imports/init', {
    provider: 'openai',
    originalName,
    sizeBytes: zipByteLength,
  });
  if (res.status !== 201) {
    throw new Error(`init failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return {
    jobId: res.data.jobId,
    uploadUrl: res.data.uploadUrl,
    uploadHeaders: res.data.uploadHeaders ?? {},
  };
}

export async function uploadZipToPresignedUrl(
  uploadUrl: string,
  headers: Record<string, string>,
  body: Buffer
): Promise<void> {
  const hostUploadUrl = rewritePresignedUrlForHost(uploadUrl);
  const res = await axios.put(hostUploadUrl, body, {
    headers,
    maxBodyLength: Infinity,
    validateStatus: () => true,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`S3 PUT failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
}

export async function startImport(jobId: string) {
  return apiClient.post(`/v1/imports/${jobId}/start`, {});
}

export async function getImportJob(jobId: string) {
  return apiClient.get(`/v1/imports/${jobId}`);
}

export async function finalizeImport(jobId: string) {
  return apiClient.post(`/v1/imports/${jobId}/finalize`, {});
}

export async function pollImportJob(
  jobId: string,
  options: {
    until: 'completed' | 'failed';
    timeoutMs?: number;
  }
): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await getImportJob(jobId);
    if (res.status !== 200) {
      throw new Error(`getJob failed: ${res.status} ${JSON.stringify(res.data)}`);
    }
    const status = res.data.status as string;
    if (options.until === 'completed' && status === 'completed') {
      return res.data;
    }
    if (options.until === 'failed' && status === 'failed') {
      return res.data;
    }
    if (status === 'failed' && options.until === 'completed') {
      throw new Error(`job failed: ${JSON.stringify(res.data.error)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`pollImportJob timeout (jobId=${jobId}, until=${options.until})`);
}

/**
 * init → presigned PUT → start → poll completed → sync finalize.
 */
export async function runFullImportFlow(zip: Buffer) {
  const userId = getTestUserId();
  const init = await initImportUpload(zip.length);
  await uploadZipToPresignedUrl(init.uploadUrl, init.uploadHeaders, zip);

  const startRes = await startImport(init.jobId);
  if (startRes.status !== 202) {
    throw new Error(`start failed: ${startRes.status} ${JSON.stringify(startRes.data)}`);
  }

  await pollImportJob(init.jobId, { until: 'completed' });

  const finalizeRes = await finalizeImport(init.jobId);
  return { userId, jobId: init.jobId, init, startRes, finalizeRes };
}
