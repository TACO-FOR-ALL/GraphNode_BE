# 20260429 — Graph RAG DevTest 엔드포인트 구축 및 문서 최신화

> 날짜: 2026-04-29

## 작업 내용

### 1. DevTest 엔드포인트 추가 (`src/app/routes/DevTestRouter.ts`)

로컬 개발 시 Postman으로 인증 없이 테스트할 수 있는 엔드포인트 2개 추가.

#### `POST /dev/test/search/graph-rag`

Graph RAG 검색 엔드포인트 로컬 테스트용.

**Request body:**
```json
{
  "userId": "dev-test-user",
  "q": "검색 키워드",
  "limit": 10
}
```

- `userId` 미입력 시 `"dev-test-user"` 기본값
- `limit` 범위: 1–50 정수 (미입력 시 서비스 기본값 사용)
- 내부: `SearchService.graphRagSearch()` 직접 호출 → JSON 응답 반환

#### `POST /dev/test/agent/graph-rag-chat` (SSE)

AgentService의 Graph RAG 기반 채팅 스트림 로컬 테스트용.

**Request body:**
```json
{
  "userId": "dev-test-user",
  "userMessage": "내 최근 노트 보여줘",
  "contextText": "(선택)",
  "modeHint": "(선택)"
}
```

- SSE 스트림 응답 (`Content-Type: text/event-stream`)
- 내부: `AgentService.handleChatStream()` → `sendEvent(event, data)` 콜백 패턴 재현
- `userMessage` 빈 문자열 시 `error` 이벤트 즉시 반환

### 2. 문서 최신화

#### DATABASE.md 분리 (661줄 → 5개 문서)

| 문서 | 내용 |
|---|---|
| `DATABASE.md` | Polyglot Persistence 전략 인덱스 (단축 링크) |
| `DATABASE_ERD.md` | ERD 다이어그램 4종 (Core, Microscope, Macro Graph, Vector DB) |
| `DATABASE_NEO4J.md` | Neo4j 그래프 모델 + Graph RAG 파이프라인 + Cypher 전략 |
| `DATABASE_SCHEMA_PG.md` | PostgreSQL 상세 스키마 (Prisma 기준) |
| `DATABASE_SCHEMA_MONGO.md` | MongoDB 컬렉션 상세 스키마 |

#### ARCHITECTURE.md 오류 수정

- MySQL → PostgreSQL 수정 (다이어그램 + 데이터 레이어 테이블)
- ChromaDB 노드 추가 (다이어그램, Worker→ChromaDB 연결 포함)
- Graph RAG 데이터 흐름 섹션 추가

#### 기타 최신화

- `src/infra/CLAUDE.md`: Neo4j 어댑터 구조 상세 추가 (cypher/, mappers/)
- `docs/CLAUDE.md`: 신규 4개 문서 링크 및 빠른 참조 테이블 갱신
- `docs/guides/Chroma_Neo4j.md`: GraphNode 특화 구현 가이드로 전면 교체

## 관련 파일

- `src/app/routes/DevTestRouter.ts`
- `src/core/services/SearchService.ts` — `graphRagSearch()`
- `src/agent/AgentService.ts` — `handleChatStream()`
- `docs/architecture/DATABASE_NEO4J.md` (신규)
- `docs/architecture/DATABASE_ERD.md` (신규)
- `docs/architecture/DATABASE_SCHEMA_PG.md` (신규)
- `docs/architecture/DATABASE_SCHEMA_MONGO.md` (신규)
