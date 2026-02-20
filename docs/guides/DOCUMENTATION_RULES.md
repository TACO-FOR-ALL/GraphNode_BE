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
