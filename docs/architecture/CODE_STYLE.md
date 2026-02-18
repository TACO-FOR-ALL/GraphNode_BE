# 📘 GraphNode Code Style & Contribution Guide

이 문서는 GraphNode Backend 프로젝트의 코드 스타일, 아키텍처 패턴, 그리고 기여 가이드를 정의합니다.
새로운 기능을 개발하거나 리팩토링할 때 이 가이드를 준수하여 일관성 있는 코드베이스를 유지해야 합니다.

---

## 1. 🏗️ Architectural Patterns

GraphNode는 **Layered Architecture**와 **Port & Adapter (Hexagonal) Architecture**의 원칙을 따릅니다.

### 1.1 계층 구조 (Layers)

데이터의 흐름은 `Presentation -> Core (Business Logic) -> Infrastructure` 단방향으로 흐릅니다.

1.  **Presentation Layer (`src/app/controllers`, `src/app/routes`)**
    *   **책임**: HTTP 요청 파싱, 입력 검증(Zod), 응답 포맷팅.
    *   **규칙**: 비즈니스 로직을 포함하지 않습니다. `Service`를 호출하여 작업을 위임합니다.
    *   **입력 검증**: `zod` 라이브러리를 사용하여 엄격하게 검증합니다.

2.  **Core Layer (`src/core`)**
    *   **Services (`src/core/services`)**: 비즈니스 로직을 구현합니다. 순수 Typescript 클래스로 작성됩니다.
    *   **Ports (`src/core/ports`)**: 외부 의존성(Repository, External API)에 대한 **Interface**를 정의합니다. (의존성 역전 원칙)
    *   **Types/DTOs (`src/shared/dtos`, `src/core/types`)**: 데이터 교환을 위한 객체 정의.

3.  **Infrastructure Layer (`src/infra`)**
    *   **Repositories (`src/infra/repositories`)**: DB 접근 구현체 (Port의 구현체). `Prisma`, `Mongoose` 등을 직접 사용합니다.
    *   **Adapters (`src/infra/aws`, `src/infra/redis`)**: 외부 서비스(AWS SQS, S3, Redis)와의 통신을 담당합니다.

### 1.2 Dependency Injection (DI)

*   우리는 **Manual Dependency Injection** 패턴을 사용합니다.
*   **Container (`src/bootstrap/container.ts`)**: 애플리케이션의 모든 싱글톤 인스턴스를 생성하고 의존성을 주입(Wiring)하는 유일한 장소입니다.
*   **규칙**: 클래스 내부에서 `new Service()`를 직접 호출하지 마세요. 생성자 주입(Constructor Injection)을 사용하세요.

---

## 2. 📝 Naming Conventions

### 2.1 Files & Directories

*   **Class Files**: `PascalCase.ts` (e.g., `UserService.ts`, `GraphController.ts`)
    *   *Note*: 기존 일부 파일(`me.ts` 등)이 `camelCase`인 경우가 있으나, 신규 파일은 `PascalCase`를 원칙으로 합니다.
*   **Utility/Function Files**: `camelCase.ts` (e.g., `logger.ts`, `validationUtils.ts`)
*   **Directories**: `camelCase` (e.g., `src/core/services`, `src/shared/utils`)

### 2.2 Code Elements

