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
 * 시나리오 3: 노드 추가 (Add Node — 대화 + 노트 혼합)
 * - 기존에 생성된 그래프에 새로운 대화와 노트를 동시에 삽입하고 AddNode를 호출합니다.
 * - 비동기 AI 파이프라인이 완료된 후 graph_nodes에 대화 노드(sourceType: 'chat')와
 *   노트 노드(sourceType: 'markdown')가 모두 저장되었는지 검증합니다.
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
      // 최대 10분 동안 10초 간격으로 DB 상태 확인 (60회 시도)
      for (let i = 0; i < 60; i++) {
        const stats = await db.collection('graph_stats').findOne({ userId });
        if (stats && stats.status === 'CREATED') {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for graph creation... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
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
      // 최대 10분 동안 10초 간격으로 확인
      for (let i = 0; i < 60; i++) {
        const summary = await db.collection('graph_summaries').findOne({ userId });
        if (summary) {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for summary... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } finally {
      await mongoClient.close();
    }

    expect(isFinished).toBe(true);
    console.log('\nGraph summary confirmed in DB.');
  });

  it('Scenario 3: Add Node to existing Graph (Conversation + Note)', async () => {
    console.log('\n--- Starting Scenario 3: Add Node (Conversation + Note) ---');

    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db();

    try {
      // 0. 기준점(baseline) 설정
      // 현재 시각을 lastGraphUpdatedAt 기준점으로 graph_stats에 주입합니다.
      // 이후 삽입하는 대화/노트의 updatedAt이 이 기준점보다 커야 AddNode에서 필터링됩니다.
      const baselineTime = new Date();
      await db.collection('graph_stats').updateOne(
        { userId },
        { $set: { status: 'CREATED', updatedAt: baselineTime.toISOString() } },
        { upsert: true }
      );

      // 기준점보다 5초 미래 시각으로 신규 데이터를 생성하여 필터링 조건을 확실히 충족합니다.
      const futureMs = baselineTime.getTime() + 5000;
      const futureDate = new Date(futureMs);

      // 1. 신규 대화 + 메시지 삽입
      const newConvId = `conv-incremental-${Date.now()}`;
      await db.collection('conversations').insertOne({
        _id: newConvId,
        ownerUserId: userId,
        title: 'Incremental Test Chat',
        updatedAt: futureMs,
        createdAt: futureMs,
      } as any);

      await db.collection('messages').insertOne({
        _id: `msg-incremental-${Date.now()}`,
        conversationId: newConvId,
        ownerUserId: userId,
        role: 'user',
        content: 'Adding a new conversation node for incremental testing.',
        createdAt: futureMs,
        updatedAt: futureMs,
      } as any);

      console.log(`Inserted conversation: ${newConvId}`);

      // 2. 신규 노트 삽입 (AddNode 노트 통합 검증용)
      // updatedAt을 Date 객체로 삽입: NoteService.findNotesModifiedSince가 Date 비교 쿼리를 수행합니다.
      const newNoteId = `note-incremental-${Date.now()}`;
      await db.collection('notes').insertOne({
        _id: newNoteId,
        ownerUserId: userId,
        title: 'Incremental Test Note',
        content: [
          '# Incremental Note',
          '',
          'This note was inserted for AddNode incremental testing.',
          '',
          '## Knowledge Graphs',
          '',
          'Knowledge graphs connect concepts extracted from both conversations and markdown notes.',
          'Each note section becomes a unit of knowledge in the graph.',
        ].join('\n'),
        deletedAt: null,
        createdAt: futureDate,
        updatedAt: futureDate,
      } as any);

      console.log(`Inserted note: ${newNoteId}`);

      // 3. AddNode API 호출 — 대화 + 노트 동시 처리
      const response = await apiClient.post('/v1/graph-ai/add-node');
      expect(response.status).toBe(202);

      const taskId = response.data.taskId;
      console.log(`Add Node Task Enqueued: ${taskId}`);

      // 4. 상태 폴링: UPDATING → UPDATED 전환 대기 (최대 10분, 10초 간격)
      let isUpdating = false;
      let isFinished = false;

      for (let i = 0; i < 60; i++) {
        const stats = await db.collection('graph_stats').findOne({ userId });
        if (stats && stats.status === 'UPDATING') {
          isUpdating = true;
        }
        if (isUpdating && stats && stats.status === 'UPDATED') {
          isFinished = true;
          break;
        }
        if (i % 6 === 0) process.stdout.write(`\n--- Waiting for node addition... (${i * 10}s) `);
        process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      expect(isFinished).toBe(true);
      console.log('\nNode addition process completed (status: UPDATED).');

      // 5. 대화 노드 저장 검증: sourceType이 'chat'이어야 합니다.
      const convNode = await db.collection('graph_nodes').findOne({
        userId,
        origId: newConvId,
      });
      expect(convNode).not.toBeNull();
      expect(convNode?.sourceType).toBe('chat');
      console.log(`Conversation node verified — origId: ${newConvId}, sourceType: chat`);

      // 6. 노트 노드 저장 검증: sourceType이 'markdown'이어야 합니다.
      const noteNode = await db.collection('graph_nodes').findOne({
        userId,
        origId: newNoteId,
      });
      expect(noteNode).not.toBeNull();
      expect(noteNode?.sourceType).toBe('markdown');
      console.log(`Note node verified — origId: ${newNoteId}, sourceType: markdown`);

    } finally {
      await mongoClient.close();
    }
  });
});
