---
applyTo: '**'
---
- 목표
    - 모든 공개 API, 주요 내부 함수, 파일 헤더에 JSDoc을 작성하여 팀 간 이해를 보장한다.
- 필수 규칙
    - 파일 헤더
        - 모듈 책임, 외부 의존성, 공개 인터페이스, 로깅 컨텍스트 명시.
    - 함수/메서드
        - 설명, 파라미터/리턴 타입, 예외(표준 에러 코드), 사용 예시 포함. 항상.
    - 분기/특수 처리
        - 중단/타임아웃/재시도/백프레셔/스로틀 지점에 상세 주석.
    - 타입
        - 공개 타입/인터페이스에는 의미/제약 조건을 JSDoc으로 명시, 타입/인터페이스의 멤버가 있으면 모든 멤버에 대한 의미를 주석에 포함

즉, 모든 함수, 인자가 하나인 함수일지언정 모든 함수의 파라미터 리턴타입에 대한 상세한 설명과 해당 함수의 동작과 의미, 예외, 사용 예시,
모든 파일 스크립트가 맡는 책임에 대한 설명 주석,
인터페이스 및 타입의 의미와 제약조건 상시 포함,
분기나 특징점, 특수 처리 지점에도 의미를 알 수 있게 상세한 주석,
해당 코드를 읽기 위해 필요한 전제 지식이나 항목, 설계가 있다면 그에 대한 주석 등.
비개발자가 보아도 대략적 파악이 될 정도로 사소한 것도 아주 자세하게 JSDoc 주석 작성.

• 예시

```tsx
/**
 * 스트리밍 델타를 스로틀링하여 블록에 누적 반영한다.
 * @param blockId 대상 블록 식별자
 * @param apply 누적 적용자(이전 content → 새 content)
 * @param intervalMs 최소 업데이트 간격
 * @throws {StdError} INVALID_BLOCK_ID
 */
export function throttledBlockUpdate(blockId: string, apply: (prev: string) => string, intervalMs = 33) { /* … */ }
```

- 보완 사항
    - 문서화 파이프라인: typedoc → docs/api/* 산출, PR 시 링크 미리보기 생성.
    - CI 게이트: 공개 심볼 미주석 실패 시 build fail. 커버리지 메트릭 출력.
- 측정 가능한 승인 기준(AC)
    - [정적] 공개 export 심볼 JSDoc 커버리지 100%.
    - [CI] typedoc 빌드 경고 0건. broken link 0건.
    - [리뷰] 복잡 로직 파일당 최소 3곳의 인라인 주석 존재 확인.

---

## 적용 범위/커버리지(보강)

- 공개 API(export) 100% 필수, 내부 함수·헬퍼도 기본 JSDoc 작성(최소 설명+@internal).
- “파라미터/리턴/예외/사용 예시”는 모든 함수에 필수. 타입/인터페이스 멤버에도 각각 의미·제약을 서술.
- 동시성/취소/재시도/백프레셔/시간의존성(타이머) 여부는 항상 명시(@remarks).
- 로깅 컨텍스트와 상관관계 ID 사용 위치를 명시(@remarks, @see LogCentrally.instructions.md).

## 표준 태그 세트(권장)

- 함수: @description, @param, @returns, @throws, @example, @remarks, @see, @since, @deprecated(필요시)
- 타입/인터페이스: 각 멤버에 @description, 제약·단위·포맷, 기본값은 @defaultValue
- 클래스/메서드: 위와 동일 + 라이프사이클/스레드 세이프 여부 @remarks
- 가시성: @public / @internal(Reference 문서화 제외용)
- 에러 코드: @throws {AppError} CODE_NAME — ErrorCode.instructions.md의 코드와 1:1 매핑

## 작성 가이드(요지)

- 첫 문장은 “무엇을 하는가(한 줄 요약)”로 시작. 두 번째 문장에 입력/출력의 본질적 제약을 서술.
- 파라미터는 “의미, 단위, 포맷, 허용범위, 빈 값 처리”를 반드시 포함.
- 반환값은 “형태, 불변성/뮤터블, null/undefined 가능성”을 명시.
- 예외는 “AppError 코드, 재시도 가능 여부(retryable), 사용자가 취할 조치”를 포함.
- 비동기: “취소 신호(AbortSignal), 타임아웃, 재시도/백오프, 멱등성”을 명시.
- 로깅: “logger 컨텍스트, correlationId 전파”를 명시(민감정보 금지).

## 템플릿(복붙용)

```ts
/**
 * 대화 엔티티를 생성한다. 제목이 없으면 기본 템플릿을 적용한다.
 * @param dto 생성 요청 DTO. title은 1~200자, 없으면 "New Conversation"이 설정됨.
 * @param userId 요청자 사용자 ID(ULID/UUID). 빈 문자열 금지.
 * @returns 생성된 대화의 식별자와 타임스탬프. 불변 객체.
 * @throws {ValidationError} VALIDATION_FAILED 제목 길이 초과/형식 오류
 * @throws {ConflictError}   CONFLICT 동일 제목 충돌 정책 위반(정책 활성 시)
 * @throws {UpstreamError}   UPSTREAM_ERROR 저장소 쓰기 실패(DB 드라이버 에러 매핑)
 * @example
 * const out = await createConversation({ title: "Project A" }, "u_123");
 * console.log(out.id); // "c_901"
 * @remarks
 * - 로깅: logger.withContext('CreateConversationService'); correlationId 자동 바인딩
 * - 멱등성: 같은 페이로드라도 항상 신규 ID가 발급됨(정책상 비멱등)
 * - 트랜잭션: 메시지 초기화가 함께 수행될 수 있음(서비스 정책 참조)
 * @see ErrorCode.instructions.md
 */
