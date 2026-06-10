# AddNode Raw File + Microscope raw_file BE 연동

## TL;DR

- **AddNode**: `add-node/{taskId}/` prefix bundle (`batch.json` + `files/{fileId}_{displayName}`) 업로드, SQS `s3Key`는 prefix(`/`` 종료).
- **Worker**: `batch.json` 기반 `user_files` 누락 시 synthetic 노드 보강 (`augmentAddNodeBatchWithUserFiles`).
- **Microscope raw_file**: `POST /v1/microscope/{groupId}/documents` 구현, SQS `MICROSCOPE_INGEST_REQUEST`.
- **Microscope 결과**: `standardized_s3_key` 없으면 `block_graph_s3_key` fallback.

## AddNode 입력 (BE → AI)

```
add-node/{taskId}/
  batch.json          # AiAddNodeBatchRequest (conversations, notes, files meta)
  files/
    {fileId}_{displayName}   # user_files 원본 바이트
```

SQS `ADD_NODE_REQUEST.payload.s3Key` = `add-node/{taskId}/`

## Microscope raw_file

- `POST /v1/microscope/:groupId/documents` (multipart `files[]`)
- S3: `microscope-ingest/{userId}/{docId}/{fileName}`
- SQS: `MICROSCOPE_INGEST_REQUEST`

## 테스트

```bash
npx jest tests/unit/augmentAddNodeBatchWithUserFiles.spec.ts tests/unit/sourceTypeResolver.spec.ts
npx jest tests/unit/GraphGenerationService.spec.ts -t requestAddNodeViaQueue
npm run e2e:bundle   # macro-s3-bundle + add-node-raw-file-bundle
```
