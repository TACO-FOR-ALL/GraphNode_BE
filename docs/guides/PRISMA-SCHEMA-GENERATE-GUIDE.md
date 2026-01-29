# Prisma Schema와 Generate 개념 완벽 가이드

## 1. Prisma Schema란?

### 개념
**Prisma Schema**는 데이터베이스의 구조를 **선언적(Declarative)**으로 정의하는 설정 파일입니다. SQL DDL(CREATE TABLE 등)을 직접 작성하는 대신, Prisma의 DSL(Domain Specific Language)로 데이터 모델을 정의합니다.

### 파일 위치
```
프로젝트/
  └── prisma/
      └── schema.prisma  ← 이 파일!
```

### Schema 파일의 3가지 핵심 구성 요소

#### 1) Generator (생성기)
```prisma
generator client {
  provider = "prisma-client-js"
}
```
**의미**: "이 스키마로부터 JavaScript/TypeScript용 Prisma Client를 생성하라"

**역할**:
- `npx prisma generate` 명령 실행 시 어떤 클라이언트를 생성할지 결정
- 생성 위치: `node_modules/.prisma/client/`
- 생성물: TypeScript 타입 정의 + 런타임 코드

#### 2) Datasource (데이터 소스)
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```
**의미**: "MySQL 데이터베이스에 연결하며, 연결 문자열은 환경변수 DATABASE_URL에서 가져온다"

**지원 DB**:
- `mysql`, `postgresql`, `sqlite`, `sqlserver`, `mongodb`, `cockroachdb`

**환경변수 참조**:
- `env("DATABASE_URL")` → `.env` 파일의 `DATABASE_URL` 값 사용
- 예: `mysql://user:password@localhost:3306/mydb`

#### 3) Model (데이터 모델)
```prisma
model User {
  id             BigInt    @id @default(autoincrement())
  email          String?   @db.VarChar(191)
  displayName    String?   @map("display_name")
  createdAt      DateTime  @default(now())
  
  @@unique([provider, providerUserId])
  @@map("users")
}
```

**의미**: "User라는 TypeScript 타입과 users라는 DB 테이블을 정의한다"

**주요 속성**:
- `@id`: 기본 키
- `@default(autoincrement())`: 자동 증가
- `@map("display_name")`: TypeScript에서는 `displayName`, DB에서는 `display_name`
- `@@unique`: 복합 유니크 제약
- `@@map("users")`: 테이블명 매핑

---

## 2. `npx prisma generate`의 동작 원리

### 실행 흐름
```mermaid
graph LR
    A[schema.prisma 읽기] --> B[모델 파싱]
    B --> C[TypeScript 타입 생성]
    C --> D[런타임 코드 생성]
    D --> E[node_modules/.prisma/client/에 저장]
```

### 생성되는 파일들

#### 1) `index.d.ts` (타입 정의)
```typescript
// 자동 생성된 타입들
export type User = {
  id: bigint;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
}

export namespace Prisma {
  export type QueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
  }
  
  export type UserCreateInput = {
    email?: string | null;
    displayName?: string | null;
    // ...
  }
}

export class PrismaClient {
  user: {
    create(args: { data: Prisma.UserCreateInput }): Promise<User>;
    findMany(args?: { where?: Prisma.UserWhereInput }): Promise<User[]>;
    // ...
  }
}
```

#### 2) `index.js` (런타임 구현)
실제 SQL 쿼리를 생성하고 실행하는 코드가 들어있습니다.

### 생성 결과 예시
```bash
$ npx prisma generate

✔ Generated Prisma Client (5.10.0) to ./node_modules/@prisma/client in 234ms

You can now start using Prisma Client in your code:

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
```

---

## 3. Schema → TypeScript 코드 변환 예시

### Schema 정의
```prisma
model User {
  id          BigInt   @id @default(autoincrement())
  email       String?
  displayName String?  @map("display_name")
}
```

