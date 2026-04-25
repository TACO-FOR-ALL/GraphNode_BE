# 작업 상세 문서 — AI Tool 3종 실제 구현 (웹 검색, 웹 스크래핑, 이미지 생성)

## 📌 메타 (Meta)
- **작성일**: 2026-04-23 KST
- **작성자**: AI Agent (Antigravity)
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** `tools.ts`에 stub으로 구현된 3개 AI tool(`web_search`, `web_scraper`, `image_generation`)을 실제 동작하는 코드로 교체하고, tool 실행 결과를 `AiResponse.attachments` / `metadata`에 담아 FE까지 전달 가능하게 만들기
- **결과:** Tavily Search API 기반 웹 검색, undici 기반 URL 스크래핑, OpenAI DALL-E 3 + S3 저장 기반 이미지 생성 완전 구현. `tsc --noEmit` 타입 에러 0개 확인
- **영향 범위:** `src/shared/ai-providers/` 하위 전 파일, `src/core/services/AiInteractionService.ts`, `src/shared/dtos/ai.ts`, `src/core/types/persistence/ai.persistence.ts`, `src/config/env.ts`

---

## 📌 배경 / 컨텍스트

### 요구 사항
- AI 채팅에서 "이미지 생성해줘", "최신 뉴스 검색해줘" 등의 요청을 실제로 처리할 수 있어야 함
- tool 실행 결과(생성 이미지 S3 키, 검색 URL 목록)를 `ChatMessage.attachments` / `metadata`를 통해 FE에 전달해야 함

### 사전 조건/선행 작업
- Vercel AI SDK 기반 ReAct 루프(`stepCountIs(5)`) 구조가 이미 구축되어 있었음
- `graphNodeTools` stub이 `AiInteractionService`에 주입되어 있었음

---

## 📦 산출물

### 📁 추가된 파일
- `src/shared/ai-providers/toolContext.ts` — tool execute()에 주입하는 런타임 컨텍스트 인터페이스 (`ToolExecutionContext`)
- `src/shared/ai-providers/toolResultCollector.ts` — Vercel AI SDK `steps[]`에서 tool 결과를 수집해 `Attachment[]` / `metadata`로 변환하는 헬퍼

### 📄 수정된 파일
- `src/shared/ai-providers/tools.ts` — stub → 실제 구현 + `createGraphNodeTools(ctx)` 팩토리 패턴으로 변경
- `src/shared/ai-providers/IAiProvider.ts` — `ChatGenerationParams`에 `toolCtx?: ToolExecutionContext` 추가, `AiResponse.metadata` 타입 구체화
- `src/shared/ai-providers/openai.ts` — tool 결과 수집 로직 추가, `toolCtx` 기반 tool 생성
- `src/shared/ai-providers/gemini.ts` — 동일
- `src/shared/ai-providers/claude.ts` — 동일
- `src/core/services/AiInteractionService.ts` — `buildToolCtx()` 메서드 추가, 3개 `generateChat` 호출에서 `tools: graphNodeTools` → `toolCtx` 방식으로 변경
- `src/config/env.ts` — `TAVILY_API_KEY: z.string().optional()` 추가
- `src/shared/dtos/ai.ts` — `ChatMessage.metadata.toolCalls` 유니온 타입 확장 (GraphNode tool 결과 + Legacy 구조 공존)
- `src/core/types/persistence/ai.persistence.ts` — `MessageDoc.metadata.toolCalls` 동일하게 확장

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `src/shared/ai-providers/toolContext.ts`
- `ToolExecutionContext` 인터페이스 — `storageAdapter`, `openaiApiKey`, `tavilyApiKey` 필드

#### `src/shared/ai-providers/toolResultCollector.ts`
- `collectToolResults(steps: any[]): CollectedToolResults` — Vercel AI SDK `steps[]` 순회
  - `image_generation` tool 결과 → `Attachment { type: 'image', url: s3Key }` 생성
  - `web_search` tool 결과 → `metadata.searchResults[]` 누적
  - `web_scraper` tool 결과 → `metadata.toolCalls` 로그 기록

### ✏ 수정 (Modified)

#### `src/shared/ai-providers/tools.ts`
- **Before**: `graphNodeTools` 상수(고정), execute() 전부 stub
- **After**: `createGraphNodeTools(ctx: ToolExecutionContext)` 팩토리 함수
  - `web_search.execute()` — Tavily API `POST /search`, 타임아웃 8초, 결과 5개
  - `web_scraper.execute()` — undici fetch, HTML → 경량 regex 텍스트 추출, 최대 8000자
  - `image_generation.execute()` — OpenAI DALL-E 3 `b64_json` 포맷, Buffer → S3 업로드(`ai-generated/UUID-날짜.png`)

#### `src/core/services/AiInteractionService.ts`
- `buildToolCtx()` 추가 — env에서 `OPENAI_API_KEY`, `TAVILY_API_KEY` 읽어서 `ToolExecutionContext` 반환
- `handleAIChat`, `handleRagAIChat`, `handleRetryAIChat` — `tools: graphNodeTools` → `toolCtx: this.buildToolCtx()` 교체

#### `openai.ts` / `gemini.ts` / `claude.ts`
- `toolCtx` 있으면 `createGraphNodeTools(toolCtx)`로 실제 tool 생성, 없으면 `params.tools` 사용 (요약 생성 등 순수 텍스트 경로)
- 스트리밍: `result.steps` await 후 `collectToolResults()` 호출
- 비스트리밍: `result.steps` 직접 `collectToolResults()` 호출
- 반환: `{ content, attachments: collected.attachments, metadata: collected.metadata }`

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- `OPENAI_API_KEY` — 필수 (DALL-E 3 이미지 생성)
- `TAVILY_API_KEY` — 선택 (미설정 시 web_search가 빈 결과 반환)

### 🧪 검증
```bash
npx tsc --noEmit   # Exit code 0 확인
npm run dev        # 서버 기동 후 AI 채팅에서 "이미지 생성해줘" 요청
```

---

## 🛠 구성 / 가정 / 제약
- 이미지 생성은 현재 모델에 상관없이 항상 OpenAI DALL-E 3를 사용 (Gemini/Claude로 채팅 중이어도)
- `Attachment.size = 0` — 생성 이미지 크기는 S3에서 별도 조회 필요 (추후 개선 대상)
- DALL-E 3는 `b64_json` 포맷으로 응답받아 Buffer 변환 후 S3에 저장하므로 메모리 사용에 주의

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- Vercel AI SDK `StepResult` 제네릭 타입이 복잡해 `collectToolResults(steps: any[])` 로 타입 완화 처리
- `toolCalls` 유니온 타입 확장 — Legacy `code_interpreter | file_search` 구조와 새 `toolName` 구조가 공존

---

## 🔜 다음 작업 / TODO
- FE SDK 타입에 `searchResults`, `attachments` 연결
- `Attachment.size` S3 메타데이터에서 실제 크기 조회
- Tool 단위 Jest 테스트 작성 (Tavily API, DALL-E mock)
- `web_scraper` 결과를 AI 응답에서 citation으로 표시하는 FE 컴포넌트

---

## 📎 참고 / 링크
- [Tavily Search API](https://docs.tavily.com/api-reference/endpoint/search)
- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images/create)
- [Vercel AI SDK — Tool Calling](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)

---

## 📜 변경 이력
- v1.0 (2026-04-23): 최초 작성
