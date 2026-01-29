# 프로젝트 구조(Backend)

현재 레포의 주요 디렉터리와 역할입니다. 새 파일을 추가할 때 동일한 컨벤션을 따르세요.

```
.
├─ src/
│  ├─ app/                # HTTP 레이어(Express): routes/controllers/middlewares/presenters
│  │  ├─ routes/          # 라우트 정의(예: health.ts)
│  │  ├─ controllers/     # 컨트롤러(입출력 바인딩, 요청 유효성 검사)
│  │  ├─ middlewares/     # 요청 컨텍스트, 인증(JWT), 에러 핸들러 등
│  │  └─ presenters/      # Problem Details 등 응답 변환기
│  ├─ core/               # 비즈니스 로직(Pure Logic, 프레임워크 비의존)
│  │  ├─ domain/          # 엔티티, 값 객체, 도메인 이벤트
│  │  ├─ ports/           # 서비스가 의존하는 추상 인터페이스(Repository Ports)
│  │  └─ services/        # 유스케이스 구현(Business Logic)
│  ├─ infra/              # 인프라스트럭처/어댑터(외부 시스템 연동)
│  │  ├─ db/              # DB 커넥션(MySQL/Mongo) 초기화 및 싱글톤 관리
│  │  └─ repositories/    # core/ports 인터페이스의 실제 DB 구현체
│  ├─ shared/             # 공용 모듈(DTO, 에러 정의, 유틸리티, 로거)
│  ├─ workers/            # 백그라운드 워커(SQS Consumer)
│  │  ├─ handlers/        # SQS 메시지 유형별 처리 로직
│  │  └─ index.ts         # 워커 엔트리포인트 (SQS Polling 기동)
│  ├─ bootstrap/          # 애플리케이션 초기 설정 및 DI(Dependency Injection) 바인딩
│  ├─ config/             # 환경 변수 스키마 검증 및 로더 (Zod 사용)
│  └─ index.ts            # 메인 API 서버 엔트리포인트
│
├─ docs/
│  ├─ api/                # OpenAPI 3.1 계약 및 예제
│  │  ├─ openapi.yaml     # 단일 소스(OpenAPI)
│  │  └─ examples/        # 요청/응답 예제(JSON)
│  ├─ schemas/            # JSON Schema 2020-12(공유 모델)
│  ├─ guides/             # Day별 개발 문서/가이드
│  ├─ BRANCHING.md        # 브랜치 전략(GitHub Flow)
│  └─ reference/api/      # TypeDoc 산출물(코드 레퍼런스)
│
├─ db/                    # 로컬 개발용 DB 초기화 스크립트
├─ docker-compose.yml     # 로컬 MySQL/Mongo 실행
├─ eslint.config.js       # ESLint(Flat Config)
├─ package.json           # 스크립트/의존성
├─ tsconfig.json          # TypeScript 설정
└─ typedoc.json           # TypeDoc 설정
```

## 네이밍 규칙

- 파일/폴더: 케밥 케이스(kebab-case) 권장. 클래스/컴포넌트는 PascalCase.
- 타입/인터페이스: PascalCase. 공용 타입은 `src/shared/dtos`.
- 환경변수/상수: UPPER_SNAKE_CASE.

## 빠른 참조

- 서버 부트스트랩: `src/bootstrap/server.ts`
- 헬스 체크 라우트: `src/app/routes/health.ts` (→ `/healthz`, `/v1/healthz`)
- 에러 규격 변환: `src/app/presenters/problem.ts`
- 중앙 에러 핸들러: `src/app/middlewares/error.ts`
- 로거: `src/shared/utils/logger.ts`

레퍼런스: `docs/api/openapi.yaml`, `docs/schemas/*`, `docs/reference/api/index.html`
