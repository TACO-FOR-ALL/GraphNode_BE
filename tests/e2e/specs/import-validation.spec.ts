import { it, expect, beforeAll } from '@jest/globals';

import { apiClient } from '../utils/api-client';
import { describeImportE2e } from '../utils/import-e2e-scope';
import { seedTestData } from '../utils/db-seed';
import {
  initImportUpload,
  startImport,
  finalizeImport,
  uploadZipToPresignedUrl,
} from '../utils/import-e2e-helper';
import { buildMinimalOpenAiExportZip } from '../utils/build-minimal-export-zip';

describeImportE2e('Import validation errors', () => {
  beforeAll(async () => {
    await seedTestData();
  });

  it('rejects non-zip originalName on init', async () => {
    const res = await apiClient.post('/v1/imports/init', {
      provider: 'openai',
      originalName: 'export.json',
      sizeBytes: 1024,
    });
    expect(res.status).toBe(400);
  });

  it('rejects start without staging upload', async () => {
    const zip = buildMinimalOpenAiExportZip();
    const init = await initImportUpload(zip.length);
    const res = await startImport(init.jobId);
    expect(res.status).toBe(400);
    expect(String(res.data.detail ?? '')).toMatch(/upload|staging|ZIP/i);
  });

  it('rejects duplicate start', async () => {
    const zip = buildMinimalOpenAiExportZip();
    const init = await initImportUpload(zip.length);
    await uploadZipToPresignedUrl(init.uploadUrl, init.uploadHeaders, zip);
    const first = await startImport(init.jobId);
    expect(first.status).toBe(202);
    const second = await startImport(init.jobId);
    expect(second.status).toBe(409);
  });

  it('rejects finalize before job completed', async () => {
    const zip = buildMinimalOpenAiExportZip();
    const init = await initImportUpload(zip.length);
    await uploadZipToPresignedUrl(init.uploadUrl, init.uploadHeaders, zip);
    const startRes = await startImport(init.jobId);
    expect(startRes.status).toBe(202);
    const fin = await finalizeImport(init.jobId);
    expect(fin.status).toBe(409);
  });

  it('returns 404 for unknown jobId', async () => {
    const res = await apiClient.get('/v1/imports/01NONEXISTENTJOBID000000');
    expect(res.status).toBe(404);
  });
});
