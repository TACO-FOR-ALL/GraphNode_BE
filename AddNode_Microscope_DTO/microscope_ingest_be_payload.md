# Microscope Ingest Payload Guide (BE ↔ GraphNode_AI)

> AI 레포 참고:
> - `docs/micro/*.md` (from_graphnode / raw_file, block / non-block)
> - `output_data/microscope/from_graphnode` — 기존 GraphNode 노트·대화 ingest
> - `output_data/microscope/raw_file` — raw file 업로드 ingest
> - 출력: `standardized.json` (non-block) 또는 `block_graph.json` (block), PPT/DOCX는 `images/` prefix 추가

## 1) 파이프라인 매핑

| BE API | SQS `taskType` | `ingest_mode` | AI 출력 (성공) |
|--------|----------------|---------------|----------------|
| `POST /v1/microscope/nodes/ingest` | `MICROSCOPE_INGEST_FROM_NODE_REQUEST` | `from_graphnode` | `standardized_s3_key` 또는 `block_graph_s3_key` (+ `images_s3_prefix`) |
| `POST /v1/microscope/{groupId}/documents` | `MICROSCOPE_INGEST_REQUEST` | `raw_file` | 동일 |

요청 body 옵션: `blockMode` (boolean). `true` → block 모드, 생략/false → non-block.

## 2) Raw file — SQS 예시

```json
{
  "taskType": "MICROSCOPE_INGEST_REQUEST",
  "taskId": "task_microscope_file_user_123_01HXXX",
  "timestamp": "2026-05-31T12:00:00Z",
  "payload": {
    "user_id": "user_123",
    "group_id": "01HGROUP",
    "bucket": "taco5-graphnode-graphdata-s3",
    "s3_key": "microscope-ingest/user_123/task_microscope_file_user_123_01HXXX/report.pdf",
    "file_name": "report.pdf",
    "schema_name": "default",
    "ingest_mode": "raw_file",
    "block_mode": false
  }
}
```

## 3) From GraphNode node — SQS 예시

```json
{
  "taskType": "MICROSCOPE_INGEST_FROM_NODE_REQUEST",
  "taskId": "task_microscope_node_user_123_01HXXX",
  "payload": {
    "user_id": "user_123",
    "node_id": "note_abc",
    "node_type": "note",
    "group_id": "01HGROUP",
    "schema_name": "default",
    "language": "ko",
    "ingest_mode": "from_graphnode",
    "block_mode": true
  }
}
```

## 4) AI → BE 결과 (`MICROSCOPE_INGEST_FROM_NODE_RESULT`)

```json
{
  "taskType": "MICROSCOPE_INGEST_FROM_NODE_RESULT",
  "taskId": "task_microscope_file_user_123_01HXXX",
  "payload": {
    "user_id": "user_123",
    "group_id": "01HGROUP",
    "status": "COMPLETED",
    "source_id": "src-uuid",
    "chunks_count": 12,
    "standardized_s3_key": "results/microscope/.../standardized.json",
    "block_graph_s3_key": "results/microscope/.../block_graph.json",
    "images_s3_prefix": "results/microscope/.../images/"
  }
}
```

- Worker는 `standardized_s3_key` 우선, 없으면 `block_graph_s3_key`로 S3 JSON 다운로드 후 Mongo `microscope_graph_payloads`에 저장.
- 문서 메타(`microscope_workspaces.documents[]`)에 `visualizationS3Key`, `outputMode`, `imagesS3Prefix` 등 스냅샷 저장 → FE 시각화.

## 5) BE API 요약

| Method | Path | 설명 |
|--------|------|------|
| POST | `/v1/microscope/nodes/ingest` | 노트/대화 → from_graphnode |
| POST | `/v1/microscope/{groupId}/documents` | multipart `files[]` → raw_file |
| GET | `/v1/microscope/{groupId}` | 워크스페이스·문서 상태 (visualization S3 키 포함) |
| GET | `/v1/microscope/{groupId}/graph` | 병합된 그래프 (Mongo payload) |
