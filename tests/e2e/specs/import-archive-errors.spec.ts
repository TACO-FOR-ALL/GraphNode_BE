import { it, expect, beforeAll } from '@jest/globals';

import { describeImportE2e } from '../utils/import-e2e-scope';
import { seedTestData } from '../utils/db-seed';
import {
  initImportUpload,
  uploadZipToPresignedUrl,
  startImport,
  pollImportJob,
} from '../utils/import-e2e-helper';
import { buildEmptyZip } from '../utils/build-minimal-export-zip';

describeImportE2e('Import archive processing errors', () => {
  beforeAll(async () => {
    await seedTestData();
  });

  it('marks job failed when archive has no conversation shards', async () => {
    const zip = buildEmptyZip();
    const init = await initImportUpload(zip.length);
    await uploadZipToPresignedUrl(init.uploadUrl, init.uploadHeaders, zip);
    const startRes = await startImport(init.jobId);
    expect(startRes.status).toBe(202);

    const job = await pollImportJob(init.jobId, { until: 'failed', timeoutMs: 90_000 });
    expect(job.status).toBe('failed');
    expect(job.error).toBeDefined();
    const code = (job.error as { code?: string })?.code ?? '';
    expect(code === 'IMPORT_PARSE_FAILED' || code === 'INVALID_ARCHIVE').toBe(true);
  });
});
