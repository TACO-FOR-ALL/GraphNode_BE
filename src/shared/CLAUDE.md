# src/shared — 전 계층 공유 유틸리티

모든 레이어(app/core/infra)에서 import 가능한 공통 모듈. **도메인 비즈니스 로직 포함 금지**.

## 서브디렉토리 역할

```
ai-providers/   멀티 LLM 추상화. IAiProvider 인터페이스 + claude/gemini/openai 구현체.
errors/         표준 에러 클래스 (domain.ts). 전 계층에서 이것만 사용.
dtos/           HTTP 요청·응답 DTO 스키마 (Zod). SDK 타입과 동기화 대상.
mappers/        도메인 객체 ↔ DTO 변환 순수 함수.
context/        AsyncLocalStorage 기반 요청 컨텍스트 (correlationId 등).
audit/          감사 로그 기록 유틸.
utils/          logger, sentry, posthog, retry, documentProcessor 등.
```

## AI Provider 사용 패턴

```ts
// 구현체를 직접 import 하지 말 것 — 인터페이스로 주입받아 사용
import type { IAiProvider } from '@shared/ai-providers/IAiProvider';

class MyService {
  constructor(private readonly ai: IAiProvider) {}
}
// DI: container.ts 에서 new ClaudeProvider() 또는 new GeminiProvider() 주입
```

## Logger 사용 패턴

```ts
import { logger } from '@shared/utils/logger';

// 항상 correlationId 포함
logger.withContext({ correlationId, userId }).info('message');

// console.* 절대 사용 금지
```

## 신규 DTO 추가 시

`src/shared/dtos/` 에 추가한 후 → `z_npm_sdk/src/types/` 동기화 여부 확인 (post-edit 훅이 알림).

## 금지사항

- shared 내부에서 `src/core/services/**` 또는 `src/infra/**` import 금지
- 비즈니스 로직(if/else 분기, 상태 변경) 포함 금지
