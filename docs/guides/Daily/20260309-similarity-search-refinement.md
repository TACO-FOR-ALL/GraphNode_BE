# 작업 상세 문서 — 유사도 검색 API 및 데이터 보강 (Enrichment)

## 📌 메타 (Meta)
- **작성일**: 2026-03-09 KST
- **작성자**: Antigravity (AI Agent)
- **버전**: v1.1
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 벡터 유사도 검색 결과를 MongoDB 노드 데이터와 결합(Enrichment)하여 프론트엔드에 최적화된 API 제공
- **결과:** `/v1/graph/search` API 구현, `GraphVectorService` 리팩토링, FE SDK 동기화, 빌드 에러 해결
- **영향 범위:** `GraphRouter`, `GraphController`, `GraphVectorService`, `AgentRouter`, `z_npm_sdk`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- ChromaDB의 벡터 검색 결과를 바탕으로 MongoDB의 실제 노드 필드(label, clusterName 등)를 포함하여 반환해야 함.
- `GraphNodeVectorMetadata`의 식별자 체계 정립 (`orig_id`를 통한 매핑).
- 기존 `GraphVectorRepository` 레이어의 불필요한 복잡성 제거 및 `VectorStore` 직접 참조.
- AI Agent의 `search_conversations` 도구가 변경된 서비스 규약을 따르도록 수정.

### 사전 조건/선행 작업
- AI 워커(`worker.py`)의 `macro_node` 컬렉션 및 메타데이터 구조 분석 완료.

---

## 📦 산출물

### 📁 추가된 파일
- 없음 (기존 구조 내 확장)

### 📄 수정된 파일
- `src/core/ports/VectorStore.ts` — `MacroNodeSearchResult` 인터페이스 정의
- `src/core/types/vector/graph-features.ts` — `GraphNodeVectorMetadata` 정합성 수정
- `src/infra/vector/ChromaVectorAdapter.ts` — 검색 결과 규약 준수 구현
- `src/infra/repositories/GraphRepositoryMongo.ts` — `findNodesByOrigIds` 대량 조회 구현
- `src/core/services/GraphVectorService.ts` — 데이터 보강 로직(Enrichment) 구현 및 리팩토링
- `src/app/routes/GraphRouter.ts` / `GraphController.ts` — 검색 API 엔드포인트 추가
- `src/app/routes/AgentRouter.ts` — 에이전트 도구 매핑 로직 수정 (Hotfix)
- `src/infra/repositories/MemoryVectorStore.ts` — 인터페이스 호환성 수정 (Hotfix)
- `z_npm_sdk/src/endpoints/graph.ts` / `src/types/graph.ts` — SDK 검색 기능 추가
- `docs/api/openapi.yaml` — API 명세 공식 업데이트

### 🗑 삭제된 파일
- `src/infra/repositories/GraphVectorRepository.ts` — 불필요한 레이어로 제거

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/core/services/GraphVectorService.ts`
- `searchNodes(userId, queryVector, limit)` — 벡터 유사도 검색 후 MongoDB 데이터를 결합하여 반환하는 핵심 비즈니스 로직.

### ✏ 수정 (Modified)
- `VectorStore.search()` — 반환 타입을 `MacroNodeSearchResult[]`로 구체화하여 메타데이터 접근성 보장.
- `GraphManagementService.findNodesByOrigIds()` — 다수의 `orig_id`를 기반으로 노드 정보를 효율적으로 조회.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Node.js environment
- MongoDB & ChromaDB (Local or Container)

### ▶ 실행
```bash
npm run build
npm run dev
```

### 🧪 검증
- `POST /v1/graph/search` 호출 시, 노드 정보와 유사도 점수가 포함된 배열 반환 확인.
- `AgentRouter`의 `search_conversations` 도구 호출 시 정상적으로 데이터 필터링 수행 확인.

---

## 🛠 구성 / 가정 / 제약
- `orig_id`는 MongoDB의 `Conversation` 또는 `Note` UUID와 1:1 매칭됨을 전제로 함.
- ChromaDB 컬렉션은 `macro_node_all_minilm_l6_v2` 명칭을 사용함.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **빌드 에러**: `VectorStore` 인터페이스 변경으로 `MemoryVectorStore`와 `AgentRouter`에서 타입 불일치 발생 -> 즉시 핫픽스 적용 및 `npm run build` 통과 확인.

---

## 🔜 다음 작업 / TODO
- 대용량 데이터 환경에서의 벡터 검색 성능 최적화.
- 프론트엔드 UI 연결 및 사용자 피드백 반영.

---

## 📜 변경 이력
- v1.0 (2026-03-08): 최초 설계 및 구현
- v1.1 (2026-03-09): 빌드 에러 해결 및 최종 문서화