*   **Classes**: `PascalCase` (e.g., `AuthService`)
*   **Interfaces**: `PascalCase` (e.g., `UserRepository`). `I` 접두사를 붙이지 **않습니다**.
*   **Methods/Functions**: `camelCase` (e.g., `getUserProfile`)
*   **Variables**: `camelCase` (e.g., `isValid`, `userData`)
*   **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`)
*   **Enums**: `PascalCase` (e.g., `UserRole`)

### 2.3 Semantic Naming

*   **Boolean Variables**: `is`, `has`, `can`, `should` 접두사를 사용합니다. (e.g., `isAvailable`, `hasPermissions`)
*   **Async Functions**: `Promise`를 반환함을 명시적으로 알 수 있는 이름이 좋지만, 필수는 아닙니다.

---

## 3. 🛡️ Error Handling

모든 에러는 예측 가능해야 하며, 클라이언트에게 명확한 이유를 전달해야 합니다. (`src/shared/errors/domain.ts` 참조)

### 3.1 Standard Error Classes

비즈니스 로직에서는 반드시 아래 표준 에러 클래스를 `throw` 해야 합니다.

*   `ValidationError` (400): 잘못된 입력값.
*   `NotFoundError` (404): 리소스를 찾을 수 없음.
*   `ForbiddenError` (403): 권한 부족.
*   `ConflictError` (409): 중복 데이터 등 충돌.
*   `UpstreamError` (502): 외부 서비스(DB, AI API) 오류.

### 3.2 Controller에서 에러 처리

컨트롤러는 `try-catch` 블록으로 로직을 감싸고, `next(e)`를 호출하여 Global Error Handler로 에러를 전파해야 합니다.

```typescript
// ✅ Good Pattern
try {
  const result = await this.service.doAction(req.body);
  res.status(200).json(result);
} catch (e) {
  next(e); // Global Error Handler가 처리
}
```

---

## 4. ⚡ Asynchronous Programming

*   **Async/Await**: `Promise.then()` 대신 `async/await` 구문을 기본으로 사용합니다.
*   **Promise.all**: 병렬 처리가 가능한 작업은 반드시 `Promise.all`로 묶어서 성능을 최적화하세요.

### 4.1 Workers (`src/workers`)

*   무거운 작업(AI 생성, 외부 API 호출 등)은 Main API 스레드에서 처리하지 않고 SQS를 통해 Worker로 이임합니다.
*   Worker는 `sqs-consumer` 라이브러리를 사용하며, 각 Task Type 별 Handler(`src/workers/handlers`)를 가집니다.

---

## 5. 📚 Documentation (JSDoc)

모든 Public Class, Method, Interface는 **JSDoc**을 작성해야 합니다.
이는 동료 개발자와 AI Agent가 코드를 이해하는 데 핵심적인 역할을 합니다.

```typescript
/**
 * 사용자의 프로필 이미지를 업데이트합니다.
 * @param userId 사용자 ID (UUID)
 * @param imageUrl 업로드된 이미지 URL
 * @returns 업데이트된 사용자 프로필 DTO
 * @throws {NotFoundError} 사용자가 존재하지 않을 경우
 */
async updateAvatar(userId: string, imageUrl: string): Promise<UserProfileDto> {
    // ...
}
```

---

## 6. 📦 SDK Development (`z_npm_sdk`)

SDK는 외부(Frontend)에서 우리 API를 쉽게 사용할 수 있도록 돕는 라이브러리입니다.

*   **Builder Pattern**: `RequestBuilder`를 사용하여 HTTP 요청을 구성합니다.
*   **Methods**: 각 API 엔드포인트는 SDK 클래스의 메서드와 1:1로 매핑되어야 합니다.
*   **Types**: 백엔드의 DTO와 SDK의 타입 정의가 일치하도록 유지해야 합니다. (`src/shared/dtos`를 참조하여 수동 동기화 또는 공유)

---

## 7. ✅ Testing Strategy

*   **Unit Tests**: 비즈니스 로직(`src/core/services`) 검증. `jest`를 사용하며, Repository는 Mocking합니다.
*   **Integration Tests**: 실제 DB/서비스와의 연동 검증.

---

## 8. 🔍 Code Review Checklist

PR을 제출하기 전 다음 항목을 확인하세요.

- [ ] `npm run lint`: Lint 에러가 없는가?
- [ ] `npm run format`: Prettier 포맷팅을 수행했는가?
- [ ] 새로운 기능에 대한 JSDoc이 작성되었는가?
- [ ] Architecture Layer 규칙(Core -> Infra 의존 금지)을 준수했는가?
- [ ] 적절한 Error Class를 사용했는가?
