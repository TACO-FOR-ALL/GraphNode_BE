# 작업 상세 문서 — GraphAi SDK 딜리트 API JSON 파싱 버그 수정

## 📌 메타 (Meta)
- **작성일**: 2026-03-01 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [SDK]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드 서버에서 발생하는 `Unexpected token '"', ""/v1/graph-ai"" is not valid JSON` 에러 수정
- **결과:** FE SDK의 `graphAi.ts` 내장 `deleteGraph`, `deleteSummary` 함수들이 HTTP Request 바디로 API 경로 문자열을 실수로 전달하던 로직 오류 수정
- **영향 범위:** `z_npm_sdk/src/endpoints/graphAi.ts` (NPM SDK 모듈)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- GraphNode 서버로 Graph 삭제(`DELETE /v1/graph-ai`)를 요청할 때 JSON 파싱 SyntaxError 가 계속 발생하고 있었습니다.
- 프론트엔드/클라이언트 코드가 SDK의 `deleteGraph()` API를 호출하면 백엔드 서버에서 `unknownToAppError`가 실행되며 500 에러를 반환하는 문제가 생겼습니다.

### 사전 조건/선행 작업
- Axios 래퍼인 `RequestBuilder`의 `.delete<T>(body?)` 시그니쳐 파악
- 기존 로직은 `.delete('/v1/graph-ai')` 처럼 호출하여 바디 값으로 `"/v1/graph-ai"` 문자열을 전달함. 이를 Express의 `express.json()`이 해석하려다 JSON Syntax 오류를 일으켰습니다.

---

## 📦 산출물

### 📄 수정된 파일
- `z_npm_sdk/src/endpoints/graphAi.ts` — `deleteGraph` 및 `deleteSummary` 메서드 URL/Query 조립 로직 수정

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `z_npm_sdk/src/endpoints/graphAi.ts` — `deleteGraph`, `deleteSummary`
  - 기존: `this.rb.delete<void>('/v1/graph-ai')` 와 같이 `delete` 메서드의 인자로 path를 넘기어 body에 URL string이 할당되던 이슈를 막았습니다.
  - 변경: `this.rb.query(options?.permanent ? { permanent: true } : undefined).delete<void>()` 와 같이 올바른 URL builder 패턴을 사용하여 빈 body와 올바른 query parameter로 전송하도록 수정하였습니다. `deleteSummary` 에 대해서도 동일한 수정을 적용하였습니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🛠 검증
- 백엔드 서버 재기동(`npm run dev`) 및 FE SDK 빌드 수행
- Frontend 측에서 `sdk.graphAi.deleteGraph()` 메서드 실행 시 500 JSON Parsing 에러 없이 정상적으로 204 No Content 혹은 권한처리가 동작하는지 확인합니다.

---

## 📜 변경 이력
- v1.0 (2026-03-01): 최초 작성
