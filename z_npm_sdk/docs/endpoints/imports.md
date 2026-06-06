# Import API Reference (`client.imports`)

ChatGPT/OpenAI export ZIP 등 AI 대화 아카이브를 GraphNode로 가져오는 API입니다.  
ZIP 업로드는 **presigned PUT**(FE → S3 직접), 첨부 파일 접근은 **presigned GET**(BFF 발급)을 사용합니다.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `listProviders()` | `GET /v1/import-providers` | 사용 가능 import provider 목록 | 200, 401 |
| `initUpload(...)` | `POST /v1/imports/init` | ZIP presigned PUT URL 발급 | 201, 401, 502 |
| `startImport(jobId)` | `POST /v1/imports/:jobId/start` | S3 업로드 완료 후 worker enqueue | 202, 401, 404 |
| `uploadImport(...)` | (위 3단계 통합) | init → S3 PUT → start | 202, 401, 502 |
| `getJob(jobId)` | `GET /v1/imports/:jobId` | job 상태·진행률 폴링 | 200, 401, 404 |
| `finalize(jobId)` | `POST /v1/imports/:jobId/finalize` | S3 result → Mongo 저장 | 200, 202, 401, 409 |
| `cancelJob(jobId)` | `DELETE /v1/imports/:jobId` | job 취소 | 204, 401, 404 |
| `getFileAccessUrl(fileId, opts?)` | `GET /v1/files/:fileId/access-url` | 첨부 presigned GET URL | 200, 401, 404 |

---

## 첨부 파일 접근 (presigned GET)

Import 완료 후 메시지 `attachments[]`의 **`url` 필드는 fileId**(ULID)입니다. S3 URL이 아닙니다.

```typescript
// 메시지에서 import 첨부 찾기
const att = message.attachments?.[0];
if (!att) return;

// 1) presigned URL 발급 (inline=미리보기, attachment=다운로드)
const res = await client.imports.getFileAccessUrl(att.url, {
  disposition: att.type === 'image' ? 'inline' : 'attachment',
});

if (!res.isSuccess) {
  console.error(res.error);
  return;
}

const { url, name, mimeType, expiresAt } = res.data;

// 2) 브라우저에서 S3 직접 요청
const img = document.createElement('img');
img.src = url;

// 또는 다운로드
const blob = await fetch(url).then((r) => r.blob());
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = name;
a.click();
```

### Response (`PresignedFileAccessDto`)

```json
{
  "url": "https://bucket.s3.amazonaws.com/import-files/...?X-Amz-...",
  "expiresAt": "2026-05-21T12:00:00.000Z",
  "fileId": "01HXYZ...",
  "mimeType": "image/png",
  "name": "스크린샷.png"
}
```

- `url`: TTL 만료 후 **재호출** 필요
- `name`: UTF-8 원본 파일명 (다운로드 시 `Content-Disposition`에도 반영)

---

## ZIP 업로드 (`uploadImport`)

```typescript
const file = input.files[0]; // .zip
const res = await client.imports.uploadImport('openai', file, file.name);
if (res.isSuccess) {
  const { jobId } = res.data;
  // getJob(jobId) 폴링 → status: completed → finalize(jobId)
}
```

---

## AI 채팅 첨부 vs Import 첨부

| 구분 | `url` 의미 | 다운로드 API |
| :--- | :--- | :--- |
| AI 채팅 (`client.ai`) | S3 key (`chat-files/...`) | `client.ai.downloadFile(url)` |
| Import (`client.imports`) | fileId (ULID) | `client.imports.getFileAccessUrl(url)` |

타입: `ImportAttachment` (`z_npm_sdk/src/types/import.ts`), 공통 shape는 `Attachment` (`message.ts`).

---

## 관련 문서

- BE: `GraphNode_BE/docs/architecture/FILE_SERVICE_INTEGRATION.md`
- File Service: `GraphNode_BE_File_Service/docs/INFRA_AWS.md`
