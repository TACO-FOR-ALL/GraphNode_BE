# 작업 상세 문서 — AI 대화 제목 현지화 (Language Localization)

## 📌 메타 (Meta)
- **작성일**: 2026-03-05 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 사용자의 선호 언어(Preferred Language)에 맞춰 AI가 생성하는 대화 스레드 제목이 해당 언어로 작성되도록 현지화합니다.
- **결과:** `IAiProvider` 및 각 공급자(OpenAI, Claude, Gemini)가 언어 옵션을 지원하도록 수정되었으며, `AiInteractionService`에서 사용자 설정을 조회하여 이를 전달합니다.
- **영향 범위:** AI 대화 시작 시 제목 생성 로직, AI 공급자 인터페이스 및 구현체.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 사용자가 설정한 선호 언어로 대화 제목이 자동 생성되어야 함.
- 기존의 영어/고정 언어 중심의 제목 생성 방식을 유연하게 확장.

### 사전 조건/선행 작업
- `UserService.getPreferredLanguage` 메서드 존재 확인.

---

## 📦 산출물

### 📄 수정된 파일
- `src/shared/ai-providers/IAiProvider.ts` — `requestGenerateThreadTitle` 메서드에 `language` 옵션 추가.
- `src/shared/ai-providers/openai.ts` — OpenAI 공급자 제목 생성 프롬프트에 언어 설정 반영.
- `src/shared/ai-providers/claude.ts` — Claude 공급자 제목 생성 프롬프트 및 구현부 수정 (현지화 포함).
- `src/shared/ai-providers/gemini.ts` — Gemini 공급자 제목 생성 프롬프트 및 구현부 수정 (현지화 포함).
- `src/core/services/AiInteractionService.ts` — `handleAIChat`에서 사용자의 선호 언어를 조회하여 제목 생성 시 전달하도록 로직 수정.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `src/shared/ai-providers/IAiProvider.ts`
- `requestGenerateThreadTitle(apiKey, firstUserMessage, opts)` 시그니처에 `opts.language?: string` 추가.

#### `src/shared/ai-providers/openai.ts` / `claude.ts` / `gemini.ts`
- 각 공급자의 `requestGenerateThreadTitle` 구현체에서 `opts.language`가 전달될 경우, 시스템 프롬프트 또는 명령 프롬프트에 `The title MUST be in ${opts.language}.` 지침을 추가하여 AI가 해당 언어로 출력하도록 강제합니다.

#### `src/core/services/AiInteractionService.ts`
- `handleAIChat` 메서드에서 새 대화방($isNewConversation$)이 감지될 때, `this.userService.getPreferredLanguage(ownerUserId)`를 호출하여 사용자의 언어 설정을 가져옵니다.
- `provider.requestGenerateThreadTitle` 호출 시 획득한 `preferredLanguage`를 `opts.language`로 전달합니다.

---

## 🚀 재현/실행 절차 (Onboarding)

### 🧪 검증
1. 사용자의 DB 상 `preferredLanguage`를 'Korean' 또는 'Japanese' 등으로 설정합니다.
2. 해당 사용자로 새 AI 대화를 시작합니다.
3. 생성된 대화방의 제목이 설정한 언어로 출력되는지 확인합니다.
4. `npm run build` 및 관련 파일 린트 체크를 수행합니다.

---

## 🛠 구성 / 가정 / 제약
- 사용자의 선호 언어가 명시되지 않은 경우 AI 공급자의 기본값(대체로 영어 또는 AI 판단)을 따릅니다.

---

## 📜 변경 이력
- v1.0 (2026-03-05): 최초 작성

---
