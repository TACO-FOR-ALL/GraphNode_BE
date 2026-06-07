import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';

import { buildStorageKey, STORAGE_BUCKETS } from '../../../src/config/storageConfig';
import { applyE2eHostEnvForSeed } from './e2e-env';
import { createE2eS3Client } from './e2e-s3-client';
import {
  MINIMAL_DOCX_BYTES,
  MINIMAL_PDF_BYTES,
  MINIMAL_PPTX_BYTES,
  MINIMAL_UNKNOWN_BYTES,
} from '../fixtures/macro-file-stubs';

/** E2E compose 전용 연결 정보(.env의 로컬 PG 계정과 분리) */
applyE2eHostEnvForSeed();

const MONGO_URI = process.env.MONGODB_URI!;
export const TEST_USER_ID = 'user-12345';

/** E2E Macro bundle·Neo4j 검증에 사용하는 mock user_files 정의 */
export const E2E_MACRO_USER_FILE_SEEDS = [
  {
    _id: '01KT1AJS0YPC4C3805641TKH5E',
    displayName: 'e2e-macro-sample.pdf',
    mimeType: 'application/pdf',
    category: 'pdf' as const,
    bytes: MINIMAL_PDF_BYTES,
    summary: 'E2E stub PDF summary for macro graph.',
  },
  {
    _id: '01KT1AKKD3VPE7YGN7QXT46T2E',
    displayName: 'e2e-macro-sample.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'word' as const,
    bytes: MINIMAL_DOCX_BYTES,
    summary: 'E2E stub DOCX summary for macro graph.',
  },
  {
    _id: '01KT1AM2DS2K07GR2VQ600GZDS',
    displayName: 'e2e-macro-sample.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    category: 'ppt' as const,
    bytes: MINIMAL_PPTX_BYTES,
    summary: 'E2E stub PPTX summary for macro graph.',
  },
  {
    _id: '01KT1ANK4W9MP5DDHJ7EXX7C2B',
    displayName: 'e2e-macro-unknown.xyz',
    mimeType: 'application/octet-stream',
    category: 'unknown' as const,
    bytes: MINIMAL_UNKNOWN_BYTES,
    summary: 'E2E stub unknown extension for macro graph.',
  },
] as const;

const prisma = new PrismaClient();

/**
 * @description LocalStack S3에 user_files 원본 바이트를 업로드합니다.
 * @param s3Key `user-files/{userId}/{physicalName}` 형식 키.
 * @param body 파일 바이트.
 * @param contentType MIME 타입.
 */
async function uploadUserFileToS3(s3Key: string, body: Buffer, contentType: string): Promise<void> {
  const bucket = process.env.S3_FILE_BUCKET || process.env.S3_PAYLOAD_BUCKET;
  if (!bucket) {
    console.warn('[E2E Seed] S3_FILE_BUCKET unset — skipping user file upload');
    return;
  }

  const client = createE2eS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    })
  );
  console.log(`[E2E Seed] Uploaded user file to s3://${bucket}/${s3Key}`);
}

/**
 * 통합 테스트(E2E)를 위한 기초 데이터를 DB에 주입하는 유틸리티 메서드
 *
 * 책임:
 * 1. PostgreSQL(Prisma): 테스트용 유저 계정(user-12345) 생성 또는 갱신
 * 2. MongoDB: 기존 데이터 클린업 및 대화·메시지·노트·사용자 라이브러리 파일(PDF/DOCX/PPTX) 시드
 *
 * 목적:
 * - 그래프 생성 및 Macro S3 bundle 로직이 작동하기 위해 반드시 존재해야 하는 원본 데이터를 강제 주입합니다.
 */
export async function seedTestData() {
  console.log('--- Starting DB Seeding ---');

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
  console.log('PostgreSQL User seeded.');

  const mongoClient = new MongoClient(MONGO_URI);
  try {
    await mongoClient.connect();
    const db = mongoClient.db();

    await db.collection('conversations').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('messages').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('notes').deleteMany({ ownerUserId: TEST_USER_ID });
    await db.collection('graph_nodes').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_edges').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_clusters').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_subclusters').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_stats').deleteMany({ userId: TEST_USER_ID });
    await db.collection('graph_summaries').deleteMany({ userId: TEST_USER_ID });
    await db.collection('user_files').deleteMany({ ownerUserId: TEST_USER_ID });

    const convId = 'conv-e2e-123';
    const nowTimestamp = Date.now();
    await db.collection('conversations').insertOne({
      _id: convId,
      ownerUserId: TEST_USER_ID,
      title: 'E2E Test Chat',
      updatedAt: nowTimestamp,
      createdAt: nowTimestamp,
    } as any);

    await db.collection('messages').insertMany([
      {
        _id: 'msg-e2e-123-u',
        conversationId: convId,
        ownerUserId: TEST_USER_ID,
        role: 'user',
        content:
          'Hello, this is a test message for graph generation. Artificial intelligence and Knowledge Graphs are interesting.',
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
      },
      {
        _id: 'msg-e2e-123-a',
        conversationId: convId,
        ownerUserId: TEST_USER_ID,
        role: 'assistant',
        content:
          'I agree! Knowledge graphs provide a structured way to represent information, which is very useful for LLMs.',
        createdAt: nowTimestamp + 1000,
        updatedAt: nowTimestamp + 1000,
      },
    ] as any);

    await db.collection('notes').insertOne({
      _id: 'note-e2e-123',
      ownerUserId: TEST_USER_ID,
      title: 'E2E Test Note',
      content: 'This note discusses the relationship between LLMs and Graph structures.',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    for (const fileSeed of E2E_MACRO_USER_FILE_SEEDS) {
      const ext = fileSeed.displayName.includes('.')
        ? fileSeed.displayName.split('.').pop()
        : 'bin';
      const physicalName = `${fileSeed._id}.${ext}`;
      const userFileS3Key = buildStorageKey(
        STORAGE_BUCKETS.USER_FILES,
        `${TEST_USER_ID}/${physicalName}`
      );

      try {
        await uploadUserFileToS3(userFileS3Key, fileSeed.bytes, fileSeed.mimeType);
      } catch (err) {
        console.warn(`[E2E Seed] S3 upload failed for ${fileSeed._id} (non-fatal):`, err);
      }

      await db.collection('user_files').insertOne({
        _id: fileSeed._id,
        ownerUserId: TEST_USER_ID,
        folderId: null,
        displayName: fileSeed.displayName,
        s3Key: userFileS3Key,
        mimeType: fileSeed.mimeType,
        sizeBytes: fileSeed.bytes.length,
        category: fileSeed.category,
        summaryStatus: 'completed',
        summary: fileSeed.summary,
        createdAt: new Date(nowTimestamp),
        updatedAt: new Date(nowTimestamp),
        deletedAt: null,
      } as any);
    }

    console.log(
      `MongoDB data seeded (${E2E_MACRO_USER_FILE_SEEDS.length} user_files: pdf, docx, pptx, unknown.xyz).`
    );
  } finally {
    await mongoClient.close();
    await prisma.$disconnect();
  }
  console.log('--- DB Seeding Completed ---');
}

if (require.main === module) {
  seedTestData().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}
