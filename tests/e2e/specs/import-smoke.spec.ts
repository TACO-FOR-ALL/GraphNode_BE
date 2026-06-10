import { it, expect, beforeAll } from '@jest/globals';
import axios from 'axios';

import { apiClient, createApiClient, getTestUserId } from '../utils/api-client';
import { describeImportE2e } from '../utils/import-e2e-scope';
import { seedTestData } from '../utils/db-seed';
import { initImportUpload } from '../utils/import-e2e-helper';
import { buildMinimalOpenAiExportZip } from '../utils/build-minimal-export-zip';

describeImportE2e('Import smoke (BE ↔ File Service)', () => {
  beforeAll(async () => {
    await seedTestData();
  });

  it('lists import providers', async () => {
    const res = await apiClient.get('/v1/import-providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.providers)).toBe(true);
    expect(res.data.providers.some((p: { slug: string }) => p.slug === 'openai')).toBe(true);
  });

  it('returns 401 without internal token', async () => {
    const res = await axios.get(`${process.env.API_BASE_URL || 'http://localhost:3000'}/v1/import-providers`, {
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when another user accesses a job', async () => {
    const zip = buildMinimalOpenAiExportZip();
    const init = await initImportUpload(zip.length);
    const other = createApiClient('user-other-e2e');
    const res = await other.get(`/v1/imports/${init.jobId}`);
    expect(res.status).toBe(404);
    expect(getTestUserId()).not.toBe('user-other-e2e');
  });
});
