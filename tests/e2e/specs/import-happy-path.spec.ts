import { it, expect, beforeAll } from '@jest/globals';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

import { getTestUserId } from '../utils/api-client';
import { describeImportE2e } from '../utils/import-e2e-scope';
import { seedTestData } from '../utils/db-seed';
import { runFullImportFlow } from '../utils/import-e2e-helper';
import { buildMinimalOpenAiExportZip } from '../utils/build-minimal-export-zip';
import { assertImportConversationsInMongo } from '../utils/import-mongo-assert';
import { createE2eS3Client } from '../utils/e2e-s3-client';

describeImportE2e('Import happy path (sync finalize)', () => {
  beforeAll(async () => {
    await seedTestData();
  });

  it('imports minimal OpenAI ZIP and persists conversations to Mongo', async () => {
    const zip = buildMinimalOpenAiExportZip();
    const { jobId, finalizeRes } = await runFullImportFlow(zip);

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.data.status).toBe('finalized');
    expect(finalizeRes.data.jobId).toBe(jobId);

    const counts = await assertImportConversationsInMongo(getTestUserId(), jobId,
      { minConversations: 1, minMessages: 2 }
    );
    expect(counts.conversationCount).toBeGreaterThanOrEqual(1);
    expect(counts.messageCount).toBeGreaterThanOrEqual(2);

    const bucket = process.env.S3_FILE_BUCKET || 'taco5-graphnode-filedata-chat-and-note-s3';
    const client = createE2eS3Client();
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `import-results/${jobId}/`,
      })
    );
    expect((listed.Contents ?? []).some((o) => o.Key?.endsWith('result.json'))).toBe(true);
  });
});
