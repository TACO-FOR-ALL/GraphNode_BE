---
applyTo: '**'
---
- 목표
    - 모든 공개 API, 주요 내부 함수, 파일 헤더에 JSDoc을 작성하여 팀 간 이해를 보장한다.
- 필수 규칙
    - 파일 헤더
        - 모듈 책임, 외부 의존성, 공개 인터페이스, 로깅 컨텍스트 명시.
    - 함수/메서드
        - 설명, 파라미터/리턴 타입, 예외(표준 에러 코드), 사용 예시 포함.
    - 분기/특수 처리
        - 중단/타임아웃/재시도/백프레셔/스로틀 지점에 상세 주석.
    - 타입
        - 공개 타입/인터페이스에는 의미/제약 조건을 JSDoc으로 명시.

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