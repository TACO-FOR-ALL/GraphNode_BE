# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added (2026-04-29)

- **Graph RAG 검색 API** (`GET /v1/search/graph-rag`): ChromaDB 벡터 유사도 Seed 추출 + Neo4j 1홉/2홉 MACRO_RELATED 이웃 탐색 결합 검색
- **Neo4j Macro Graph 어댑터** (`Neo4jMacroGraphAdapter`): upsertGraph(전체 교체), upsertNode/upsertEdge(증분 쓰기), searchGraphRagNeighbors
- **Agent Graph RAG 도구**: AgentService에 Graph RAG 컨텍스트 활용 채팅 스트림 추가
- **DevTest 엔드포인트**: `POST /dev/test/search/graph-rag`, `POST /dev/test/agent/graph-rag-chat` (SSE) — 로컬 인증 없이 Postman 테스트 가능
- **문서 분리·최신화**: `DATABASE.md` → 5개 문서로 분리 (`DATABASE_ERD.md`, `DATABASE_NEO4J.md`, `DATABASE_SCHEMA_PG.md`, `DATABASE_SCHEMA_MONGO.md`), `ARCHITECTURE.md` PostgreSQL/ChromaDB 반영 수정

---

### Added (이전 기록)

- Google OAuth2 로그인 플로우: `/auth/google/start`, `/auth/google/callback`
- 세션 기반 인증(쿠키 정책: `__Host-session; HttpOnly; Secure; SameSite`)
- `/v1/me` — 사용자 프로필 응답(Problem Details 오류 규격 적용)
- 문서 포털(`docs/index.html`), OpenAPI/TypeDoc CI 배포(gh-pages)
- 노트, 폴더, 대화 Trash(삭제된 항목) 관리 및 휴지통 조회 API (`/v1/notes/trash`, `/v1/ai/conversations/trash`)
- 노트/대화 삭제 시 연결된 그래프 데이터 연쇄 처리(Linked Deletion/Restore)
- 폴더 삭제 시 하위 폴더 및 노트 재귀 처리(Cascade Delete/Restore)
- 프론트엔드 SDK(`z_npm_sdk`) 휴지통 조회 메서드 및 DTO 추가

### Changed

- 라우트/컨트롤러 분리, 공통 로그인 유틸(`completeLogin`) 도입

### Removed

- resume token 기능 및 관련 엔드포인트/문서
