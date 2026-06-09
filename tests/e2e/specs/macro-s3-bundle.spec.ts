import { describe, it, expect, beforeAll } from '@jest/globals';

import { apiClient } from '../utils/api-client';
import { E2E_MACRO_USER_FILE_SEEDS, seedTestData } from '../utils/db-seed';
import { assertMacroGraphBundleUploaded } from '../utils/localstack-s3';

/**
 * Macro S3 prefix bundle BE 업로드 전용 E2E.
 *
 * Infisical/프로덕션 DB가 아닌 docker-compose.test.yml + LocalStack 환경에서
 * `POST /v1/graph-ai/generate` 직후 S3 `graph-generation/{taskId}/` 구조를 검증합니다.
 */
const e2eScope = (process.env.E2E_SCOPE || 'bundle').trim().toLowerCase();
const describeBundle = e2eScope === 'import' ? describe.skip : describe;

describeBundle('Macro S3 prefix bundle (BE upload)', () => {
  beforeAll(async () => {
    await seedTestData();
  });

  it('uploads input.json, notes.json, and files/* into graph-generation/{taskId}/ prefix', async () => {
    const response = await apiClient.post('/v1/graph-ai/generate', { includeSummary: false });
    expect(response.status).toBe(202);
    expect(response.data.status).toBe('queued');

    const taskId = response.data.taskId as string;
    expect(taskId).toMatch(/^task_user-12345_/);

    await assertMacroGraphBundleUploaded({
      taskId,
      userFiles: E2E_MACRO_USER_FILE_SEEDS.map((f) => ({
        id: f._id,
        displayName: f.displayName,
      })),
    });
  });
});
