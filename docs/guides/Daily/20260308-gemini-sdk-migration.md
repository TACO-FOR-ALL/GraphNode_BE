# 작업 상세 문서 — Gemini SDK 마이그레이션 (@google/genai) 및 기본 모델 변경

## 📌 메타 (Meta)
- **작성일**: 2026-03-08 KST
- **작성자**: Antigravity (AI Assistant)
- **버전**: v1.0
- **관련 이슈/PR**: Gemini SDK 고도화 및 gemini-3-flash-preview 적용
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 기존 `@google/generative-ai` SDK를 최신 `@google/genai` (Gen AI JS SDK)로 교체하고, 기본 모델을 `gemini-3-flash-preview`로 업데이트하여 성능 및 최신 기능 지원 강화.
- **결과:** SDK 마이그레이션 완료, 스트리밍 채팅 및 제목 생성 로직 최신 SDK 패턴에 맞게 최적화, 기능 검증 완료.
- **영향 범위:** `src/shared/ai-providers/gemini.ts`, Gemini를 사용하는 모든 AI 인터랙션 레이어.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 구형 SDK(`@google/generative-ai`)에서 신형 SDK(`@google/genai`)로의 전환.
- 기본 탑재 모델을 최신 미리보기 모델인 `gemini-3-flash-preview`로 변경.
- API 키 유효성 검증 로직 최신화.

### 사전 조건/선행 작업
- `@google/genai` 패키지 설치 및 피어 디펜던시(`@modelcontextprotocol/sdk`) 해결.

---

## 📦 산출물

### 📁 추가된 파일
- `test-gemini.ts` — 마이그레이션 검증을 위한 독립 테스트 스크립트.

### 📄 수정된 파일
- `src/shared/ai-providers/gemini.ts` — SDK 교체 및 호출 로직 리팩토링.
- `package.json` — 의존성 업데이트 (@google/genai 추가, @google/generative-ai 제거).

### 🗑 삭제된 파일
- (없음)

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/shared/ai-providers/gemini.ts`
- **SDK 초기화**: `GoogleGenAI` 클래스를 통한 객체 지향적 초기화 방식으로 변경.
- **`generateChat`**: 
  - `generateContentStream` 메서드를 사용하여 비동기 스트리밍 구현.
  - 최신 SDK의 `AsyncGenerator` 패턴에 맞춰 `for await` 루프 수정.
  - 시스템 지시문(System Instruction) 설정 방식 고도화.
- **`requestGenerateThreadTitle`**: 
  - `generateContent`를 통한 단일 응답 처리 및 JSON 파싱 로직 안정화.
- **`normalizeError`**:
  - 신규 SDK의 에러 구조와 HTTP 상태 코드를 매핑하여 기존 시스템 에러 코드와 호환성 유지.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Node.js 환경에서 Gemini API 실 키 필요.

### 📦 설치
```bash
npm install @google/genai @modelcontextprotocol/sdk
npm uninstall @google/generative-ai
```

### ▶ 실행
```bash
npx ts-node --transpile-only test-gemini.ts
```

### 🧪 검증
- API 키 검증 (OK)
- `gemini-3-flash-preview` 모델을 통한 스트리밍 채팅 (OK)
- JSON 포맷을 이용한 스레드 제목 생성 (OK)

---

## 🛠 구성 / 가정 / 제약
- `gemini-3-flash-preview` 모델은 AI Studio에서 발급받은 일반 API 키로 별도 권한 설정 없이 즉시 사용 가능한 것으로 가정함.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **SDK 인터페이스 혼동**: 초기 마이그레이션 시 `streamResponse.stream` 프로퍼티를 찾으려 했으나, 최신 SDK는 응답 객체 자체가 `AsyncGenerator`임을 확인하여 수정함.
- **피어 디펜던시**: `@google/genai` 사용 시 `@modelcontextprotocol/sdk`가 명시적 의존성이 아님에도 타입 체크 단계에서 필요하여 추가 설치함.

---

## 📜 변경 이력
- v1.0 (2026-03-08): 최초 마이그레이션 문서 작성

---

## 📎 참고 / 링크
- [Google Gen AI SDK for JavaScript Documentation](https://ai.google.dev/gemini-api/docs/api-key?hl=ko#javascript)
