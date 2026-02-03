# 트러블슈팅 가이드

이 가이드는 GraphNode 서비스 운영 및 개발 중 자주 발생하는 문제와 해결 방법을 다룹니다.

## AWS SQS 문제

### 메시지가 큐에 쌓임 (처리되지 않음)
**증상:** SQS 지표에는 메시지가 보이지만 워커가 이를 처리하지 않음.
**원인:**
1. **워커 중단:** ECS 로그 또는 로컬 터미널 에러 확인.
2. **환경 변수 누락:** `AWS_SQS_RESULT_QUEUE_URL` 등이 올바르게 설정되었는지 확인.
3. **리전 불일치:** `AWS_REGION`이 큐가 생성된 리전과 일치하는지 확인.
4. **Visibility Timeout:** 처리가 타임아웃보다 오래 걸리면 메시지가 다른 워커에게 다시 보임.

**해결책:**
- 로그에서 "Error handling message" 검색.
- AI 작업이 오래 걸리는 경우 SQS 콘솔에서 `VisibilityTimeout` 증가.

### 메시지 "처리 실패" 루프
**증상:** 워커 로그에 에러가 찍히고, 메시지가 사라졌다가 다시 나타남.
**원인:** 워커가 처리를 완료하지 못하고 에러를 던지면, SQS는 ACK(삭제)를 받지 못해 Visibility Timeout 후 재전송함.
**해결책:**
- 에러를 유발하는 버그 수정.
- 잘못된 데이터(Bad Request)인 경우, 에러를 잡아서 로그를 남기고 메시지를 수동 삭제(ACK)하여 무한 재시도 방지.
- Dead Letter Queue (DLQ) 확인.

## 데이터베이스 문제

### MongoDB 연결 타임아웃
**증상:** `MongooseServerSelectionError: Connect failed`
**해결책:**
- MongoDB Atlas IP 화이트리스트 확인.
- `MONGODB_URI` 계정 정보 확인.
- Docker 컨테이너의 인터넷 접속 상태 확인.

## AI 서버 문제

### "AI Task failed on server side"
**증상:** `GraphGenerationResultHandler`가 `FAILED` 상태를 수신함.
**해결책:**
- AI 서버 로그 확인 (CloudWatch 또는 로컬).
- 일반적인 AI 에러:
    - GPU OOM (Out Of Memory).
    - 잘못된 JSON 입력 형식.
    - OpenAI API Rate Limit 초과.

## 로컬 개발 환경

### Vector DB / Chroma 연결 거부
**증상:** `fetch failed` 또는 `ECONNREFUSED` (Chroma 접속 시).
**해결책:**
- `npm run db:up`으로 Chroma 컨테이너 실행 여부 확인.
- `CHROMA_DB_URL` (기본: `http://localhost:8000`) 확인.
