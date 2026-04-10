import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/graphnode';
const TEST_USER_ID = 'user-12345';

const prisma = new PrismaClient();

/**
 * 통합 테스트(E2E)를 위한 기초 데이터를 DB에 주입하는 유틸리티 메서드
 * 
 * 책임:
 * 1. PostgreSQL(Prisma): 테스트용 유저 계정(user-12345) 생성 또는 갱신
 * 2. MongoDB: 기존 데이터 클린업 및 대화(Conversation), 메시지(Message), 노트(Note) 기초 데이터 생성
 * 
 * 목적: 
 * - 그래프 생성 및 분석 로직이 작동하기 위해 반드시 존재해야 하는 '원본 데이터'를 강제 주입하여
 *   외부 연동 API를 호출하기 전 상태를 빌드합니다.
 */
export async function seedTestData() {
  console.log('--- Starting DB Seeding ---');
  
  // 1. PostgreSQL (via Prisma) - User Seed
  // 유저 프로필 조회 API나 소유권 검증 로직 통과를 위해 필요
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: {},
    create: {
      id: TEST_USER_ID,
      provider: 'google',
      providerUserId: 'google-test-id-123',
      email: 'test@example.com',
      displayName: 'E2E Test User',
      preferredLanguage: 'en',
    },
  });
  console.log('MySQL/PSQL User seeded.');

  // 2. MongoDB Seed
  const mongoClient = new MongoClient(MONGO_URI);
  try {
    await mongoClient.connect();
    const db = mongoClient.db();

    // 이전 테스트의 잔여 데이터로 인한 충돌 방지를 위해 해당 유저 데이터 전체 삭제
    await db.collection('conversations').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('messages').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('notes').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('graph_nodes').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_edges').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_clusters').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_stats').deleteMany({ userId: TEST_USER_ID });

    // Seed Conversation: 그래프 생성의 원본 데이터가 될 대화방
    const convId = 'conv-e2e-123';
    const nowTimestamp = Date.now();
    await db.collection('conversations').insertOne({
      _id: convId,
      ownerUserId: TEST_USER_ID,
      title: 'E2E Test Chat',
      updatedAt: nowTimestamp,
      createdAt: nowTimestamp,
    } as any);

    // Seed Message: 지식 추출의 핵심이 되는 대화 내용
    // AI 파이프라인은 최소 1개 이상의 User-Assistant 쌍이 있어야 노드를 추출합니다.
    await db.collection('messages').insertMany([
      {
        _id: 'msg-e2e-123-u',
        conversationId: convId,
        ownerUserId: TEST_USER_ID,
        role: 'user',
        content: 'Hello, this is a test message for graph generation. Artificial intelligence and Knowledge Graphs are interesting.',
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      },
      {
        _id: 'msg-e2e-123-a',
        conversationId: convId,
        ownerUserId: TEST_USER_ID,
        role: 'assistant',
        content: 'I agree! Knowledge graphs provide a structured way to represent information, which is very useful for LLMs.',
        createdAt: nowTimestamp + 1000,
        updatedAt: nowTimestamp + 1000,
      }
    ] as any);

    // Seed Note: 노트 기반 요약 및 Microscope 분석을 위한 원본 문서
    await db.collection('notes').insertOne({
      _id: 'note-e2e-123',
      ownerUserId: TEST_USER_ID,
      title: 'E2E Test Note',
      content: 'This note discusses the relationship between LLMs and Graph structures.',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    console.log('MongoDB data seeded.');
  } finally {
    await mongoClient.close();
    await prisma.$disconnect();
  }
  console.log('--- DB Seeding Completed ---');
}

if (require.main === module) {
  seedTestData().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