export async function createConversation(dto: CreateConversationDto, userId: string): Promise<{ id: string; createdAt: string }> { /* ... */ }
```

```ts
/**
 * HTTP 요청 컨텍스트를 초기화하는 미들웨어.
 * - traceparent 헤더에서 trace-id를 추출하거나 신규 UUID를 생성하여 req.id에 주입한다.
 * @param req Express Request
 * @param res Express Response
 * @param next 다음 미들웨어
 * @example
 * app.use(requestContext);
 * @remarks
 * - 상관관계: req.id는 logger/pino-http에서 correlationId로 사용된다.
 * - 보안: 헤더 값 검증 실패 시 신규 UUID로 대체.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void { /* ... */ }
```

```ts
/**
 * 사용자 프로필 응답 모델.
 * @property id 내부 사용자 식별자(ULID/UUID). 불변.
 * @property email 이메일(선택). 마스킹되어 전송될 수 있음.
 * @property displayName 표시 이름(1~50자).
 * @property avatarUrl 아바타 이미지 절대 URL. 없는 경우 null.
 * @property createdAt RFC3339 UTC 생성 시각.
 */
export interface UserProfileDto {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}
```

```ts
/**
 * Problem Details(에러 응답) 확장 타입.
 * @property type 문제 유형 URI(사내 레지스트리).
 * @property title 짧은 제목.
 * @property status HTTP 상태코드.
 * @property detail 사용자 친화 설명.
 * @property instance 요청 경로.
 * @property correlationId 상관관계 ID(trace_id).
 * @property retryable 재시도 가능성(서버 판단).
 * @property errors 하위 문제 목록(필드 단위 상세).
 */
export type ProblemDetails = { /* ... */ };
```

## 에러/로깅/보안 주석 규칙(보강)

- @throws에는 “코드명(대문자 스네이크) + 의미 + 재시도 가능 여부”를 기술.
- 민감정보는 JSDoc 예시에도 포함 금지(키/토큰/비번).
- 로그 필드 예시에는 correlationId만 노출, payload는 마스킹된 샘플 사용.

## 자동화/검증(보강)

- typedoc을 사용해 참조 문서를 `/docs/reference/api`로 생성(명령: `npm run docs:typedoc` 권장).
- ESLint: `eslint-plugin-jsdoc` 활성화로 @param/@returns 불일치 차단.
- CI: 공개 export JSDoc 누락 시 실패(기존 커버리지 규칙과 병행).