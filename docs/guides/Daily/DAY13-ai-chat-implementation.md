# 작업 완료 보고서: AI Chat 기능 구현

## 1. 개요

사용자의 채팅 메시지를 받아 AI(OpenAI)와 대화하고, 그 결과를 저장 및 반환하는 `handleAIChat` 기능을 구현하였습니다. 이를 위해 서비스, 컨트롤러, 모듈, SDK 전반에 걸쳐 수정이 이루어졌습니다.

## 2. 주요 변경 사항

### 2.1. Core Service (`src/core/services`)

- **AIChatService.ts**:
  - `UserService`를 주입받도록 수정하였습니다.
  - `handleAIChat` 메서드를 구현하였습니다.
    1. `UserService`를 통해 사용자의 API Key를 조회합니다.
    2. OpenAI API Key 유효성을 검증합니다.
    3. `ConversationService`를 통해 이전 대화 내역을 조회합니다.
    4. 이전 대화 내역과 새 메시지를 `ChatMessageRequest` 형식으로 변환하여 OpenAI에 요청을 보냅니다.
    5. OpenAI 응답을 받아 사용자의 메시지와 AI의 응답을 `MessageService`를 통해 DB에 저장합니다.
    6. 저장된 두 메시지(User, Assistant)를 반환합니다.

### 2.2. Shared Types (`src/shared`)

- **AIchatType.ts**:
  - `chatTitle` 속성을 제거하고 `model: ApiKeyModel` 속성을 추가하였습니다.
  - `ApiKeyModel`을 `src/shared/dtos/me`에서 import 하도록 수정하였습니다.

### 2.3. Bootstrap (`src/bootstrap/modules`)

- **ai.module.ts**:
  - `UserService` 인스턴스를 생성하고 `AIChatService`에 주입하도록 의존성 조립 로직을 수정하였습니다.
  - `UserRepositoryMySQL`을 사용합니다.

### 2.4. App Layer (`src/app`)

- **AiController.ts**:
  - `handleAIChat` 메서드에서 `req.body`를 `AIchatType`으로 캐스팅하고, `aiChatService.handleAIChat`을 호출하도록 수정하였습니다.
  - 응답으로 생성된 메시지 목록을 반환하도록 수정하였습니다 (`201 Created`).
- **routes/ai.ts**:
  - 채팅 요청을 처리할 라우트 `POST /conversations/:conversationId/chat`을 추가하였습니다.

### 2.5. SDK (`z_npm_sdk`)

- **endpoints/ai.ts**:
  - `AiApi` 클래스를 신규 생성하여 `chat` 메서드를 구현하였습니다.
  - `AIChatRequestDto`, `AIChatResponseDto` 타입을 정의하였습니다.
- **client.ts**:
  - `GraphNodeClient`에 `ai` 속성을 추가하고 `AiApi`를 초기화하도록 수정하였습니다.
- **index.ts**:
  - `AiApi`와 관련 DTO들을 export 하도록 수정하였습니다.

## 3. 검토 및 특이사항

- **DeepSeek 지원**: 현재는 OpenAI에 대한 검증 및 호출 로직만 구현되어 있으며, DeepSeek 모델 선택 시에 대한 처리는 TODO로 남겨두었습니다.
- **에러 처리**: API Key가 없거나 유효하지 않은 경우 `ValidationError`를 발생시키며, AI 서비스 호출 실패 시 `UpstreamError`를 발생시킵니다.
- **트랜잭션**: 메시지 저장은 개별적으로 이루어지므로, AI 응답 저장 실패 시 사용자 메시지만 저장될 수 있는 구조입니다. (요구사항에 따라 추후 트랜잭션 적용 고려 가능)

## 4. 향후 계획

- 테스트 코드 작성 (Mocking 활용)
- DeepSeek API 연동 구현
- RAG 등 컨텍스트 최적화 로직 추가
