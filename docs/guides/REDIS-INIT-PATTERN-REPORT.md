# Redis 초기화 패턴 개선 보고서

질문하신 내용에 대해 인프라 아키텍처 관점에서 조사한 결과와 수정 사항을 보고합니다.

---

## 1. 질문에 대한 답변: 어떤 패턴이 올바른가?

**결론: DB 관련 초기화 때에 공통 인스턴스를 미리 만들어두는 패턴이 가장 적절합니다.**

### 현재 패턴의 문제점 (기존 코드)
- `RedisEventBusAdapter`가 생성될 때마다 새로운 Redis 연결을 2개씩(Pub/Sub) 생성합니다.
- 만약 다른 서비스에서 Redis 캐시가 필요해지면 또 새로운 연결을 만들게 되어, 서버 자원(Socket) 낭비와 Redis 서버의 Max Connection 초과 위험이 있습니다.
- Redis 서버가 다운되어 있어도 앱이 실행될 때는 알 수 없고, 실제 기능을 사용할 때서야 에러가 발생합니다 (Fail-late).

### 추천 패턴 (개선된 코드)
- **중앙 집중식 초기화 (Eager Initialization)**: 앱 시작 시 Prisma, MongoDB와 함께 Redis 연결을 완료합니다. 인프라가 하나라도 문제가 있으면 앱이 즉시 종료되어 문제를 빨리 파악할 수 있습니다 (Fail-early).
- **싱글톤 클라이언트 관리**: 전역적으로 공통된 Redis 인스턴스를 공유하여 자원 효율성을 극대화합니다.
- **역할 분리**: `RedisEventBusAdapter`는 "어떻게 연결하는가"를 고민하지 않고, 이미 연결된 클라이언트를 "어떻게 사용하는가"에만 집중합니다.

---

## 2. 주요 수정 사항

### ✅ `src/infra/redis/client.ts` 신규 생성
- Redis Publisher와 Subscriber 클라이언트를 관리하는 전역 모듈입니다.
- 연결 상태 관리 및 공통 에러 핸들링을 담당합니다.

### ✅ `src/infra/db/index.ts` 수정
- `initDatabases` 함수 내에 `initRedis` 호출을 추가했습니다.
- 이제 앱이 뜰 때 MySQL(Prisma), MongoDB, Redis가 모두 준비된 상태임을 보장합니다.

### ✅ `src/infra/redis/RedisEventBusAdapter.ts` 리팩토링
- 클래스 내부에서 `new Redis()`를 호출하던 로직을 제거했습니다.
- 중앙에서 관리되는 `redis`, `redisSubscriber` 인스턴스를 사용하여 성능과 안정성을 높였습니다.

---

## 3. 향후 이점
- **상태 확인(Health Check)**: `/healthz` 같은 엔드포인트에서 모든 DB(Prisma, Mongo, Redis)의 연결 상태를 한곳에서 쉽게 관리할 수 있습니다.
- **확장성**: 추후 Redis를 단순 캐시 용도로 사용하게 되더라도, 이미 만들어진 `redis` 인스턴스를 그대로 가져다 쓰면 됩니다.

이제 모든 인프라가 정석적인 패턴으로 관리되도록 구성되었습니다.
 추가적인 수정이나 궁금한 점이 있으시면 말씀해 주세요!
