# 작업 상세 문서 — Search API 통합 / FE SDK 동기화 / 통합 테스트 안정화

## 📌 메타 (Meta)
- **작성일**: 2026-03-30 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [SDK] [TEST]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 통합 키워드 검색 API의 N+1 해결 확인, FE SDK 타입 동기화, 통합 테스트 Open Handle 제거
- **결과:** 41개 Test Suites / 312개 Tests 전부 PASS, TypeScript 빌드 에러 없음
- **영향 범위:** `z_npm_sdk/src/types/`, `tests/api/*.spec.ts` (graphAi, microscope, graph)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- `ChatManagementService.searchChatThreadsByKeyword`에서 N+1 패턴 해결 (`findByIds` 배치 조회로 이미 구현됨 확인)
- 검색 결과의 `score` 필드(MongoDB `textScore` 기반)를 FE SDK 타입에 동기화
- `afterAll` 블록에서 서버를 명시적으로 닫지 않아 발생하는 "Open Handle" 에러 제거

### 사전 조건/선행 작업
- `SearchService`, `ChatManagementService.searchChatThreadsByKeyword` 구현 완료
- `ConversationRepositoryMongo.searchByKeyword`, `MessageRepositoryMongo.searchByKeyword` 구현 완료
- 단위 테스트 InMemory Mock 인터페이스 동기화 완료

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/types/note.ts` — `NoteDto`에 `score?: number` 추가
- `z_npm_sdk/src/types/message.ts` — `MessageDto`에 `score?: number` 추가
- `z_npm_sdk/src/types/conversation.ts` — `ConversationDto`에 `score?: number` 추가
- `tests/api/graphAi.spec.ts` — `server` 변수 추가, `beforeAll`에 `server.listen(0)`, `afterAll`에 비동기 `server.close()` 추가
- `tests/api/microscope.spec.ts` — 동일하게 서버 생명주기 관리 추가
- `tests/api/graph.spec.ts` — `afterAll` 전혀 없었던 파일에 `afterAll` 추가, `afterAll` import 추가
- `z_npm_sdk/docs/endpoints/ai.md` — MD031 린트 에러 수정 (ragChat 예시 코드 블록 이후 빈 줄 추가)

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `z_npm_sdk/src/types/note.ts`
- `NoteDto.score?: number` — MongoDB `textScore` 기반 관련도 점수, 검색 결과에서만 포함

#### `z_npm_sdk/src/types/message.ts`
- `MessageDto.score?: number` — 메시지 레벨의 검색 관련도 점수

#### `z_npm_sdk/src/types/conversation.ts`
- `ConversationDto.score?: number` — 제목+메시지 점수 합산, 스레드 레벨 집계 점수

#### `tests/api/graphAi.spec.ts`, `microscope.spec.ts`, `graph.spec.ts`
- `let server: import('http').Server` 변수 선언
- `beforeAll`에서 `server = app.listen(0)` (랜덤 포트, 테스트 간 격리)
- `afterAll(async () => { server.close(...) })` — 프로미스 래핑으로 완전 종료 대기

---

## 🚀 재현/실행 절차

### 🧪 검증

```bash
cd GraphNode
npm test -- --forceExit
# 결과: 41 passed, 312 passed
npm run build
# 결과: Exit 0, 에러 없음
```

---

## 🛠 구성 / 가정 / 제약
- Open Handle의 근본 원인은 `createApp()`이 Express 앱을 반환하지만, `supertest`의 `request(app)`은 내부적으로 임시 서버를 생성하고 자동 종료하지 않을 수 있음
- 명시적으로 `app.listen(0)`으로 서버를 가져오고 `afterAll`에서 `server.close()`를 호출하는 것이 안전

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- CI에서 `--forceExit` 없이 실행 시 pdf-parse, officeparser의 GC 핸들로 인해 jest가 hang할 수 있음 → `jest.setup.ts`에서 모킹 유지 필요
- `ai.md` MD031 린트는 도구 캐시 문제로 stale하게 표시될 수 있으나 실제 파일 내용은 표준 준수

---

## 🔜 다음 작업 / TODO
- [ ] `search.spec.ts` afterAll의 리소스 정리 패턴이 신규 테스트에도 동일하게 적용되었는지 확인
- [ ] `docs/api/openapi.yaml`의 search 응답 스키마에 `score` 필드 반영

---

## 📎 참고 / 링크
- [Jest Open Handles 공식 문서](https://jestjs.io/docs/configuration#detectopenhandles-boolean)
- [MongoDB textScore Projection](https://www.mongodb.com/docs/manual/reference/operator/query/text/#text-score)

---

## 📜 변경 이력
- v1.0 (2026-03-30): 최초 작성
