# 프로젝트 구조(Backend)

현재 레포의 주요 디렉터리와 역할입니다. 새 파일을 추가할 때 동일한 컨벤션을 따르세요.

```
.
├─ src/
│  ├─ app/                # HTTP 레이어(Express): routes/controllers/middlewares/presenters
│  │  ├─ routes/          # 라우트 정의(예: health.ts)
│  │  ├─ controllers/     # 컨트롤러(입출력 바인딩)
│  │  ├─ middlewares/     # 요청 컨텍스트/에러 핸들러 등
│  │  └─ presenters/      # Problem Details 등 응답 변환기
│  ├─ core/               # 비즈니스(프레임워크 비의존)
│  │  ├─ domain/          # 엔티티/값 객체
│  │  ├─ ports/           # 서비스가 의존하는 추상 포트(리포 인터페이스)
│  │  └─ services/        # 유스케이스 구현
│  ├─ infra/              # 어댑터(외부 시스템)
│  │  ├─ db/              # DB 커넥션(MySQL/Mongo) 및 초기화
│  │  └─ repositories/    # ports 구현체
│  ├─ shared/             # 공통(DTO/에러/유틸 등)
│  ├─ bootstrap/          # 서버 기동/DI 바인딩
│  ├─ config/             # 환경 변수 스키마/로더
│  └─ index.ts            # 엔트리포인트(부트스트랩 호출)
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