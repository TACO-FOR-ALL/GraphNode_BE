/**
 * 최근 대화 ID를 찾고 export API까지 호출합니다.
 *
 * 1) CHAT_EXPORT_SCRIPT_ACCESS_TOKEN 이 있으면 → API로 대화 목록 조회 (Mongo 불필요)
 * 2) 없으면 → MONGODB_URL 로 Mongo 직접 조회
 *
 * 사용법:
 *   infisical run -- npm run chat-export:smoke
 *
 * export까지 자동 (로컬 서버 필요):
 *   CHAT_EXPORT_SCRIPT_ACCESS_TOKEN=eyJ... \
 *   CHAT_EXPORT_SCRIPT_BASE_URL=http://127.0.0.1:3000 \
 *   infisical run -- npm run chat-export:smoke
 *
 * CHAT_EXPORT_SCRIPT_ACCESS_TOKEN 은 HTTP 헤더에 그대로 들어가므로 **실제 JWT(ASCII)** 만
 * 사용하세요. 예시 문구처럼 한글을 넣으면 undici ByteString 오류가 납니다.
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ override: false });

import { MongoClient } from 'mongodb';

const baseUrl = (process.env.CHAT_EXPORT_SCRIPT_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const accessToken = process.env.CHAT_EXPORT_SCRIPT_ACCESS_TOKEN?.trim();

/**
 * @description `Authorization` 헤더 값은 Web Fetch ByteString(코드 유닛 ≤255)만 허용한다.
 * @param value Bearer 토큰 원문.
 * @returns 위반 시 사람이 읽을 수 있는 한국어 메시지, 통과 시 null.
 */
function authorizationHeaderValueByteStringError(value: string): string | null {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) {
      return `토큰 ${i}번째 문자가 비ASCII입니다. 예시 문구(한글) 대신 로그인 후 받은 JWT(eyJ... )를 넣으세요.`;
    }
  }
  return null;
}

interface PickedConversation {
  conversationId: string;
  title?: string;
  ownerUserId?: string;
  source: 'api' | 'mongo';
}

async function pickViaApi(): Promise<PickedConversation | null> {
  if (!accessToken) return null;

  const res = await fetch(`${baseUrl}/v1/ai/conversations?limit=5`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(
      JSON.stringify({
        step: 'api_list_failed',
        status: res.status,
        hint: '서버가 떠 있는지, TOKEN이 유효한지 확인하세요.',
        body: body.slice(0, 200),
      })
    );
    return null;
  }

  const data = (await res.json()) as {
    items?: Array<{ id: string; title?: string }>;
  };
  const first = data.items?.[0];
  if (!first?.id) {
    console.warn(JSON.stringify({ step: 'api_list_empty', message: '대화가 없습니다.' }));
    return null;
  }

  return {
    conversationId: first.id,
    title: first.title,
    source: 'api',
  };
}

async function pickViaMongo(): Promise<PickedConversation | null> {
  const mongoUrl = process.env.MONGODB_URL?.trim();
  if (!mongoUrl) {
    console.error('MONGODB_URL 이 없고 API 조회도 실패했습니다. TOKEN 또는 Mongo URL을 확인하세요.');
    return null;
  }

  const client = new MongoClient(mongoUrl, {
    serverSelectionTimeoutMS: 15_000,
  });

  try {
    await client.connect();
    const db = client.db();
    const docs = await db
      .collection('conversations')
      .find({ deletedAt: null })
      .sort({ updatedAt: -1 })
      .limit(5)
      .project({ _id: 1, title: 1, ownerUserId: 1 })
      .toArray();

    if (docs.length === 0) return null;

    const picked = docs[0] as { _id: string; title?: string; ownerUserId?: string };
    return {
      conversationId: String(picked._id),
      title: picked.title,
      ownerUserId: picked.ownerUserId,
      source: 'mongo',
    };
  } finally {
    await client.close();
  }
}

async function runExportFlow(conversationId: string): Promise<void> {
  if (!accessToken) {
    console.log(
      JSON.stringify({
        step: 'manual_export',
        conversationId,
        curl: `curl -s -X POST "${baseUrl}/v1/exports/conversations/${conversationId}" -H "Authorization: Bearer YOUR_TOKEN" | jq`,
      })
    );
    return;
  }

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
  if (!jobId) {
    console.error(JSON.stringify({ step: 'no_job_id', body: startBody }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ step: 'export_started', jobId, status: startBody.status }, null, 2));

  const deadline = Date.now() + 120_000;
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
      if (lastStatus === 'DONE' && st.downloadUrl) {
        console.log(`\ncurl -s -L "${st.downloadUrl}" -H "Authorization: Bearer ${accessToken}" -o export.zip`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.error(JSON.stringify({ step: 'timeout', jobId, lastStatus }, null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  if (accessToken) {
    const tokenErr = authorizationHeaderValueByteStringError(accessToken);
    if (tokenErr) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            step: 'invalid_access_token_charset',
            message: tokenErr,
            hint: '브라우저 로그인 후 Network 탭의 Authorization Bearer 값, 또는 로그인 API 응답의 access_token을 복사하세요.',
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  let picked = await pickViaApi();
  if (!picked) {
    try {
      picked = await pickViaMongo();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: message,
            atlasHints: [
              'MongoDB Atlas → Network Access → 현재 IP 허용 (0.0.0.0/0 는 개발용만)',
              'VPN/프록시 끄고 재시도',
              '또는 TOKEN + 로컬 서버로 API 모드만 사용 (Mongo 생략)',
            ],
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  if (!picked) {
    console.error(JSON.stringify({ ok: false, message: '조회할 대화가 없습니다.' }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ step: 'picked', ...picked }, null, 2));
  await runExportFlow(picked.conversationId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
