# 작업 상세 문서 — AI Provider 구조 개편 및 파일 처리 표준화

## 📌 메타 (Meta)
- **작성일**: 2026-02-20 KST
- **작성자**: AI팀
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [Test]

---

## 📝 TL;DR (핵심 요약)
- **목표:** AI 모델(OpenAI, Gemini, Claude) 간의 파편화된 로직을 **Stateless 구조**로 통일하고, **모든 파일 형식**을 표준화된 방식으로 처리하여 유지보수성과 확장성을 확보한다.
- **결과:** 
  - `IAiProvider`: Stateless 인터페이스 정의 및 `storageAdapter` 주입 구조 확립
  - `DocumentProcessor`: PDF, Office, Code, Image 등 멀티 포맷 지원 처리기 구현
  - `AiInteractionService`: DB 조회 → 파일 처리 → Provider 호출로 이어지는 통합 파이프라인 구축
  - 3대 Provider(`openai`, `gemini`, `claude`) 리팩토링 및 유닛 테스트 통과
- **영향 범위:** AI Service Layer, Shared AI Providers, Unit Tests

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 기존 코드는 OpenAI Assistants API (Stateful)와 Chat API (Stateless)가 혼재되어 있었음.
- Provider별로 이미지/파일 처리 방식이 달라(URL vs Base64 vs File ID) 확장성이 낮음.
- 클앙이언트로부터 전달받은 `Express.Multer.File`을 각 AI 모델이 이해할 수 있는 형태(`text` 또는 `base64 image`)로 변환하는 공통 로직 부재.

### 사전 조건
- AWS S3 (또는 MinIO)가 설정되어 있어야 함 (`StoragePort` 구현체)
- 각 AI 서비스(OpenAI, Google, Anthropic)의 SDK 버전 호환성 확인

---

## 📦 산출물

### 📁 추가된 파일
- `src/shared/utils/documentProcessor.ts` — 범용 문서 처리기
- `tests/unit/DocumentProcessor.spec.ts` — 문서 처리기 테스트
- `docs/architecture/ai-provider-architecture.md` — 아키텍처 가이드

### 📄 수정된 파일
- `src/core/services/AiInteractionService.ts` — 메인 비즈니스 로직
- `src/shared/ai-providers/IAiProvider.ts` — 인터페이스 정의 (Provider Factory 역할)
- `src/shared/ai-providers/openai.ts` — OpenAI 구현체
- `src/shared/ai-providers/gemini.ts` — Gemini 구현체
- `src/shared/ai-providers/claude.ts` — Claude 구현체
- `tests/unit/AiInteractionService.spec.ts` — 서비스 테스트

---

## 🔧 상세 변경 (Method/Component)

### 1. `src/shared/ai-providers/IAiProvider.ts` (Interface)

모든 AI Provider가 따라야 할 공통 규약을 재정의했습니다. 가장 큰 변화는 `storageAdapter` 주입을 통해 Provider 내부에서 직접 파일을 다운로드하고 처리할 수 있게 된 점입니다.

```typescript
export interface IAiProvider {
  /**
   * 통합 채팅 생성 메서드 (Stateless)
   * @param apiKey API Key
   * @param params 채팅 파라미터 (모델명, 메시지 히스토리)
   * @param onStream 스트리밍 콜백 (Optional)
   * @param storageAdapter 파일 다운로드를 위한 어댑터 (필수)
   */
  generateChat(
    apiKey: string,
    params: ChatGenerationParams,
    onStream?: (delta: string) => void,
    storageAdapter?: StoragePort
  ): Promise<Result<AiResponse>>;

  // ... (API Key 검증 등 기타 메서드)
}
```

### 2. `src/shared/utils/documentProcessor.ts` (File Handling)

파일 확장자에 따라 적절한 파서를 선택하여 **텍스트** 또는 **이미지(Base64)**로 변환합니다.

#### 주요 구조 (`ProcessedDocument`)
```typescript
interface ProcessedDocument {
  type: 'text' | 'image';
  content: string; // 텍스트 내용 또는 Base64 문자열
  metadata?: any;
}
```

