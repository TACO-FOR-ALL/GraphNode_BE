# 다음 세션 작업 체크리스트 (Next Session Task List)

> **AI 에이전트용**: 다음 세션 작업 시 이 체크리스트를 따라 진행하세요.

## 1. ChromaDB 연동 (ChromaDB Integration)
- [ ] **Client 구현**: `src/infra/db/chroma.ts` 작성.
  - [ ] `chromadb` 패키지에서 `ChromaClient` 임포트.
  - [ ] `initChroma(url: string, apiKey?: string)` 함수 생성 및 export.
  - [ ] 간단한 연결 확인 또는 재시도 로직 구현.
- [ ] **초기화 연동**: `src/infra/db/index.ts` 수정.
  - [ ] `initChroma` 호출 주석 해제.
  - [ ] `process.env.CHROMA_URL` 및 `process.env.CHROMA_API_KEY` 전달.

## 2. 인프라 구축 (AWS & Deployment)
- [ ] **Docker & ECR**:
  - [ ] `GraphNode_AI` Dockerfile 검증.
  - [ ] 로컬에서 `docker build` 명령어로 빌드 테스트 수행.
- [ ] **GitHub Actions**:
  - [ ] `deploy-ai.yml` 리뷰.
  - [ ] `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 시크릿 참조가 올바른지 확인.
- [ ] **ECS 설정**:
  - [ ] `ecs/ai-task-definition.json`의 이미지 URI 포맷 확인.

## 3. Feature Vector 파이프라인 (Vector Pipeline)
- [ ] **AI Worker (`worker.py`) 수정**:
  - [ ] `input_data` 및 `output_dir` 처리 로직 위치 확인.
  - [ ] `run_pipeline.py` 실행 완료 후 `output_dir / "features.json"` 파일 확인 로직 추가.
  - [ ] `s3.upload_file`을 사용하여 `features.json` 업로드.
  - [ ] `GraphGenResultPayload` 생성 시 `featuresS3Key` 포함하도록 수정.
- [ ] **Backend DTO (`queue.ts`) 수정**:
  - [ ] `GraphGenResultPayload` 인터페이스에 `featuresS3Key?: string` 필드 추가.
- [ ] **Backend Handler (`GraphGenerationResultHandler.ts`) 수정**:
  - [ ] 작업 결과에서 `featuresS3Key` 추출.
  - [ ] `s3.getObject`로 `features.json` 다운로드 및 JSON 파싱.
  - [ ] **Vector Upsert 로직 구현**:
    - [ ] feature 루프 순회.
    - [ ] `collection.upsert({ ids, embeddings, metadatas: { userId, graphId } })` 호출.

## 4. 검증 (Verification)
- [ ] **수동 트리거 테스트**:
  - [ ] `POST /v1/graph-ai` 호출 (테스트 데이터 사용).
  - [ ] SQS 콘솔 또는 로그 모니터링.
  - [ ] S3에 `features.json` 생성 여부 확인.
  - [ ] ChromaDB 쿼리로 데이터 적재 확인.

## 5. 그래프 요약 API (Graph Summary API)
- [ ] **Controller**: `GraphAiController.getGraphSummary` 구현.
- [ ] **Service**: `GraphAiService.generateSummary` 로직 구현.
- [ ] **Logic**: `features.json` (또는 저장된 벡터 메타데이터)를 조회 -> LLM 전송 -> 요약문 반환.
