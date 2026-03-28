import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { seedTestData } from '../utils/db-seed';
import { MongoClient } from 'mongodb';

/**
 * Graph AI 엔드투엔드(E2E) 테스트 스펙
 * 
 * 시나리오 1: 전체 그래프 생성 (Graph Generation)
 * - 사용자의 대화/노트 데이터를 기반으로 지식 그래프 추출을 요청하고, 
 *   비동기 작업(Worker/AI)이 완료되어 DB에 'CREATED' 상태로 저장되는지 검증합니다.
 * 
 * 시나리오 2: 그래프 요약 (Graph Summary)
 * - 생성된 그래프를 기반으로 AI 요약(Summary) 생성을 요청하고, 
 *   최종적으로 'graph_summaries' 컬렉션에 데이터가 생성되는지 검증합니다.
 * 
 * 시나리오 3: 노드 추가 (Add Node)
 * - 기존에 생성된 그래프에 새로운 데이터(대화 등)를 증분 추출(Incremental Extraction)하여 
 *   노드가 추가되는 과정을 검증합니다.
 */
describe('End-to-End Graph Flow', () => {
  const userId = getTestUserId();
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';

  beforeAll(async () => {
    // 테스트 시작 전 기초 데이터(유저, 원본 메시지 등) 주입
    await seedTestData();
  });

  it('Scenario 1: Full Graph Generation Flow', async () => {
    console.log('--- Starting Scenario 1: Graph Generation ---');

    // 1. 그래프 생성 API 호출 (비동기 요청)
    const response = await apiClient.post('/v1/graph-ai/generate', { includeSummary: true });
    expect(response.status).toBe(202);
    expect(response.data.status).toBe('queued');
    
    const taskId = response.data.taskId;
    console.log(`Task Enqueued: ${taskId}`);

    // 2. 비동기 작업 완료 폴링 (Polling)
    let isFinished = false;
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      // 최대 30분 동안 10초 간격으로 DB 상태 확인 (180회 시도)
      for (let i = 0; i < 180; i++) {
        const stats = await db.collection('graph_stats').findOne({ userId });
        if (stats && stats.status === 'CREATED') {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for graph creation... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nGraph creation confirmed in DB.');
  });

  it('Scenario 2: Graph Summary Flow', async () => {
    console.log('\n--- Starting Scenario 2: Graph Summary ---');

    // 1. 그래프 요약 API 호출
    const response = await apiClient.post('/v1/graph-ai/summary');
    expect(response.status).toBe(202);
    
    const taskId = response.data.taskId;
    console.log(`Summary Task Enqueued: ${taskId}`);

    // 2. 요약 결과 생성 확인 폴링
    let isFinished = false;
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      // 최대 20분 동안 10초 간격으로 확인
      for (let i = 0; i < 120; i++) {
        const summary = await db.collection('graph_summaries').findOne({ userId });
        if (summary) {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for summary... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nGraph summary confirmed in DB.');
  });

  it('Scenario 3: Add Node to existing Graph', async () => {
    console.log('\n--- Starting Scenario 3: Add Node ---');
    
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();
    
    // 증분 추출(Add Node)을 위해서는 기존에 완료된(CREATED) 그래프 통계 정보가 있어야 함
    // 0. 상태 초기화: 현재 시점 기준으로 '완료' 상태의 통계 주입 (기준점 설정)
    await db.collection('graph_stats').updateOne(
        { userId },
        { $set: { status: 'CREATED', updatedAt: new Date().toISOString() } },
        { upsert: true }
    );

    // 1. 실제 '새로운' 대화 데이터 추가 인서트 (실제 시나리오 모사)
    const newConvId = `conv-incremental-${Date.now()}`;
    await db.collection('conversations').insertOne({
      _id: newConvId,
      ownerUserId: userId,
      title: 'Incremental Test Chat',
      updatedAt: Date.now() + 5000, // 기준점보다 5초 미래 시각
      createdAt: Date.now() + 5000,
    } as any);
    
    await db.collection('messages').insertOne({
      _id: `msg-incremental-${Date.now()}`,
      conversationId: newConvId,
      ownerUserId: userId,
      role: 'user',
      content: 'Adding a new node for incremental testing.',
      createdAt: Date.now() + 5000,
      updatedAt: Date.now() + 5000,
    } as any);

    // 2. 노드 추가 API 호출
    const response = await apiClient.post('/v1/graph-ai/add-node');
    expect(response.status).toBe(202);
    
    const taskId = response.data.taskId;
    console.log(`Add Node Task Enqueued: ${taskId}`);

    // 2. 상태 변화 확인 (UPDATING -> CREATED)
    let isUpdating = false;
    let isFinished = false;
    try {
      // 최대 30분 동안 10초 간격으로 확인 (180회 시도)
      for (let i = 0; i < 180; i++) {
        const stats = await db.collection('graph_stats').findOne({ userId });
        // 프로세스 시작 시 'UPDATING'으로 변경됨을 확인
        if (stats && stats.status === 'UPDATING') {
            isUpdating = true;
        }
        // 최종적으로 다시 'CREATED' 상태가 되면 완료
        if (isUpdating && stats && stats.status === 'CREATED') {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for node addition... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nNode addition process completed in DB.');
  });
});
