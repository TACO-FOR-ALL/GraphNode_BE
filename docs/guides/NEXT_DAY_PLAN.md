# Next Day Work Plan: AI Scaling & Vector Integration

> **목표**: AI 인프라(ECS/Scaling) 구축, VectorDB(Chroma) 연동, 그리고 `features.json` 기반의 심층 데이터 파이프라인 완성.

---

## 1. ChromaDB Cloud Setup & Connection
- [ ] **Chroma Cloud 인스턴스 생성**: AWS Seoul Region (없으면 가장 가까운 곳) 선택.
- [ ] **BE 연결 설정**:
    - `src/infra/db/chroma.ts` 구현 (클라이언트 초기화).
    - `src/infra/db/index.ts` 주석 해제.
    - 환경변수 `CHROMA_URL`, `CHROMA_API_KEY` Infisical 등록.

## 2. AWS AI Infrastructure Implementation (상세 가이드)

### 2.1 ECR Repository & Docker Build
1. **ECR 리포지토리 생성**: `taco4/graphnode-ai` (Private).
    - Scan on push: Enable 권장.
2. **GitHub Secrets 설정** (Action을 위한 권한):
    - **위치**: Repository Settings > Secrets and variables > Actions > New repository secret.
    - **필수 키 목록**:
        - `AWS_ACCESS_KEY_ID`: ECR Push 및 ECS Update 권한이 있는 IAM User Key.
        - `AWS_SECRET_ACCESS_KEY`: 위 Key의 Secret.
        - `ECR_REPOSITORY`: `taco4/graphnode-ai` (위에서 만든 이름).

### 2.2 ECS Service & Task Definition
1. **Task Definition 등록**:
    - `ecs/ai-task-definition.json` 내용으로 새 Task Definition 생성.
    - **Image**: ECR URI로 설정.
    - **Network Mode**: `awsvpc` 필수.
    - **CPU/Memory**: 1vCPU / 2GB (최소 권장, 필요시 4GB 증설).
2. **Cluster 생성**: `Taco4-AI-Cluster` (Fargate 전용).
3. **Service 생성**:
    - **Launch Type**: FARGATE.
    - **Task Definition**: 위에서 만든 것의 최신 리비전.
    - **Desired Tasks**: 1 (초기값).
    - **VPC/Subnet**: **Private Subnet** 선택 (인터넷 통신 위해 NAT Gateway 필수).
    - **Security Group**: Outbound 443(HTTPS) Open (Inbound는 불필요).

### 2.3 Auto Scaling (SQS 메시지 수 기반)
CPU 기반 스케일링은 워커 패턴에 적합하지 않습니다. **SQS 대기열 수**(ApproximateNumberOfMessagesVisible)를 기준으로 스케일링해야 합니다.

1. **CloudWatch Alarm 생성**:
    - **Metric**: SQS > Queue Metrics > `ApproximateNumberOfMessagesVisible`.
    - **QueueName**: `YourRequestQueueName`.
    - **조건**: Average > 0 (또는 10, 100 등 부하 기준) for 1 datapoint within 1 minute.
    - **Alarm Name**: `GraphNode-AI-SQS-High-Depth`.
2. **ECS Service Auto Scaling 설정**:
    - Service 업데이트 > Auto Scaling 탭.
    - **Min Tasks**: 1, **Max Tasks**: 10 (예시).
    - **Scaling Policy**: Step Scaling.
        - `GraphNode-AI-SQS-High-Depth` 알람 발생 시: Add 1 Task (혹은 +50%).
        - 반대로 Queue 깊이가 0이면: Remove Task.

## 3. Feature Vector Pipeline Integration
### 3.1 Data Flow Analysis
- `Ky/src/run_pipeline.py` 실행 시 `output_dir/features.json` 생성.
- 구조 분석 및 저장 전략 수립.

### 3.2 AI Worker Update (`server/worker.py`)
- `features.json` S3 업로드 로직 추가 (Key: `results/{task_id}/features.json`).
- `GraphGenResultPayload`에 S3 Key 포함하여 반환.

### 3.3 Backend Update (`GraphNode/src`)
- **DTO**: `GraphGenResultPayload`에 `featuresS3Key` 필드 추가.
- **Handler**: `GraphGenerationResultHandler`에서:
    - S3에서 `features.json` 다운로드.
    - **Vector Storage Strategy**:
        - **Collection**: `graph_nodes_v1`.
        - **Upsert**: `ids=[nodeId]`, `embeddings=[vector]`, `metadatas={ userId, graphId, clusterId }`.
        - **Isolation**: 검색 시 `where={"userId": "..."}` 필터 사용.

## 4. End-to-End Verification
- [ ] **Request Flow**: `POST /v1/graph-ai` 호출 -> SQS 메시지 적재 확인.
- [ ] **Scaling Check**: SQS 메시지 적재 후 ECS Task 수가 자동으로 증가하는지(Auto Scaling) 모니터링.
- [ ] **Result Check**: 최종적으로 ChromaDB에 데이터가 들어갔는지 Query 확인.

## 5. Graph Summary API implementation
- [ ] `features.json` 내의 텍스트/키워드 데이터를 기반으로 그래프 요약 생성 로직 구현.
