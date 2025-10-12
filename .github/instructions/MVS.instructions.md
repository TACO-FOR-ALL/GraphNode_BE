---
applyTo: '**'
---
## 목표

- **MVC의 책임을 명확히 분리**하여 유지보수성과 테스트 용이성을 확보한다.
- **Controller는 입·출력(HTTP) 전담**, **Service는 비즈니스 규칙 전담**, **Repository는 영속성 전담** 원칙을 지킨다. (서비스 레이어는 앱의 경계에서 유스케이스를 캡슐화·조정한다.) [martinfowler.com](https://martinfowler.com/eaaCatalog/serviceLayer.html?utm_source=chatgpt.com)
- 프레임워크 의존(Express 등)은 **컨트롤러/미들웨어**에 가두고, **도메인/서비스는 프레임워크 비의존**을 지향한다(클린/헥사고날 아키텍처의 핵심). [blog.cleancoder.com+1](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html?utm_source=chatgpt.com)

## 폴더 구조(표준)

```
src/
  app/
    routes/                 # 라우터(라우팅 정의만)
    controllers/            # HTTP 레이어(Express 객체 사용 가능)
    middlewares/
    validators/             # DTO/유효성(class-validator 등)
    presenters/             # 응답 매핑/문제상세(RFC7807) 포맷터
  core/                     # 프레임워크 비의존 영역
    services/               # 유스케이스/비즈니스 규칙
    domain/                 # 엔티티/도메인 로직(리치 모델 지향)
    ports/                  # 서비스가 의존하는 추상 포트(Repository 인터페이스)
  infra/                    # 외부 어댑터
    repositories/           # DB 구현체(ORM/쿼리), ports의 실제 구현
    http/                   # 외부 API 클라이언트
    db/                     # 커넥션/스키마
  shared/
    dtos/                   # 요청/응답 DTO
    mappers/                # DTO<->도메인 변환
    errors/
    utils/
  config/                   # 환경설정(12-Factor)
  bootstrap/                # 앱 시작/DI 바인딩

```

> 핵심: app(인터페이스) → core(비즈니스) → infra(구현) 의 단방향 의존. 컨트롤러가 레포지토리를 직접 호출하면 규칙 위반.
> 

## 계층 규칙(Import 경계)

- Controller → **Service**만 직접 의존(Repository 직접 import 금지).
- Service → **ports(Repository 인터페이스)** 에만 의존(**infra.repositories** 구현체 직접 import 금지). 헥사고날/포트-어댑터 원칙. [alistair.cockburn.us](https://alistair.cockburn.us/hexagonal-architecture?utm_source=chatgpt.com)
- Repository → **DB/외부시스템**에만 의존(Express 등 웹 프레임워크 의존 금지).
- Service/Domain 레벨에서 **Express 타입**(Request/Response) 사용 금지. (프레임워크 독립성) [blog.cleancoder.com](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html?utm_source=chatgpt.com)

## 컨트롤러 작성 원칙

- 역할: **HTTP 요청 파싱 → DTO 검증 → Service 호출 → 응답 변환/상태코드 설정**.
- 금지: 데이터 접근/트랜잭션/도메인 규칙/외부 API 호출(=모두 Service로).
- “얇은 컨트롤러, 두터운 유스케이스(서비스)”를 유지하라(Anemic Domain으로 빠지지 않도록 서비스·도메인에 행위를 둔다). [martinfowler.com+1](https://martinfowler.com/bliki/AnemicDomainModel.html?utm_source=chatgpt.com)

## 서비스 작성 원칙

- 역할: **유스케이스 조정·검증·도메인 행위 호출·트랜잭션 경계**. (Fowler Service Layer) [martinfowler.com](https://martinfowler.com/eaaCatalog/serviceLayer.html?utm_source=chatgpt.com)
- Repository는 **포트 인터페이스**로 주입(의존성 주입/IoC). InversifyJS 또는 tsyringe 등 DI 컨테이너 권장. [inversify.github.io+1](https://inversify.github.io/?utm_source=chatgpt.com)
- 도메인 엔티티에 **의미 있는 행위**를 배치하여 **Anemic Domain**을 피한다(유효성, 정책, 계산 등). [martinfowler.com](https://martinfowler.com/bliki/AnemicDomainModel.html?utm_source=chatgpt.com)

## 리포지토리 작성 원칙

- 역할: **영속성 캡슐화**(ORM/쿼리, 캐시, 외부 API).
- 서비스에서 정의한 **포트 인터페이스**를 구현하고, 서비스에는 구현체가 아닌 **인터페이스**를 주입한다(헥사고날의 어댑터). [alistair.cockburn.us](https://alistair.cockburn.us/hexagonal-architecture?utm_source=chatgpt.com)

## DTO·검증·매퍼

- **입력 DTO + validator**(예: class-validator)로 컨트롤러에서 **초기 유효성**.
- 서비스 경계에서는 **도메인 모델/값 객체**를 사용하고, 입·출력 변환은 **mappers/presenters**로 분리(계층 간 모델 누수 방지). (계층화·클린아키텍처 권고) [blog.cleancoder.com](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html?utm_source=chatgpt.com)

## 의존성 주입(DI)

- DI 컨테이너 바인딩: `ports.UserRepository -> infra.repositories.UserRepositoryMongo` 식으로 **bootstrap**에서 1회 구성. (Inversify/tsyringe) [inversify.github.io+1](https://inversify.github.io/?utm_source=chatgpt.com)
- 서비스/컨트롤러는 **생성자 주입**만 사용(전역 싱글톤/정적 접근 금지).

## 예시(요약)

```tsx
// core/ports/UserRepository.ts
export interface UserRepository { findById(id: string): Promise<User>; }

// infra/repositories/UserRepositoryMongo.ts
export class UserRepositoryMongo implements UserRepository { /* DB 호출만 */ }

// core/services/GetUserProfile.ts
export class GetUserProfile {
  constructor(private repo: UserRepository) {}
  async exec(id: string) {
    const user = await this.repo.findById(id);
    return user.profile(); // 도메인 행위 호출(애니믹 방지)
  }
}

// app/controllers/user.controller.ts
export const getUser = (svc: GetUserProfile) => async (req, res) => {
  const out = await svc.exec(req.params.id);   // 서비스만 호출
  res.status(200).json(out);
};

```

## 금지 목록(샘플)

- 컨트롤러가 `infra/repositories/**` 를 **import** 하는 행위.
- 서비스가 `express` 또는 `app/controllers/**` 를 **import** 하는 행위.
- 리포지토리가 `app/**` 또는 `core/services/**` 를 **import** 하는 행위.

## 자동 강제(정책 → 도구)

- **dependency-cruiser**로 **레이어 간 import 금지** 규칙을 CI에서 검사:
    - controllers → repositories **금지**, services → controllers **금지**, services → infra **금지** 등. [GitHub+2Atomic Spin+2](https://github.com/sverweij/dependency-cruiser?utm_source=chatgpt.com)
- **ESLint 플러그인**으로 경계 규칙 보완:
    - `eslint-plugin-boundaries` 또는 `@nx/enforce-module-boundaries` 로 폴더/태그 기반 제약. [GitHub+1](https://github.com/javierbrea/eslint-plugin-boundaries?utm_source=chatgpt.com)

**예시: dependency-cruiser 규칙(발췌)**

```jsx
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    { name: 'no-ctrl-to-repo',
      from: { path: '^src/app/controllers' },
      to:   { path: '^src/infra/repositories' }, severity: 'error' },
    { name: 'no-svc-to-express',
      from: { path: '^src/core/services' },
      to:   { path: 'express|^src/app/' }, severity: 'error' },
    { name: 'services-depend-on-ports-only',
      from: { path: '^src/core/services' },
      to:   { pathNot: '^src/core/ports' }, severity: 'warn' }
  ]
};

```

> 대규모 리포에서는 Nx의 Enforce Module Boundaries로 태그/경로 제약을 병행할 수 있다. nx.dev
> 

## 측정 가능한 승인 기준(AC)

- **[정적]** dependency-cruiser, ESLint 경계 룰 **CI 통과율 100%**(금지 import 0건). [GitHub](https://github.com/sverweij/dependency-cruiser?utm_source=chatgpt.com)
- **[정적]** `app/controllers/**` 내에서 `infra/repositories/**` 직접 import 0건(규칙 스캔).
- **[정적]** 서비스/도메인 레벨에서 `express` 타입/모듈 import 0건.
- **[테스트]** 컨트롤러 단위테스트는 **서비스 목**으로 실행되고 DB를 직접 접근하지 않는다(테스트가 DB 없이 통과).
- **[리뷰]** 신규 기능 PR은 “컨트롤러 ≤ 150LOC, 서비스 ≤ 300LOC, 파일 책임 1개 원칙” 체크 통과.
- **[문서]** `/docs/architecture.md`에 최신 **의존성 그래프**(dep-cruiser HTML)와 **폴더 표준**이 포함된다. [passionsplay.com](https://passionsplay.com/blog/visualize-a-typescript-codebase-with-dependency-cruiser/?utm_source=chatgpt.com)

## 참고 근거

- **Service Layer**: 경계/유스케이스 캡슐화(마틴 파울러). [martinfowler.com](https://martinfowler.com/eaaCatalog/serviceLayer.html?utm_source=chatgpt.com)
- **Clean Architecture**: 비즈니스 규칙과 인터페이스의 분리(언클 밥). [blog.cleancoder.com](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html?utm_source=chatgpt.com)
- **Hexagonal/Ports & Adapters**: 포트(인터페이스)와 어댑터(구현)로 외부 의존 분리(앨리스터 코번). [alistair.cockburn.us+1](https://alistair.cockburn.us/hexagonal-architecture?utm_source=chatgpt.com)
- **DI 컨테이너**(Inversify/tsyringe)로 결합도 축소·테스트성 향상. [inversify.github.io+1](https://inversify.github.io/?utm_source=chatgpt.com)
- **아키텍처 경계 강제 도구**: dependency-cruiser, ESLint boundaries/Nx 규칙