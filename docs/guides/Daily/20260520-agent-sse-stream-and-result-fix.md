# 작업 상세 문서 — 에이전트 SSE 스트리밍 및 결과(result) 이벤트 누락 버그 수정

## 📌 메타 (Meta)
- **작성일**: 2026-05-20 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI] [SSE]

---

## 📝 TL;DR (핵심 요약)
- **목표:** FE의 `useAgentChat` 훅이 기대하는 규격과 BE 에이전트 SSE 처리 방식 간의 불일치를 해소하고, `summary` 및 `chat` 모드에서 실시간 스트리밍이 정상 동작하도록 지원합니다.
- **결과:**
  1. `irrelevant` 모드로 처리될 때 `result` 이벤트가 누락되어 말풍선 상태가 `completed`로 전환되지 않던 문제 해결.
  2. `summary` 모드 시 OpenAI API 호출이 비스트리밍(완성형)으로 동작하던 문제를 스트리밍(`stream: true`) 및 청크 단위 발송으로 변경하고, 마지막에 `result` 이벤트를 전송하도록 보완.
  3. `chat` 모드에서도 OpenAI API 스트리밍 수신 중 발생할 수 있는 `tool_calls`와 텍스트 청크를 조립/누적하여 처리하고, 최종 응답을 `result` 이벤트로 전송하여 FE와의 완벽한 호환성 확보.
  4. 수정된 비즈니스 로직에 대해 Mocking 기반 유닛 테스트를 작성하여 안정성을 검증 완료.
- **영향 범위:** `AgentService.ts` 내의 AI 응답 스트리밍 로직 전반

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 프론트엔드(FE) 코드를 수정할 수 없으므로 백엔드 단에서 FE 에이전트 스트림 훅(`useAgentChat.ts`)이 사용하는 이벤트(`chunk`, `status`, `result`) 사양에 맞춰 SSE 흐름을 수정해야 함.
- 특히 `rejection` 혹은 `irrelevant` 시에 `result` 이벤트가 빠져 말풍선이 계속 대기 상태로 머무는 버그와 `summary/chat` 모드에서 스트리밍이 미작동하여 단번에 결과만 출력되는 실시간 타이핑 UX 누락을 개선.

---

## 📦 산출물

### 📁 추가된 파일
- `tests/unit/AgentService.spec.ts` — `AgentService` 스트리밍 및 모드 판정 결과 검증을 위한 Mock 기반 유닛 테스트 코드

### 📄 수정된 파일
- `src/core/services/AgentService.ts` — `irrelevant` 모드 결과 이벤트 발송 추가, `summary` 및 `chat` 모드 스트리밍 지원 및 `tool_calls` 누적 조립 처리, 최종 결과 발송 구현.

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `tests/unit/AgentService.spec.ts`
- `irrelevant 모드 판정 및 환불 테스트` — 무관계 질문 시 `result` 이벤트 발송 및 크레딧 환불 함수 호출 검증
- `summary 모드 스트리밍 테스트` — OpenAI 스트림 호출 및 `chunk` 누적 전송, 완료 시 `result` 전송 검증
- `note 모드 스트리밍 테스트` — `noteContent`가 실려가는 결과(result) 이벤트 검증
- `chat 모드 스트리밍 테스트 (일반)` — 일반적인 대화 상황의 스트리밍 및 최종 결과 전송 검증
- `chat 모드 스트리밍 테스트 (도구 호출)` — AI가 `tool_calls`를 보냈을 때 백엔드 단에서 도구들을 실행하고 히스토리에 기입 후, 최종 응답까지 순차 스트리밍하는 루프 검증

### ✏ 수정 (Modified)

#### `src/core/services/AgentService.ts`
- `handleChatStream`: `mode === 'irrelevant'` 조건 분기에 `result` 이벤트 추가.
- `handleChatMode`: `openai.chat.completions.create`를 `stream: true`로 구동. 스트림 청크를 읽어들여 일반 텍스트는 `chunk`로 바로 보내고, `tool_calls`는 chunk 내 `index` 기반으로 맵에 누적 조립. 스트림 종료 시 `tool_calls`가 존재하면 검색 중 상태 전송 및 도구 루프를 구동하고, 없으면 루프를 종결하며 최종 `result` 이벤트 발송.
- `handleSummaryMode`: `openai.chat.completions.create`를 `stream: true`로 구동하며, 청크 단위로 스트리밍한 뒤 `result` 이벤트로 완료 처리.

---

## 🚀 재현/실행 절차 (Onboarding)

### ▶ 실행 (유닛 테스트 구동)
```bash
npx jest tests/unit/AgentService.spec.ts
```

### 🧪 검증 결과
- 모든 5개 테스트 케이스 정상 통과 완료 (`PASS tests/unit/AgentService.spec.ts`)

---

## 📎 참고 / 링크
- [README.md](../../../README.md)
- [AgentService.ts](../../../src/core/services/AgentService.ts)

---

## 📜 변경 이력
- v1.0 (2026-05-20): 최초 작성
