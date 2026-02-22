# Documentation Rules & Strategy

이 문서는 프로젝트의 **문서화 표준(Command Statement)**을 정의합니다.
AI Agent 및 개발자는 작업을 수행할 때 아래 규칙을 **System Prompt**처럼 준수해야 합니다.

---

## 1. Daily Dev Log (일일 작업 기록)

**[Trigger]**
- 하나의 독립적인 기능 개발, 리팩토링, 또는 단위 작업(Task)이 완료되었을 때.

**[Action]**
1.  **템플릿 참조**: `docs/guides/templates/DAyn-devlog-template.md` 양식을 읽고 준수한다.
2.  **문서 생성**: `docs/guides/Daily/YYYYMMDD-<주제-케밥케이스>.md` 경로에 파일을 생성한다.
    - 예: `docs/guides/Daily/20260220-ai-provider-refactor.md`
3.  **내용 작성**:
    - **Header**: 작성일, 작성자, 스코프 태그([BE], [AI] 등).
    - **TL;DR**: 목표, 결과, 영향 범위를 요약.
    - **상세 변경**: 생성/수정/삭제된 파일과 핵심 로직(Method/Class)을 설명.
    - **작성 예시**: 템플릿 하단의 예시를 참고하여 구체적으로 작성.
4.  **링킹(Linking)**: `README.md`의 **"Daily Dev Logs"** 섹션에 생성한 문서를 링크한다.
    - 포맷: `- [YYYY-MM-DD <주제>](docs/guides/Daily/YYYYMMDD-<주제>.md)`

---

## 2. Architecture Documentation (아키텍처 문서화)

**[Trigger]**
- 시스템의 핵심 로직(SQS, LLM Provider, Auth, DB Schema 등)을 구현하거나 구조를 변경했을 때.
- 복잡한 비즈니스 로직(결제, 정산, 동기화 등)이 추가되었을 때.

**[Action]**
1.  **위치**: `docs/architecture/` 디렉토리 내에 주제별로 문서를 작성한다.
    - 예: `docs/architecture/sqs-message-flow.md`, `docs/architecture/ai-provider-structure.md`
2.  **내용**:
    - **Diagram (Mermaid)**: 데이터 흐름, 시퀀스, ERD 등을 시각화.
    - **Design Decision**: 왜 이런 구조를 선택했는지에 대한 근거(ADR).
    - **Interface**: 주요 인터페이스 및 타입 정의.
    - **Usage**: 다른 모듈에서 이를 어떻게 사용하는지에 대한 가이드.
3.  **갱신**: 기존 코드가 변경되면 해당 아키텍처 문서도 반드시 최신화(Sync)한다.
4.  **참조**: `README.md`의 **"System Architecture"** 섹션에 링크한다.

---

## 3. General Rules

- **언어**: 한국어(Korean)를 기본으로 작성한다.
- **포맷**: Markdown 표준을 따르며, 가독성을 위해 적절한 헤더 및 코드 블록을 사용한다.
- **검증**: 문서에 포함된 코드 예제나 명령어는 실제로 동작하는지 검증 후 작성한다.

---

## 4. FE SDK Sync (프론트엔드 SDK 동기화)

**[Trigger]**
- `src/bootstrap/server.ts` 또는 `src/app/routes/` 내의 라우터가 추가/변경/삭제되었을 때.
- 로직 변경으로 인해 API의 **반환 타입(DTO)**, **요청 파라미터**, **에러 응답(Throw Error)**이 변경되었을 때.
- `src/shared/dtos/` 또는 `docs/schemas/` 내부의 데이터 스키마가 변경되었을 때.

**[Action: SDK 검증 및 동기화 절차]**
1.  **SDK 메서드 최신화**: 
    - `z_npm_sdk/src/endpoints/` 하위 파일들을 분석하여 변경된 API명세가 정확히 반영되었는지 확인하고, 누락되거나 변경된 파라미터/반환 타입을 SDK 코드에 동기화한다.
2.  **JSDoc 주석 의무화**: 
    - SDK의 모든 public 메서드는 한국어로 된 JSDoc을 포함해야 한다.
    - 특히 404 등 예측 가능한 에러 상황이나 빈 배열 반환 같은 **Edge Case(예외/특수 상황)** 응답 결과를 반드시 `@example` 및 텍스트로 명확히 기록한다.
3.  **SDK README 업데이트**: 
    - SDK 메서드 구조가 변경된 경우 `z_npm_sdk/README.md` 내의 API Reference(표, 상세 토글 등)를 최신화하여 사용자가 코드를 보지 않고도 정확히 활용할 수 있게 한다.
4.  **동기화 보고**: 
    - "API 변경 사항을 FE SDK 및 SDK README 문서에 동기화 완료했습니다"라고 보고한다.

**[Important Rule]**
- API 계약이나 DTO 구조를 변경해 놓고 FE SDK(`z_npm_sdk`)를 챙기지 않는 것은 **치명적인 Contract 위반**이다.
- 개발자가 별도로 "SDK도 수정해 줘"라고 요청하지 않아도, API 로직/타입을 수정했다면 AI Agent는 **숨쉬듯이 자연스럽게 `z_npm_sdk` 코드를 찾아가 최신 상태로 반영**해야 한다.
