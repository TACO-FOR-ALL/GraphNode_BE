import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { execSync } from 'child_process';

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

/** E2E notion_page_caches 시딩용 타입. NotionPageCacheDoc의 E2E 경량 버전입니다. */
export interface E2eNotionPageSeed {
  _id: string;
  ownerUserId: string;
  integrationId: string;
  notionWorkspaceId: string;
  title: string;
  blockTree: unknown[];
  plainText: string;
  notionLastEditedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  isStale: boolean;
}

/**
 * E2E Macro Graph notion 경로 검증에 사용하는 fake notion_page_caches 시드.
 * _id는 AI output_data의 notion orig_id(src1_<UUID> → <UUID>) 와 일치해야 합니다.
 */
export const E2E_NOTION_PAGE_SEEDS: E2eNotionPageSeed[] = [
  {
    _id: '2076ca0e-0c92-8028-a83d-c50624d1c76f',
    ownerUserId: TEST_USER_ID,
    integrationId: 'test-integration-id',
    notionWorkspaceId: 'test-workspace-id',
    title: 'E2E Test Notion Page — 복소해석학',
    blockTree: [],
    plainText: 'This is a test Notion page for E2E macro graph generation with notion source.',
    notionLastEditedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    isStale: false,
  },
];

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

/** File Service import_jobs — 이전 E2E 실행 잔여 active job이 quota(429)를 유발하지 않도록 정리 */
function cleanupFileServiceImportJobs(): void {
  try {
    execSync(
      `docker exec graphnode-test-postgres psql -U app -d graphnode_file_service -c "DELETE FROM import_jobs WHERE user_id IN ('${TEST_USER_ID}', 'user-other-e2e');"`,
      { stdio: 'ignore' }
    );
    console.log('[E2E Seed] Cleared File Service import_jobs for test users.');
  } catch {
    console.warn('[E2E Seed] File Service import_jobs cleanup skipped (postgres container unavailable).');
  }
}

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
 * @description Mongo replica set PRIMARY 선출을 짧게 대기합니다 (CI rs.initiate 직후 write 실패 방지).
 * @param client 연결된 MongoClient.
 * @param maxAttempts 최대 시도 횟수.
 */
async function waitForMongoPrimary(client: MongoClient, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await client.db().admin().command({ replSetGetStatus: 1 });
      const members = (status as { members?: Array<{ stateStr?: string }> }).members ?? [];
      if (members.some((m) => m.stateStr === 'PRIMARY')) {
        return;
      }
    } catch {
      // replica set 아직 초기화 중
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.warn('[E2E Seed] Mongo PRIMARY not confirmed after wait; proceeding anyway');
}

/**
 * @description 단일 user_file 시드 레코드를 S3 업로드 후 Mongo에 삽입합니다.
 * @param db MongoDB database handle.
 * @param fileSeed E2E_MACRO_USER_FILE_SEEDS 항목.
 * @param nowTimestamp 시드 기준 epoch ms.
 */
async function seedUserFileRecord(
  db: ReturnType<MongoClient['db']>,
  fileSeed: (typeof E2E_MACRO_USER_FILE_SEEDS)[number],
  nowTimestamp: number
): Promise<void> {
  const ext = fileSeed.displayName.includes('.') ? fileSeed.displayName.split('.').pop() : 'bin';
  const physicalName = `${fileSeed._id}.${ext}`;
  const userFileS3Key = buildStorageKey(STORAGE_BUCKETS.USER_FILES, `${TEST_USER_ID}/${physicalName}`);

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

/**
 * 통합 테스트(E2E)를 위한 기초 데이터를 DB에 주입하는 유틸리티 메서드
 *
 * 책임:
 * 1. PostgreSQL(Prisma): 테스트용 유저 계정(user-12345) 생성 또는 갱신
 * 2. MongoDB: 기존 데이터 클린업 및 대화·메시지·노트·사용자 라이브러리 파일(PDF/DOCX/PPTX) 시드
 *
 * 목적:
 * - 그래프 생성 및 Macro S3 bundle 로직이 작동하기 위해 반드시 존재해야 하는 원본 데이터를 강제 주입합니다.
 *
 * 주의: Jest `--runInBand`에서 여러 spec이 연속 호출하므로 `prisma.$disconnect()`는 CLI 실행 시에만 수행합니다.
 */
export async function seedTestData(): Promise<void> {
  console.log('--- Starting DB Seeding ---');

  cleanupFileServiceImportJobs();

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
    await waitForMongoPrimary(mongoClient);
    const db = mongoClient.db();

    await Promise.all([
      db.collection('conversations').deleteMany({ ownerUserId: TEST_USER_ID }),
      db.collection('messages').deleteMany({ ownerUserId: TEST_USER_ID }),
      db.collection('notes').deleteMany({ ownerUserId: TEST_USER_ID }),
      db.collection('graph_nodes').deleteMany({ userId: TEST_USER_ID }),
      db.collection('graph_edges').deleteMany({ userId: TEST_USER_ID }),
      db.collection('graph_clusters').deleteMany({ userId: TEST_USER_ID }),
      db.collection('graph_subclusters').deleteMany({ userId: TEST_USER_ID }),
      db.collection('graph_stats').deleteMany({ userId: TEST_USER_ID }),
      db.collection('graph_summaries').deleteMany({ userId: TEST_USER_ID }),
      db.collection('user_files').deleteMany({ ownerUserId: TEST_USER_ID }),
      db.collection('notion_page_caches').deleteMany({ ownerUserId: TEST_USER_ID }),
    ]);

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

    await db.collection('notes').insertMany([
      {
        _id: 'note-e2e-123',
        ownerUserId: TEST_USER_ID,
        title: 'E2E Test Note',
        content: 'This note discusses the relationship between LLMs and Graph structures.',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'note-e2e-block-123',
        ownerUserId: TEST_USER_ID,
        title: 'E2E Block Mode Note',
        content: 'This note is used for dual SQS block/nonBlock sub-status tracking tests.',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'note-e2e-blockview-456',
        ownerUserId: TEST_USER_ID,
        title: 'E2E Block View Note',
        content: 'This note is used for block view graph API verification after dual pipeline completion.',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'note-e2e-latestgraph-789',
        ownerUserId: TEST_USER_ID,
        title: 'E2E Latest Graph Note',
        content: 'This note is used for getLatestGraphByNodeId blockView verification.',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'note-e2e-partial-fail-001',
        ownerUserId: TEST_USER_ID,
        title: 'E2E Partial Fail Note',
        content: 'This note is used for testing partial failure convergence.',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    await Promise.all(
      E2E_MACRO_USER_FILE_SEEDS.map((fileSeed) => seedUserFileRecord(db, fileSeed, nowTimestamp))
    );

    if (E2E_NOTION_PAGE_SEEDS.length > 0) {
      await db.collection('notion_page_caches').insertMany(E2E_NOTION_PAGE_SEEDS as any[]);
      console.log(`[E2E Seed] notion_page_caches seeded (${E2E_NOTION_PAGE_SEEDS.length} pages).`);
    }

    console.log(
      `MongoDB data seeded (${E2E_MACRO_USER_FILE_SEEDS.length} user_files: pdf, docx, pptx, unknown.xyz).`
    );
  } finally {
    await mongoClient.close();
  }

  console.log('--- DB Seeding Completed ---');
}

if (require.main === module) {
  seedTestData()
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
