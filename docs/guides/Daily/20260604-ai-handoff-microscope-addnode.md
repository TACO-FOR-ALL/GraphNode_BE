# GraphNode_AI Handoff — Microscope + AddNode Raw File (BE)

## TL;DR

- **AddNode raw file**: `POST /v1/graph-ai/add-node` → S3 `add-node/{taskId}/` (`batch.json` + `files/`) → SQS `ADD_NODE_REQUEST`.
- **Microscope from_graphnode**: `POST /v1/microscope/nodes/ingest` → SQS `ingest_mode: from_graphnode`.
- **Microscope raw_file**: `POST /v1/microscope/{groupId}/documents` → SQS `ingest_mode: raw_file`.
- **시각화**: AI가 `standardized_s3_key` 또는 `block_graph_s3_key`(+ `images_s3_prefix`) 반환 → BE가 Mongo 문서 메타에 저장.

## AI 레포 참고 경로

| 기능 | 문서 | 예시 입력 | 예시 출력 |
|------|------|-----------|-----------|
| Microscope | `GraphNode_AI/docs/micro/` | — | `output_data/microscope/from_graphnode`, `raw_file` |
| AddNode raw | `docs/macro/addnode_raw_files_handoff.md` | `input_data/add_node/raw_file_bundle_example` | `output_data/add_node/test_raw_file` |

## BE DTO 가이드 (로컬)

- `AddNode_Microscope_DTO/add_node_be_payload.md`
- `AddNode_Microscope_DTO/microscope_ingest_be_payload.md`

## Notion

- [BE AddNode Raw File](https://www.notion.so/BE-AddNode-Raw-File-3722373f569e80b4b250e71ded57ae7e)
