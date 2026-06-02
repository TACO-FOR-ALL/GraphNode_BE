import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { E2E_MACRO_USER_FILE_SEEDS, seedTestData } from '../utils/db-seed';
import { assertAddNodeBundleUploaded } from '../utils/localstack-s3';
import { MongoClient } from 'mongodb';
import { createNeo4jE2eDriver } from '../utils/neo4j-test-driver';

/**
 * @description AddNode E2E용 Neo4j MacroStats(기존 그래프 존재) 시드입니다.
 * @param userId 테스트 사용자 ID입니다.
 */
async function seedNeo4jMacroStatsForAddNode(userId: string): Promise<void> {
  const driver = createNeo4jE2eDriver();
  const session = driver.session();
  try {
    await session.run(
      `
      MERGE (g:MacroGraph {userId: $userId})
      MERGE (g)-[:HAS_STATS]->(st:MacroStats {userId: $userId})
      SET st.status = 'CREATED',
          st.nodes = 1,
          st.edges = 0,
          st.clusters = 1,
          st.updatedAt = datetime('2020-01-01T00:00:00Z'),
          st.generatedAt = datetime()
      `,
      { userId }
    );
  } finally {
    await session.close();
    await driver.close();
  }
}

/**
 * AddNode raw file bundle S3 검증 (LLM 불필요).
 * `npm run e2e:bundle` 에 포함됩니다.
 */
describe('AddNode raw file S3 bundle', () => {
  const userId = getTestUserId();
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';

  beforeAll(async () => {
    await seedTestData();
    await seedNeo4jMacroStatsForAddNode(userId);
  });

  it('uploads add-node prefix bundle when a user_file is modified after graph exists', async () => {
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      const touchFile = E2E_MACRO_USER_FILE_SEEDS[0];
      await db.collection('user_files').updateOne(
        { _id: touchFile._id },
        { $set: { updatedAt: new Date() } }
      );

      const response = await apiClient.post('/v1/graph-ai/add-node');
      expect(response.status).toBe(202);
      expect(response.data.taskId).toBeTruthy();

      await assertAddNodeBundleUploaded({
        taskId: response.data.taskId,
        userFiles: [{ id: touchFile._id, displayName: touchFile.displayName }],
      });
    } finally {
      await mongoClient.close();
    }
  });
});