#### 처리 로직 (`process` 메서드)
| 확장자 | 처리 라이브러리 | 변환 결과 |
| :--- | :--- | :--- |
| **PDF** (.pdf) | `pdf-parse` | 텍스트 전체 추출 (`type: 'text'`) |
| **Word** (.docx) | `mammoth` | Raw Text 추출 (`type: 'text'`) |
| **Excel** (.xlsx) | `xlsx` | CSV/Markdown 텍스트 변환 (`type: 'text'`) |
| **PPT** (.pptx) | `officeparser` | 슬라이드 텍스트 추출 (`type: 'text'`) |
| **Code** (.js, .py 등) | Native | UTF-8 텍스트 읽기 (`type: 'text'`) |
| **Image** (.png, .jpg) | Native | Base64 인코딩 (`type: 'image'`) |

### 3. AI Provider별 구현 상세

#### A. OpenAI (`openai.ts`)
- **API**: Chat Completions API (`v1/chat/completions`)
- **로직**:
  - `text`: `{ type: "text", text: "..." }`
  - `image`: `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`
  - 텍스트와 이미지를 **하나의 메시지 배열(`content[]`)**에 담아 전송합니다.

#### B. Gemini (`gemini.ts`)
- **API**: Google Generative AI SDK (`generateContent`, `startChat`)
- **로직**:
  - **System Instruction**: `role: 'system'` 메시지를 분리하여 `model.startChat({ systemInstruction })`에 주입.
  - **Contents**:
    - `text`: `{ text: "..." }`
    - `image`: `{ inlineData: { mimeType: "...", data: "base64..." } }`
  - **History**: 마지막 메시지를 제외한 나머지를 `history`로 설정하고, 마지막 메시지는 `sendMessageStream` 인자로 전달.

#### C. Claude (`claude.ts`)
- **API**: Anthropic SDK (`messages.stream`)
- **로직**:
  - **스트리밍**: SDK Helper 이벤트인 `stream.on('text')`를 사용하여 안정적인 텍스트 델타 수신.
  - **Contents**:
    - `text`: `{ type: "text", text: "..." }`
    - `image`: `{ type: "image", source: { type: "base64", media_type: "...", data: "..." } }`

---

## 🚀 파이프라인 흐름 (Execution Flow)

`AiInteractionService.handleAIChat` 메서드에서의 전체 처리 과정입니다.

1.  **초기화**: 사용자 API Key 조회 및 `Provider Factory`를 통해 적절한 Provider(`openAI`|`gemini`|`claude`) 획득.
2.  **파일 업로드**: 요청된 파일(`Express.Multer.File`)을 S3 Bucket에 업로드하고 `Attachment` 메타데이터 생성.
3.  **히스토리 조회**: DB에서 해당 대화방의 과거 메시지(`ChatMessage[]`) 로드.
4.  **메시지 구성**: 과거 메시지 + 현재 사용자 메시지(첨부파일 포함) 병합.
5.  **Provider 호출 (`generateChat`)**:
    *   Provider 내부에서 `Attachment.url` (S3 Key)을 이용해 파일 스트림 다운로드.
    *   `streamToBuffer` 유틸로 버퍼 변환.
    *   `DocumentProcessor.process()`로 텍스트/이미지 변환.
    *   각 AI 모델 규격에 맞는 Payload(JSON) 생성 및 API 요청.
6.  **응답 처리**: 
    *   스트리밍(`onStream`)으로 클라이언트에 실시간 전송.
    *   완료 후 전체 응답(`AiResponse`)을 DB에 저장.

---

## 🧪 검증 (Verification)

### Unit Tests
*   `npm test tests/unit/AiInteractionService.spec.ts`: 서비스 로직 및 Provider 호출 흐름 검증 완료.
*   `npm test tests/unit/DocumentProcessor.spec.ts`: 파일 타입별 파싱 및 에러 핸들링 검증 완료.

---

## 🛠 구성 / 가정 / 제약
- **Stateless**: 대화 맥락 유지를 위해 매 요청마다 전체 히스토리를 전송하므로, 대화가 길어질수록 토큰 비용이 증가할 수 있음 (향후 요약/Truncation 도입 고려).
- **이미지**: URL 방식이 아닌 Base64 방식을 채택하여 보안 및 링크 만료 문제 해결.

---

## � 변경 이력
- v1.0 (2026-02-20): AI Provider 아키텍처 개편 및 문서화 완료.
