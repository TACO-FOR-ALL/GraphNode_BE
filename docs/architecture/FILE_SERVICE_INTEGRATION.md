# File Service 연동 (BFF ↔ MSA)

GraphNode BE는 **유일한 공인 진입점**입니다. File Service는 VPC 내부에서만 `/internal/*` 로 호출합니다.

## FE 업로드 (presigned PUT — ZIP 1회 전송)

1. `POST /v1/imports/init` `{ provider, originalName, sizeBytes }` → `uploadUrl`, `uploadHeaders`, `jobId`
2. **FE → S3** `PUT uploadUrl` (본문 = ZIP, 헤더 = `uploadHeaders`)
3. `POST /v1/imports/{jobId}/start` → `{ status: "queued" }`
4. `GET /v1/imports/{jobId}` 폴링 → `status: "completed"`
5. `POST /v1/imports/{jobId}/finalize` → **202** `{ status: "finalizing" }` 또는 **200** `{ status: "finalized", conversations }`
6. `finalizeStatus === "finalizing"` 이면 `GET /v1/imports/{jobId}` 폴링 (`finalizeStatus: "finalized"`)
7. 첨부: `GET /v1/files/{fileId}/access-url`

SDK: `client.imports.uploadImport(provider, file)` 가 1~3을 한 번에 처리합니다.

**S3 CORS**: FE 도메인에서 `PUT`, `Content-Type`, `Content-Length` 허용 필요.

## Finalize (S3 직접 read + 비동기 + 멱등)

- File Service worker가 `import-results/{jobId}/result.json` 을 S3에 저장.
- BE finalize는 **result JSON을 HTTP로 받지 않음** — BE worker가 **S3 `S3_FILE_BUCKET`에서 직접 read**.
- `POST finalize/claim` (File Service)으로 job 단위 CAS 멱등 claim.
- 결정론적 UUID v5 `_id` + Mongo partial unique index로 SQS 재시도 시 중복 insert 방지.
- `SQS_IMPORT_FINALIZE_QUEUE_URL` 설정 시 async (202). 미설정 시 동기 fallback (로컬 dev).

## Infisical / Secrets Manager (BE `taco5/graphnode/mvp`)

| 키 | 설명 |
|----|------|
| `FILE_SERVICE_BASE_URL` | VPC private URL (Cloud Map / internal ALB). 예: `http://graphnode-file-service:3001` |
| `FILE_SERVICE_INTERNAL_API_KEY` | File Service `INTERNAL_API_KEY` 와 **동일** |
| `FILE_SERVICE_TIMEOUT_MS` | (선택) ECS task env 기본 `300000` |
| `SQS_IMPORT_FINALIZE_QUEUE_URL` | (prod) Import finalize worker 큐. BE API + BE worker 모두 동일 값 |

두 File Service 키가 설정되면 `/v1/import-providers`, `/v1/imports`, `/v1/files/:fileId/access-url` 가 활성화됩니다.

## S3

- BE `S3_FILE_BUCKET` 과 File Service `S3_FILE_BUCKET` 은 **동일 버킷** (`taco5-graphnode-filedata-chat-and-note-s3`).
- BE worker/API task role에 `import-results/*` **GetObject** 권한 필요.
- Import 첨부 prefix: `import-files/`, staging: `import-staging/` (**S3 Lifecycle 7일**), 결과: `import-results/`.

## FE 첨부 접근

- Mongo `attachments[].url` = **fileId** (S3 URL 아님).
- 표시/다운로드 시 `GET /v1/files/{fileId}/access-url?disposition=inline|attachment` → **presigned GET** → 브라우저가 S3 직접 요청.
- SDK: `client.imports.getFileAccessUrl(fileId, { disposition: 'inline' | 'attachment' })`.
- 응답 `name`은 UTF-8 원본 파일명; S3 `Content-Disposition`은 RFC 5987 `filename*` 사용.

## 배포 순서 (요약)

1. File Service ECS (API + Worker), RDS (`prisma db push` — finalize 컬럼), SQS, IAM, **S3 staging Lifecycle**
2. BE `SQS_IMPORT_FINALIZE_QUEUE_URL` + worker task에 큐 폴링 권한
3. Cloud Map 등록 후 BE `FILE_SERVICE_BASE_URL` 설정
4. BE 배포 → import API smoke test

상세: `GraphNode_BE_File_Service/docs/INFRA_AWS.md`
