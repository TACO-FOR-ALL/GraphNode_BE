# Microscope Ingest Payload Guide (BE)

## 1) SQS Envelope

`MICROSCOPE_INGEST_REQUEST`는 아래 envelope 형식으로 전달합니다.

```json
{
  "taskType": "MICROSCOPE_INGEST_REQUEST",
  "taskId": "ingest-20260226-001",
  "timestamp": "2026-02-26T15:01:24Z",
  "payload": {
    "user_id": "test_user",
    "group_id": "cpu",
    "bucket": "taco5-graphnode-graphdata-s3",
    "s3_key": "inputs/microscope/test_user/my_doc.pdf",
    "file_name": "my_doc.pdf",
    "schema_name": "default",
    "provider": "openai",
    "model": "gpt-4o-mini"
  }
}
```

## 2) Payload Schema (`MicroscopeIngestRequestPayload`)

필수:
- `user_id`
- `group_id`
- `bucket`
- `s3_key`
- `file_name`

옵션:
- `schema_name`
- `provider`
- `model`
- `api_key`

참고:
- `s3_key`는 S3 객체 전체 key입니다.
- `file_name`은 로컬 임시파일명/확장자 용도입니다. 보통 `basename(s3_key)`를 넣으면 됩니다.

## 3) Provider/Model 결정 우선순위 (Worker)

Worker(`server/worker.py`) 기준:

1. 요청 payload에 `provider`/`api_key`가 있으면 그 값을 우선 사용
2. 없으면 환경변수 기본값 사용
   - `MICROSCOPE_LLM_PROVIDER`
   - `MICROSCOPE_LLM_MODEL`

즉 현재 ECS task definition에서:
- `MICROSCOPE_LLM_PROVIDER=groq`
- `MICROSCOPE_LLM_MODEL=llama-3.3-70b-versatile`

로 설정되어 있으면, payload override가 없을 때 기본 provider는 `groq`입니다.

## 4) 현재 Worker의 파일 처리 동작

- S3에서 받은 입력 파일은 로컬 임시 경로(`input_data/`, `microscope/tmp/`)를 거쳐 처리됩니다.
- 처리 후 임시 파일은 삭제됩니다.
- Worker 경로에서는 `output_data/microscope/...` 로컬 중간 산출물 저장을 하지 않습니다.
- (HTTP `server/main.py` 경로는 디버그용 로컬 산출물 저장을 유지합니다.)
