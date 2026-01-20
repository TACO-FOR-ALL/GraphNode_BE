# Day 1 — 프로젝트 레포 및 기초 코드 생성

목표: TypeScript + Node.js(Express) 기반 뼈대를 만들고, 헬스체크 엔드포인트와 개발 편의 스크립트를 제공한다.

## 기술 스택/패키지
- 런타임/언어: Node.js + TypeScript
- 웹 프레임워크: Express
- 개발 도구: ESLint(v9 flat config), Prettier, tsx(개발 실행), tsc(빌드)
- 구조: MVC + Service/Ports(헥사고날), 폴더 레이아웃은 `/.github/instructions/MVS.instructions.md`를 따른다.

관련 파일
- 엔트리: [`src/index.ts`](src/index.ts) → 서버 부팅과 DB 초기화
- 서버 부트스트랩: [`src/bootstrap/server.ts`](src/bootstrap/server.ts) — [`bootstrap.server.createApp`](src/bootstrap/server.ts), [`bootstrap.server.startServer`](src/bootstrap/server.ts)
- 라우트: 헬스체크 [`src/app/routes/health.ts`](src/app/routes/health.ts)
- 환경변수 로딩/검증: [`src/config/env.ts`의 `config.env.loadEnv`](src/config/env.ts)
- 패키지 스크립트: [package.json](package.json)
- TS 설정: [tsconfig.json](tsconfig.json)
- 예시 환경파일: [.env.example](.env.example)

## 온보딩(로컬 실행)
1) 의존성 설치
   - `npm install`
2) 개발용 DB 컨테이너 기동(MySQL/Mongo)
   - `npm run db:up` (종료/정리는 `npm run db:down`, 로그는 `npm run db:logs`)
3) 환경변수 준비
   - `.env.example`를 `.env`로 복사하고 값 확인
4) 개발 서버 실행
   - `npm run dev` → http://localhost:3000
5) 빌드/배포 실행
   - `npm run build` → `npm start`

헬스체크
- GET `/-/healthz` 아님. 본 프로젝트는 `GET /healthz`(또는 `/v1/healthz`).
- 구현: [`app.routes.health`](src/app/routes/health.ts)

## 구현 메모
- 서버 구성: Helmet/CORS/JSON 파서 + 요청 컨텍스트/로깅 미들웨어 → 라우팅 → 404 → 중앙 에러 핸들러
- 에러/로깅/레이어 규칙은 Day 2 문서 참조