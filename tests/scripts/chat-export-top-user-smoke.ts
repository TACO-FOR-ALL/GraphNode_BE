/**
 * 메시지 수가 가장 많은 사용자를 찾아 채팅보내기(export)를 검증합니다.
 *
 * 우선순위:
 * 1) `TEST_LOGIN_SECRET` 이 있으면 → 로컬 dev 서버의 `POST /dev/test/chat-export/top-user-smoke`
 *    (스크립트가 Atlas에 직접 붙지 못해도, 이미 Mongo에 연결된 `npm run dev`가 집계·시작)
 * 2) 실패 시 → `MONGODB_URL` 로 스크립트가 직접 Mongo 집계 후 `POST /v1/exports/...`
 *
 *   infisical run -- npm run chat-export:top-user-smoke
 *
 * 완료 시 `CHAT_EXPORT_SCRIPT_OUTPUT`(선택) 경로에 ZIP 저장. 미설정 시 `export-top-user-{jobId}.zip`.
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ override: false });

import { writeFile, stat } from 'fs/promises';
import { resolve } from 'path';

import { MongoClient } from 'mongodb';

import { generateAccessToken } from '../../src/app/utils/jwt';
import type { ConversationDoc } from '../../src/core/types/persistence/ai.persistence';

const baseUrl = (process.env.CHAT_EXPORT_SCRIPT_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

interface TopUserRow {
  _id: string;
  messageCount: number;
}

interface DevTopUserSmokeResponse {
  ok: boolean;
  winner?: { userId: string; messageCount: number };
  top5?: Array<{ userId: string; messageCount: number }>;
  pickedConversation?: { conversationId: string; messageCount: number; title?: string };
  startExport?: { jobId: string; status?: string };
  message?: string;
}

async function findTopUserByMessageCount(
  db: ReturnType<MongoClient['db']>
): Promise<TopUserRow | null> {
  const rows = await db
    .collection('messages')
    .aggregate<TopUserRow>([
      { $match: { deletedAt: null, ownerUserId: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$ownerUserId', messageCount: { $sum: 1 } } },
      { $sort: { messageCount: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  return rows[0] ?? null;
}

async function findLargestConversationForUser(
  db: ReturnType<MongoClient['db']>,
  ownerUserId: string
): Promise<{ conversationId: string; messageCount: number; title?: string } | null> {
  const convRows = await db
    .collection('messages')
    .aggregate<{ _id: string; messageCount: number }>([
      { $match: { deletedAt: null, ownerUserId } },
      { $group: { _id: '$conversationId', messageCount: { $sum: 1 } } },
      { $sort: { messageCount: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  const top = convRows[0];
  if (!top?._id) return null;

  const conv = await db
    .collection<ConversationDoc>('conversations')
    .findOne({ _id: top._id, deletedAt: null }, { projection: { title: 1 } });

  return {
    conversationId: String(top._id),
    messageCount: top.messageCount,
    title: conv?.title,
  };
}

/**
 * @description 메시지 최다 사용자 JWT로 export ZIP을 받아 디스크에 저장합니다.
 * @param userId 집계에서 나온 소유자 ID.
 * @param jobId 완료된 export 작업 ID.
 * @returns 저장된 파일의 절대 경로.
 */
