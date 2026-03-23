# 작업 상세 문서 — BulkCreate 대화 제목 유동적 생성 및 404 로그 억제

## 📌 메타 (Meta)
- **작성일**: 2026-03-07 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 프론트엔드에서 대량의 JSON 데이터를 Import 할 시, 대화 데이터 중 제목(`title`) 값이 누락되었을 때 발생하는 검증 에러(400 Bad Request)를 해결하고, 서버에서 404 Not Found 에러 응답 시 로그가 불필요하게 출력되는 문제를 억제합니다.
- **결과:** 
  1. `bulkCreate` 요청 시 제목을 필수 값이 아닌 유동적인 값으로 처리하도록 스키마 및 인터페이스 변경.
  2. 제목이 누락된 경우, 해당 대화의 첫 번째 메시지 내용 앞 10글자를 추출하여 자동 생성하는 로직 추가.
  3. `server.ts`의 전역 404 핸들러에서 로거의 레벨을 `silent`로 변경하여 불필요한 404 로그 출력 억제.
- **영향 범위:** 
  - `POST /v1/ai/conversations/bulk` API의 검증 기준 완화.
  - 존재하지 않는 라우트 호출 시 콘솔 및 클라우드 워치 로그 출력 빈도 감소.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 프론트엔드에서 외부 JSON 대화 데이터를 파싱하여 Bulk Create API로 넘길 때, 제목이 없는 대화 건들로 인해 전체 동기화 과정이 실패(Validation Error)하는 문제가 존재했습니다.
- 보안 스캐닝 등으로 인해 존재하지 않는 엔드포인트(404)를 무작위로 탐색하는 요청들이 들어왔을 때, 불필요한 서버 로그가 폭증하는 현상을 방지하고자 하였습니다.

### 사전 조건/선행 작업
- 프론트엔드에서 OpenAI 대화 형태의 JSON을 파싱하는 로직 (`parseConversations`)
- Zod 기반 유효성 검사 스키마 (`ai.schemas.ts`) 구성
- 중앙 집중식 HTTP 요청 로깅 구조 (`pino-http`) 적용

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/dtos/ai.schemas.ts` — `bulkCreate` 시 대화 제목(`title`) 필드 검증 조건 완화(`optional`, `nullable`)
- `src/core/services/ChatManagementService.ts` — 대화 생성 및 Bulk 생성 메서드에서 제목 자동 생성 로직 반영, 타입 지원
- `src/bootstrap/server.ts` — 404 Not Found 에러 핸들러 내에 로거 억제(`silent`) 로직 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
#### `src/shared/dtos/ai.schemas.ts`
- **`createConversationSchema`**: `title` 필드를 `z.string().min(1, ...)`에서 `z.string().max(200, ...).optional().nullable()`로 변경.
  
#### `src/core/services/ChatManagementService.ts`
- **`createConversation` / `bulkCreateConversations`**:
  - 인자 `title`의 타입을 `string | null | undefined` 등을 허용하도록 변경.
  - 제공된 `title`이 없거나 빈 문자열일 경우, `thread.messages[0].content`의 앞 10글자 추출 후 `...`를 붙여 제목으로 자동 생성.
  - 메시지마저 존재하지 않으면 `New Conversation`을 기본값으로 할당.

#### `src/bootstrap/server.ts`
- **`createApp()` 전역 404 에러 미들웨어**:
  - 기존: `res.status(404).json({ message: "Not Found" });` 만 수행.
  - 변경: 응답 전에 `if ((req as any).log) { (req as any).log.level = 'silent'; }`를 추가하여 접근 로그가 기록되지 않도록 무음 처리.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Backend Node.js 환경

### 📦 설치
- 패키지 디펜던시 변경 없음.

### ▶ 실행
```bash
npm run dev
```

### 🧪 검증
1. **Bulk Create 기능 테스트**:
   - `title`이 누락되거나 빈 문자열인 JSON 데이터를 `POST /v1/ai/conversations/bulk` 엔드포인트에 전송하여 201 Created가 반환되는지 확인.
   - DB에 저장된 타이틀이 첫 메시지 본문에 기반해서 생성되었는지 확인.
2. **404 에러 로그 억제 테스트**:
   - `/idontexist`와 같이 라우터가 등록되지 않은 무효한 엔드포인트로 GET 요청을 보냄.
   - 터미널이나 서버 로그에 404 에러 응답 HTTP 로그가 남지 않음을 확인.

---

## 🛠 구성 / 가정 / 제약
- PINO 로거의 `.level = 'silent'` 처리가 현재의 미들웨어 환경(`pino-http`)에 정상적으로 주입되어 동작한다는 전제로 처리하였습니다.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 404 로깅을 원천 차단하게 되므로, 추후 클라이언트의 잘못된 라우트 호출 패턴을 디버깅하거나 분석할 때 필요한 로깅 정보까지 소실될 수 있습니다.

---

## 🔜 다음 작업 / TODO
- 프론트엔드 `parseConversations.ts`의 로컬 JSON 파싱 과정에 아웃박스(Outbox) 패턴 연동.
- SDK 단의 타입 최신화 여부 검증.

---

## 📎 참고 / 링크
- 없음

---

## 📜 변경 이력
- v1.0 (2026-03-07): 최초 작성
