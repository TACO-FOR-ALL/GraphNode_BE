import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { seedTestData } from '../utils/db-seed';
import { MongoClient } from 'mongodb';

/**
 * Microscope 엔드투엔드(E2E) 테스트 스펙
 * 
 * 시나리오 3: Microscope 분석 인입 (Microscope Ingest)
 * - 특정 노드를 기반으로 심층 분석 워크스페이스를 생성하고, 
 *   AI가 문서 분석을 완료하여 'COMPLETED' 상태가 되는지 검증합니다.
 */
describe('End-to-End Microscope Flow', () => {
  const userId = getTestUserId();
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';

  beforeAll(async () => {
    await seedTestData();
  });

  it('Scenario 3: Microscope Ingest from Note', async () => {
    console.log('\n--- Starting Scenario 3: Microscope Ingest ---');

    // 1. 특정 노드(여기서는 Note) 기반 Microscope 분석 시작
    const payload = {
        nodeId: 'note-e2e-123',
        nodeType: 'note',
        schemaName: 'test_schema'
    };
    
    const response = await apiClient.post('/v1/microscope/nodes/ingest', payload);
    expect(response.status).toBe(201);
    
    const workspaceId = response.data._id;
    const docId = response.data.documents[0].id;
    console.log(`Microscope Task Enqueued: ${docId} in Workspace: ${workspaceId}`);

    // 2. 워크스페이스 문서 상태 확인 폴링
    let isFinished = false;
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      // 최대 30분 동안 10초 간격으로 상태 확인 (180회 시도)
      for (let i = 0; i < 180; i++) {
        const workspace = await db.collection('microscope_workspaces').findOne({ _id: workspaceId });
        const doc = workspace?.documents.find((d: any) => d.id === docId);
        
        // AI 엔진 처리가 끝나면 상태가 'COMPLETED'로 전이됨
        if (doc && doc.status === 'COMPLETED') {
          isFinished = true;
          break;
        } else if (doc && doc.status === 'FAILED') {
            throw new Error(`Microscope ingest failed: ${doc.error}`);
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for microscope ingest... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nMicroscope ingest confirmed in DB.');
  });
});