async function downloadExportZipForTopUser(userId: string, jobId: string): Promise<string> {
  const accessToken = generateAccessToken({ userId });
  const url = `${baseUrl}/v1/exports/${jobId}/download`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/zip,*/*' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ZIP 다운로드 실패 HTTP ${res.status}: ${text.slice(0, 800)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const rawName = process.env.CHAT_EXPORT_SCRIPT_OUTPUT?.trim();
  const fileName = rawName && rawName.length > 0 ? rawName : `export-top-user-${jobId}.zip`;
  const outPath = resolve(process.cwd(), fileName);
  await writeFile(outPath, buf);
  return outPath;
}

/**
 * @description export 작업이 종료 상태가 될 때까지 폴링한 뒤, 성공 시 ZIP을 자동 저장합니다.
 * @param userId export 소유자 ID(ULID/UUID). 세션 없는 JWT로 충분.
 * @param jobId 작업 ID(ULID 등).
 */
async function waitForExportJob(userId: string, jobId: string): Promise<void> {
  const accessToken = generateAccessToken({ userId });

  const deadline = Date.now() + 180_000;
  let lastStatus = '';
  while (Date.now() < deadline) {
    const stRes = await fetch(`${baseUrl}/v1/exports/${jobId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    const st = (await stRes.json().catch(() => ({}))) as {
      status?: string;
      downloadUrl?: string;
      errorMessage?: string;
    };
    lastStatus = st.status ?? '';
    if (lastStatus !== 'PENDING' && lastStatus !== 'PROCESSING') {
      console.log(JSON.stringify({ step: 'final_status', jobId, ...st }, null, 2));
      if (lastStatus === 'DONE') {
        try {
          const savedPath = await downloadExportZipForTopUser(userId, jobId);
          const fileStat = await stat(savedPath);
          console.log(JSON.stringify({ step: 'zip_saved', path: savedPath, bytes: fileStat.size }, null, 2));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(JSON.stringify({ step: 'zip_download_failed', jobId, message }, null, 2));
          process.exit(1);
        }
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.error(JSON.stringify({ step: 'timeout', jobId, lastStatus }, null, 2));
  process.exit(1);
}

async function runExport(userId: string, conversationId: string): Promise<void> {
  const accessToken = generateAccessToken({ userId });

  const startRes = await fetch(`${baseUrl}/v1/exports/conversations/${conversationId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  const startBody = (await startRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!startRes.ok) {
    console.error(JSON.stringify({ step: 'post_failed', status: startRes.status, body: startBody }, null, 2));
    process.exit(1);
  }

  const jobId = String(startBody.jobId ?? '');
  console.log(JSON.stringify({ step: 'export_started', userId, conversationId, jobId, ...startBody }, null, 2));

  await waitForExportJob(userId, jobId);
}

/**
 * @description dev 서버가 Mongo에 붙어 있을 때 집계·export 시작을 위임합니다.
 * @returns 성공 시 userId·jobId, 아니면 null.
 */
async function tryStartViaDevServer(): Promise<{ userId: string; jobId: string } | null> {
  const secret = process.env.TEST_LOGIN_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/dev/test/chat-export/top-user-smoke`, {
      method: 'POST',
      headers: { 'x-internal-token': secret, Accept: 'application/json' },
    });

    const body = (await res.json().catch(() => ({}))) as DevTopUserSmokeResponse;

    if (!res.ok || !body.ok || !body.winner?.userId || !body.startExport?.jobId) {
      console.warn(
        JSON.stringify(
          {
            step: 'dev_server_aggregate_skipped',
            httpStatus: res.status,
            body,
            hint:
              '로컬에서 `infisical run -- npm run dev` 가 떠 있고 TEST_LOGIN_SECRET 이 맞는지 확인하세요.',
          },
          null,
          2
        )
      );
      return null;
    }

    console.log(JSON.stringify({ step: 'via_dev_server', ...body }, null, 2));
    return { userId: body.winner.userId, jobId: body.startExport.jobId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify(
        {
          step: 'dev_server_unreachable',
          error: message,
          hint: '로컬 API가 안 떠 있으면 Mongo 직접 경로로 폴백합니다.',
        },
        null,
        2
      )
    );
    return null;
  }
}

async function main(): Promise<void> {
  const viaDev = await tryStartViaDevServer();
  if (viaDev) {
    await waitForExportJob(viaDev.userId, viaDev.jobId);
    return;
  }

  const mongoUrl = process.env.MONGODB_URL?.trim();
  if (!mongoUrl) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          message:
            'MONGODB_URL 이 없고 dev 서버 경로도 실패했습니다. TEST_LOGIN_SECRET + 로컬 dev 실행을 확인하세요.',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 20_000 });
  try {
    await client.connect();
    const db = client.db();

    const topUser = await findTopUserByMessageCount(db);
    if (!topUser?._id) {
      console.error(JSON.stringify({ ok: false, message: '메시지가 있는 사용자가 없습니다.' }, null, 2));
      process.exit(1);
    }

    const top5 = await db
      .collection('messages')
      .aggregate<TopUserRow>([
        { $match: { deletedAt: null, ownerUserId: { $type: 'string', $ne: '' } } },
        { $group: { _id: '$ownerUserId', messageCount: { $sum: 1 } } },
        { $sort: { messageCount: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    const picked = await findLargestConversationForUser(db, topUser._id);
    if (!picked) {
      console.error(JSON.stringify({ ok: false, message: '해당 사용자의 대화가 없습니다.', userId: topUser._id }, null, 2));
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          step: 'top_users_by_message_count',
          winner: topUser,
          top5,
          pickedConversation: picked,
        },
        null,
        2
      )
    );

    await runExport(topUser._id, picked.conversationId);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
