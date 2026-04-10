import { describe, it, expect, beforeAll } from '@jest/globals';
import { apiClient, getTestUserId } from '../utils/api-client';
import { seedTestData } from '../utils/db-seed';
import { MongoClient } from 'mongodb';
import { GraphNodeDoc, GraphStatsDoc } from '../../../src/core/types/persistence/graph.persistence';

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
      // 0. 사전 상태 기록 (Rigorous Verification 용)
      // 시드된 기존 노드(conv-e2e-123)의 정보를 미리 가져옵니다.
      const initialNode = await db.collection<GraphNodeDoc>('graph_nodes').findOne({
        userId,
        origId: 'conv-e2e-123',
      });
      
      if (!initialNode) {
        throw new Error('Initial node for conv-e2e-123 not found. Check db-seed.');
      }

      const oldUpdatedAt = initialNode.updatedAt;
      const oldNumMessages = initialNode.numMessages || 0;
      console.log(`Initial node state for conv-e2e-123: updatedAt=${oldUpdatedAt}, numMessages=${oldNumMessages}`);

      // 1. 기준점(baseline) 설정
      const baselineTime = new Date();
      await db.collection<GraphStatsDoc>('graph_stats').updateOne(
        { userId },
        { $set: { status: 'CREATED', updatedAt: baselineTime.toISOString() } },
        { upsert: true }
      );

      const futureMs = baselineTime.getTime() + 5000;
      const futureDate = new Date(futureMs);

      // 2. [기존 데이터 업데이트] conv-e2e-123에 새로운 메시지 쌍 추가
      await db.collection('messages').insertMany([
        {
          _id: `msg-incremental-update-u-${Date.now()}`,
          conversationId: 'conv-e2e-123',
          ownerUserId: userId,
          role: 'user',
          content: 'I want to add more information about Graph Neural Networks.',
          createdAt: futureMs,
          updatedAt: futureMs,
        },
        {
          _id: `msg-incremental-update-a-${Date.now()}`,
          conversationId: 'conv-e2e-123',
          ownerUserId: userId,
          role: 'assistant',
          content: 'GNNs are powerful tools for processing structured graph data.',
          createdAt: futureMs + 1000,
          updatedAt: futureMs + 1000,
        }
      ] as any);

      // 대화방의 updatedAt도 갱신하여 AddNode가 감지하게 함
      await db.collection('conversations').updateOne(
        { _id: 'conv-e2e-123' } as any,
        { $set: { updatedAt: futureMs + 2000 } }
      );
      console.log('Updated existing conversation: conv-e2e-123 with new messages.');

      // 3. [신규 데이터 추가] incremental 대화 + 메시지 삽입
      const newConvId = `conv-incremental-${Date.now()}`;
      await db.collection('conversations').insertOne({
        _id: newConvId,
        ownerUserId: userId,
        title: 'Incremental Test Chat',
        updatedAt: futureMs,
        createdAt: futureMs,
      } as any);

      await db.collection('messages').insertMany([
        {
          _id: `msg-incremental-user-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'user',
          content: 'Adding a new conversation node for incremental testing.',
          createdAt: futureMs,
          updatedAt: futureMs,
        },
        {
          _id: `msg-incremental-assistant-${Date.now()}`,
          conversationId: newConvId,
          ownerUserId: userId,
          role: 'assistant',
          content: 'Incremental graph testing adds new nodes to an existing knowledge graph.',
          createdAt: futureMs + 1000,
          updatedAt: futureMs + 1000,
        }
      ] as any);

      // 4. [신규 노트 삽입] 
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

      // 5. AddNode API 호출
      const response = await apiClient.post('/v1/graph-ai/add-node');
      expect(response.status).toBe(202);

      // 6. 상태 폴링: UPDATED 전환 대기
      let isFinished = false;
      for (let i = 0; i < 60; i++) {
        const stats = await db.collection<GraphStatsDoc>('graph_stats').findOne({ userId });
        if (stats && stats.status === 'UPDATED') {
          isFinished = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      expect(isFinished).toBe(true);

      // 7. [RIGOROUS VERIFICATION - 기존 노드 업데이트]
      const updatedNodes = await db.collection<GraphNodeDoc>('graph_nodes').find({
        userId,
        origId: 'conv-e2e-123',
      }).toArray();
      
      expect(updatedNodes.length).toBe(1); // 중복 없음 확인
      const updatedNode = updatedNodes[0];
      
      console.log(`Updated node state for conv-e2e-123: updatedAt=${updatedNode.updatedAt}, numMessages=${updatedNode.numMessages}`);
      
      // updatedAt 갱신 확인
      expect(new Date(updatedNode.updatedAt).getTime()).toBeGreaterThan(new Date(oldUpdatedAt).getTime());
      
      // numMessages 증가 확인 (기존 1쌍 + 신규 1쌍 = 2여야 함)
      expect(updatedNode.numMessages).toBeGreaterThan(oldNumMessages);
      expect(updatedNode.numMessages).toBe(2);

      // 8. [신규 노드 생성 확인]
      const newConvNode = await db.collection<GraphNodeDoc>('graph_nodes').findOne({ userId, origId: newConvId });
      expect(newConvNode).not.toBeNull();
      
      const newNoteNode = await db.collection<GraphNodeDoc>('graph_nodes').findOne({ userId, origId: newNoteId });
      expect(newNoteNode).not.toBeNull();

      console.log('All rigorous verifications passed: Existing node updated correctly, new nodes created.');

    } finally {
      await mongoClient.close();
    }
  });
});
