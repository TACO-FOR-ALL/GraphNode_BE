# 작업 상세 문서 — Backend Multi-Source Graph 생성 사전 준비 및 리포트

## 📌 메타 (Meta)
- **작성일**: 2026-02-27 KST
- **작성자**: 백엔드 팀 (AI Agent)
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** Chat 기록과 Markdown 기반 Note 기록을 함께 결합한 3-Mode Graph 파이프라인 연동을 위한 백엔드 작업 및 설계 검증.
- **결과:** 매핑 불일치 등 다중 소스 처리에서의 구조적 이슈를 파악하고, 백엔드 차원에서의 대응 및 TODO 리스트 작성.
- **영향 범위:** `GraphGenerationService` 및 SQS 통신, 결과 수신 핸들러인 `GraphGenerationResultHandler`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 여러 소스 (채팅, 노트)에서 파생된 Node들을 하나의 통합 그래프 내에서 생성하고 반환해야 함.
- Note 객체의 ID를 AI 파이프라인이 임의로 조작하거나 변조하는 문제를 방지하여 백엔드 DB와 노드가 완벽하게 매핑(Tracking)되도록 설계해야 함.

---

## 📦 산출물

### 📄 수정된 파일
- `src/core/services/GraphGenerationService.ts` — Multi-source 요청 인자 리팩토링 및 사용자 언어 주입 로직 사전 뼈대 부착
- `src/app/controllers/GraphAiController.ts` — 클라이언트의 불필요 매개변수(`inputType` 등) 제거
- `src/infra/repositories/GraphRepositoryMongo.ts` — `sourceType` 미존재 시 `chat`으로 강제 자동 할당(Lazy Migration) 로직 구현 완료

---

## 🔧 현존 문제점 (Multi-source 적용이 완료되지 못한 이유)

현재 AI Worker (`worker.py`)에서 Markdown 파일을 ZIP 압축 형태로 S3에 올려 `--extra-input` 방식으로 파이프라인에 투입할 수 있습니다. 
하지만 이 방식을 도입할 경우, 다음의 **ID 매핑 문제**에 직면합니다.
1. AI 서버의 `markdown_loader.py`가 개별 .md 파일들을 파싱할 때 노드의 `origId`를 고유한 자체 문자열(예: `md_1_note12345`)로 강제 할당합니다.
2. 결과값으로 받은 Node들이 기존 백엔드 상의 어떤 Note Document와 결합되어 존재하는지 정확히 매핑하여 DB의 데이터를 업데이트하거나 UI에서 눌렀을 때 특정 노트를 띄워주는 작업이 불가능해집니다.

---

## 🔜 다음 작업 / TODO (필수 구현 과제)

이 문제를 해결하고 Multi-source Graph 처리를 완성하기 위해, 백엔드는 S3에 ZIP으로 노트를 묶어서 보내는 우회 방식을 폐기하고, **모든 소스 노드 구조(SourceNode)를 하나의 커다란 JSON으로 직접 매핑하여 업로드(`s3Key` 당일 사용)하는 통합 방식**을 사용해야 합니다.

향후 수행되어야 할 주요 작업 목록은 다음과 같습니다.

1. **`GraphGenerationService.ts` 개선**
   - 사용자 소유의 대상 노트(Note)들을 DB에서 일괄 조회하는 로직 구현
   - 채팅 데이터(ChatGPT 형식 등)와 노트 데이터들을 AI 서버가 요구하는 `SourceNode` (`{"source_nodes": [...] }`) 규격의 거대 JSON으로 직렬화 및 병합
   - `extraS3Keys`, `inputType` 등을 사용하지 않고 오로지 병합된 JSON 파일 하나만 S3에 업로드
2. **`GraphGenerationResultHandler.ts` 개선**
   - Worker 응답을 파싱하여 DB에 저장할 때, `sourceType` (`"chat" | "markdown" | "notion"`) 값을 올바르게 판별하여 반영
   - 기존의 대화(conversation) 중심의 뷰를 벗어나, 노트와 채팅 노드 간의 엣지를 완벽하게 저장할 수 있는 로직 지원
3. **`GraphRepositoryMongo.ts` 대응 완료 (사전 작업 처리 완료)**
   - 이미 DB에서 데이터 획득 시 `sourceType`이 없으면 기본값인 `'chat'`으로 읽기/기록을 자가 치유(Lazy migration/Read-repair)하는 프로세스를 성공적으로 삽입함.
