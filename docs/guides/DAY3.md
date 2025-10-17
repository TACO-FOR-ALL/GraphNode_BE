# Day 3 — DB(MySQL, MongoDB) 기초 연결 구축

목표: 로컬 개발용 Docker 컨테이너(MySQL 8, MongoDB 7)와 애플리케이션 연결. 초기 스키마/인덱스 보장. 클라우드 마이그레이션은 ENV만 교체로 가능하도록 설계.

## 로컬 개발 환경(Docker)
- 컴포즈 파일: [docker-compose.yml](docker-compose.yml)
  - MySQL: `3307:3306`(포트 충돌 회피), 초기 스키마: [db/mysql/init/001_init.sql](db/mysql/init/001_init.sql)
  - MongoDB: `27018:27017`, 헬스체크 포함
- 사용법
  - 기동: `npm run db:up` / 종료+정리: `npm run db:down` / 로그: `npm run db:logs`

## 애플리케이션 연결 흐름
- 부팅 시퀀스: [`src/index.ts`](src/index.ts) → [`infra.db.initDatabases`](src/infra/db/index.ts) → MySQL/Mongo 연결 후 [`bootstrap.server.startServer`](src/bootstrap/server.ts)
- ENV 검증/주입: [`config.env.loadEnv`](src/config/env.ts)
  - 필수: `MYSQL_URL`, `MONGODB_URL`(미설정 시 프로세스 종료)
- MySQL 연결: [`infra.db.mysql.initMySql`](src/infra/db/mysql.ts)
  - `mysql2/promise` 풀 생성 → `SELECT 1` 헬스체크 → `db.connected(mysql)` 로그
  - 공개 getter: `getMySql()`(초기화 전 접근 방지)
- MongoDB 연결: [`infra.db.mongodb.initMongo`](src/infra/db/mongodb.ts)
  - `MongoClient.connect()` → `db.connected(mongodb)` 로그 → `ensureIndexes()` 자리 마련
- 초기 스키마
  - Users/세션 매핑 테이블은 SQL 스크립트로 자동 생성: [db/mysql/init/001_init.sql](db/mysql/init/001_init.sql)
  - Mongo 인덱스는 `ensureIndexes()`에 후속 반영 예정(Conversations/Messages)

## 클라우드 마이그레이션 대비
- 12-Factor Config: 연결 정보는 전부 ENV로 주입
  - `.env` 개발용, 운영은 시크릿 매니저/환경 변수로 교체(키 하드코딩 금지)
- 코드 경계: DB 어댑터는 `infra/db/**`에 한정(Express 비의존)
  - 앱 부트스트랩이 [`infra.db.initDatabases`](src/infra/db/index.ts)만 호출 → RDS/Atlas 전환 시 코드 변경 없이 ENV 교체
- 상태 로깅: 연결/마이그레이션 확인 로그는 중앙 로거로 일관 출력

## 트러블슈팅
- 포트 충돌: `docker-compose.yml`의 호스트 포트 수정(예: MySQL `3308:3306`, Mongo `27019:27017`)
- 초기화 레이스: 컨테이너 헬스체크 통과 후 앱 실행 권장. 실패 시 재시도 또는 backoff 추가
- 인증 실패: `.env`의 URL과 Compose 환경이 일치하는지 확인

## 확인 방법
1) `npm run db:up`으로 컨테이너 기동
2) `npm run dev`로 서버 실행
3) 로그에서 다음 순서를 확인
   - `db.connected (mysql)` → `db.migrations_checked` → `db.connected (mongodb)` → `server.start`
4) `GET /healthz` 200 응답