### 생성된 TypeScript 타입
```typescript
// 자동 생성됨!
export type User = {
  id: bigint;
  email: string | null;
  displayName: string | null;
}

// CRUD 메서드도 자동 생성
prisma.user.create({ data: { email: "test@example.com" } })
prisma.user.findMany({ where: { email: { contains: "@" } } })
prisma.user.update({ where: { id: 1n }, data: { displayName: "New Name" } })
prisma.user.delete({ where: { id: 1n } })
```

### 실제 사용 코드
```typescript
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ✅ 타입 안전: email은 string | null
const user = await prisma.user.create({
  data: {
    email: "test@example.com",
    displayName: "홍길동"
  }
});

// ✅ 타입 안전: Prisma.QueryEvent 타입 사용 가능
prisma.$on('query', (e: Prisma.QueryEvent) => {
  console.log('Query:', e.query);
  console.log('Duration:', e.duration + 'ms');
});
```

---

## 4. Schema 변경 시 워크플로우

### 시나리오: User 모델에 `age` 필드 추가

#### Step 1: Schema 수정
```prisma
model User {
  id          BigInt   @id @default(autoincrement())
  email       String?
  displayName String?  @map("display_name")
  age         Int?     // ← 추가!
}
```

#### Step 2: Prisma Client 재생성
```bash
npx prisma generate
```

#### Step 3: DB에 반영 (개발 환경)
```bash
npx prisma db push
```
→ 실제 MySQL 테이블에 `age` 컬럼 추가

#### Step 4: TypeScript 코드에서 사용
```typescript
// ✅ 이제 age 필드를 사용할 수 있음 (타입 체크 통과)
const user = await prisma.user.create({
  data: {
    email: "test@example.com",
    age: 25  // ← 타입 안전!
  }
});
```

---

## 5. Docker 환경에서의 중요성

### 왜 `COPY prisma ./prisma`가 먼저 필요한가?

```dockerfile
# ❌ 잘못된 순서
RUN npm ci
RUN npx prisma generate  # schema.prisma가 없어서 타입 생성 실패!
COPY . .

# ✅ 올바른 순서
RUN npm ci
COPY prisma ./prisma     # 먼저 스키마 복사
RUN npx prisma generate  # 이제 타입 생성 성공!
COPY . .
```

**이유**:
1. `npx prisma generate`는 `prisma/schema.prisma` 파일을 읽어야 함
2. 파일이 없으면 "schema not found" 경고 후 빈 클라이언트 생성
3. `Prisma.QueryEvent` 같은 타입이 생성되지 않음
4. TypeScript 빌드 시 타입 에러 발생

---

## 6. 핵심 요약

| 항목 | 설명 |
|------|------|
| **Prisma Schema** | 데이터베이스 구조를 선언적으로 정의하는 파일 (`prisma/schema.prisma`) |
| **npx prisma generate** | Schema를 읽어 TypeScript 타입 + 런타임 코드를 `node_modules/.prisma/client/`에 생성 |
| **생성물** | `PrismaClient` 클래스, 모델 타입, `Prisma.QueryEvent` 등의 네임스페이스 타입 |
| **Docker 주의사항** | `COPY prisma ./prisma`를 `RUN npx prisma generate` **이전**에 실행해야 함 |
| **변경 시 절차** | Schema 수정 → `npx prisma generate` → `npx prisma db push` (개발) / `npx prisma migrate dev` (프로덕션) |

---

## 7. 실전 팁

### 로컬 개발 시
```bash
# 1. Schema 수정
# 2. 타입 재생성
npx prisma generate

# 3. DB 동기화 (개발용, 빠름)
npx prisma db push

# 4. TypeScript 코드 작성 (자동완성 지원!)
```

### 프로덕션 배포 시
```bash
# 마이그레이션 파일 생성 (Git 커밋 대상)
npx prisma migrate dev --name add_age_field

# 프로덕션 DB에 적용
npx prisma migrate deploy
```

### Docker 빌드 시
```dockerfile
COPY prisma ./prisma        # ⭐ 필수!
RUN npx prisma generate     # 타입 생성
COPY . .                    # 소스 코드
RUN npm run build           # TypeScript 컴파일
```
