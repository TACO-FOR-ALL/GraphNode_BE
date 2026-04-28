# Macro Graph Migration & Graph RAG Implementation Roadmap

본 문서는 MongoDB에서 Neo4j로의 Macro Graph 마이그레이션 완수와, 이를 기반으로 한 Graph RAG 시스템 구축을 위한 상세 계획서입니다. 다른 AI 에이전트 및 개발자는 작업 진행 시 이 문서를 기준으로 상태를 업데이트하고 맥락을 파악해야 합니다.

---

## [Phase 1] 마이그레이션 완수 및 데이터 정합성 확보

**목표**: 기존 MongoDB 데이터를 Neo4j의 관계형 구조로 안전하게 이관하고 운영 환경 제약 조건을 적용한다.

- [x] **마이그레이션 도구 구축**: `scripts/sync-macro-graph.ts` 및 `Neo4jMacroGraphAdapter` 구현 완료.
- [x] **통합 테스트 검증**: `macro-consistency.spec.ts` 통과. (MongoDB <-> Neo4j 변환 로직 검증)
- [x] **E2E 테스트 시나리오 통과**: `graph-flow.spec.ts`를 통한 실시간 Dual Write 로직 검증 완료.
- [ ] **운영 환경 벌크 마이그레이션 실행**: 실제 운영 DB의 수천 개 데이터를 Neo4j로 이관.
- [ ] **Neo4j 제약 조건(Constraint) 최종 검증**: `NODE KEY` 및 `UNIQUE` 제약 조건이 운영 데이터 수준에서도 충돌 없이 작동하는지 확인.

> **Key Point**: Neo4j는 `userId`와 `id`의 조합을 유니크 키로 사용하며, `MacroRelation` 노드를 통해 관계를 구체화(Reification)하여 저장합니다.

---

## [Phase 2] 실시간 정합성 모니터링 (Shadow Mode)

**목표**: Dual Write 상태에서 발생하는 미스매치를 실시간으로 감지하고 대응한다.

- [ ] **Shadow Read 모니터링 활성화**: `DualWriteGraphStoreProxy`의 `shadowReadCompare` 옵션을 운영 환경에 적용.
- [ ] **실시간 알림 관측**:
  - **Sentry**: `captureMacroGraphConsistencyMismatch`를 통한 상세 Diff 분석.
  - **Discord**: 운영 채널로 전송되는 미스매치 알림 실시간 모니터링.
- [ ] **에지 케이스 수정**: 미스매치 알림 발생 시 원인 분석 후 매퍼(Mapper)나 어댑터 로직 수정.
- [ ] **정기 무결성 검사**: 배치 스크립트를 통해 전체 사용자의 MongoDB와 Neo4j 데이터 카운트 대조.

> **Key Point**: 알림 시스템에는 10분간의 쿨다운과 Signature 기반 데두프(Dedupe) 로직이 포함되어 있어 알림 피로도를 최소화합니다.

---

## [Phase 3] 서비스 계층 최적화 및 MongoDB 제거

**목표**: 영속성 계층을 추상화하고 MongoDB 의존성을 완전히 제거한다.

- [ ] **GraphManagementService 리팩토링**:
  - Service 레이어(GraphManagementService만)는 오직 DTO만 다루도록 수정.
  - 데이터 가공 및 Persistence 모델 변환 로직을 Repository/Mapper 계층으로 완전히 분리.
- [ ] **영속성 계층 추상화**: `MacroGraphStore` 인터페이스를 강화하여 DB 엔진 교체가 용이한 구조로 개선.
- [ ] **Switch-over**: `DualWriteProxy`를 제거하고 `Neo4jMacroGraphAdapter`를 직접 사용하도록 전환.
- [ ] **MongoDB 데이터 정리**: `graph_` 관련 MongoDB 컬렉션 및 인덱스 삭제.

> **Key Point**: 이 단계가 완료되면 시스템은 Neo4j를 Macro Graph의 유일한 Source of Truth로 사용하게 됩니다.

---

## [Phase 4] Graph RAG 구현 및 검색 엔진 교체

**목표**: 단순 벡터 검색을 넘어 그래프 구조를 활용한 고도화된 RAG 시스템을 구축한다.

- [ ] **Hybrid 검색 엔진 구축**:
  - **Keyword (BM25)**: Neo4j Full-text Index를 활용한 키워드 검색.
  - **Semantic**: 기존 벡터 검색 결과를 결합하여 상호 보완.
- [ ] **Graph-Traversal Context 강화**:
  - 검색된 노드와 연결된 인접 노드(Relationships)를 추적하여 LLM에 더 깊은 맥락 제공.
  - 클러스터 요약 정보(Graph Summary)를 Context에 통합.
- [ ] **SearchConversationsTool 전면 교체**:
  - `src/agent/tools/SearchConversationsTool.ts`의 로직을 단순 Top-K 벡터 검색에서 Graph RAG 엔진으로 교체.
- [ ] **검색 품질 평가**: 기존 단순 검색 대비 Graph RAG의 답변 정확도 비교 및 튜닝.

> **Key Point**: Graph RAG는 사용자의 질문에서 키워드와 의미를 동시에 추출하고, 그래프 상의 관계망을 이용해 "연관된 지식의 뭉치"를 한꺼번에 LLM에게 전달하는 것이 핵심입니다.

---

## [Phase 5] 최종 안정화 및 사후 문서화

**목표**: 시스템을 최종 검증하고 지식을 문서로 남긴다.

- [ ] **DATABASE.md 최신화**: Neo4j 기반의 새로운 ERD 및 인덱스 구조 명시.
- [ ] **Graph RAG 아키텍처 문서화**: 검색 흐름 및 컨텍스트 강화 로직을 `docs/architecture/`에 기록.
- [ ] **성능 최적화**: 운영 환경 쿼리 실행 계획(EXPLAIN/PROFILE) 분석을 통한 Cypher 쿼리 튜닝.
- [ ] **프로젝트 완결 보고**: 전체 마이그레이션 및 신규 기능 도입 결과 보고.

---

**주의 사항**: 모든 코드 수정은 `Daily Dev Log` 규칙을 준수하여 기록해야 하며, 특히 API 명세 변경 시 `openapi.yaml` 및 FE SDK 동기화를 잊지 마십시오.
