# Prisma 쓰기 권한과 OpenSSL 완전 이해 가이드

## 1. Prisma가 디렉토리 쓰기 권한이 필요한 이유

### Prisma 동작 원리

#### Prisma는 2단계로 작동합니다

**1단계: Prisma Client 생성 (`npx prisma generate`)**
```
prisma/schema.prisma (스키마 정의)
         ↓
npx prisma generate 실행
         ↓
TypeScript 타입 + Prisma Engine 바이너리 다운로드
         ↓
저장 위치: node_modules/@prisma/client
         node_modules/@prisma/engines
```

**2단계: 런타임 실행**
```
애플리케이션 시작
         ↓
Prisma Client 로드
         ↓
Prisma Engine 바이너리 실행 (네이티브 코드)
         ↓
데이터베이스 연결 및 쿼리
```

---

### 왜 쓰기 권한이 필요한가?

#### Prisma Engine은 네이티브 바이너리 파일입니다

**Prisma Engine 구성**:
```
node_modules/@prisma/engines/
├── query-engine-debian-openssl-3.0.x  (Linux용 실행 파일)
├── schema-engine-debian-openssl-3.0.x
├── introspection-engine-debian-openssl-3.0.x
└── migration-engine-debian-openssl-3.0.x
```

**이 파일들은**:
- JavaScript가 아닌 **Rust로 작성된 네이티브 바이너리**
- 운영체제별로 다름 (Windows, Linux, macOS)
- OpenSSL 버전별로 다름 (`openssl-1.1.x`, `openssl-3.0.x`)

---

### 쓰기 권한이 필요한 시점

#### 시나리오 1: 처음 설치 시
```bash
npm install @prisma/client
npx prisma generate
```
→ `node_modules/@prisma/engines`에 바이너리 다운로드 (쓰기 필요!)

#### 시나리오 2: 런타임에 Engine이 없을 때
```bash
# Docker 이미지에서 prisma generate를 안 했다면
node dist/index.js
```
→ Prisma Client가 자동으로 Engine 다운로드 시도 (쓰기 필요!)

#### 시나리오 3: `prisma db push` 실행 시
```bash
npx prisma db push
```
→ Migration Engine 사용 → Engine이 없으면 다운로드 (쓰기 필요!)

---

### 우리 프로젝트의 문제

**Dockerfile 실행 순서** (수정 전):
```dockerfile
# 1. npm ci (root 권한)
RUN npm ci
# → node_modules 생성 (소유자: root)

# 2. 사용자 전환
USER node
# → 이제 root 소유 파일에 쓰기 불가!

# 3. entrypoint.sh 실행
ENTRYPOINT ["./entrypoint.sh"]
```

**entrypoint.sh**:
```sh
npx prisma db push
# → Migration Engine 필요
# → node_modules/@prisma/engines에 다운로드 시도
# → ❌ 권한 없음! (node 사용자는 root 소유 디렉토리에 쓰기 불가)
```

---

### 해결 방법

#### 방법 1: Prisma를 미리 생성 (우리가 선택한 방법)
```dockerfile
# root 권한으로 Prisma 생성
RUN npx prisma generate

# 소유권 변경
RUN chown -R node:node /app

# 사용자 전환
USER node
```
→ Engine이 이미 있으므로 런타임에 다운로드 불필요!

#### 방법 2: root 사용자로 실행 (비권장, 보안 위험)
```dockerfile
# USER node 제거
# → root로 계속 실행
```

#### 방법 3: 볼륨 마운트 (로컬 개발용)
```bash
docker run -v $(pwd)/node_modules:/app/node_modules
```

---

## 2. OpenSSL이란?

### OpenSSL 개념

**OpenSSL (Open Secure Sockets Layer)**:
- **암호화 라이브러리**
- 네트워크 통신을 **안전하게** 만드는 도구
- **HTTPS, SSL/TLS** 프로토콜 구현

### 쉬운 비유

**OpenSSL = 편지 봉투 + 자물쇠**

```
일반 HTTP (암호화 없음):
"안녕하세요" → 인터넷 → "안녕하세요"
누구나 중간에 볼 수 있음! ❌

HTTPS (OpenSSL 사용):
"안녕하세요" → [암호화] → "xJ9k2@#..." → 인터넷 → [복호화] → "안녕하세요"
중간에 봐도 알 수 없음! ✅
```

---

### OpenSSL이 하는 일

#### 1. 데이터 암호화
```
평문: "비밀번호: 1234"
         ↓ OpenSSL 암호화
암호문: "aGk3j2K9..."
```

#### 2. 인증서 검증
```
브라우저: "이 웹사이트가 진짜 Google인가?"
         ↓ OpenSSL로 인증서 확인
OpenSSL: "네, 진짜입니다!" ✅
```

#### 3. 안전한 연결 수립 (SSL/TLS Handshake)
```
클라이언트 ←→ OpenSSL ←→ 서버
"안전한 통신 채널 생성!"
```

---

### Prisma가 OpenSSL을 사용하는 이유

#### Prisma는 데이터베이스와 안전하게 통신해야 합니다

**시나리오 1: MySQL 연결 (SSL 사용)**
```
DATABASE_URL="mysql://user:pass@db.example.com:3306/mydb?sslmode=require"
                                                          ↑ SSL 필요!
```

**Prisma Engine의 동작**:
```
1. MySQL 서버에 연결 시도
2. OpenSSL로 SSL/TLS 연결 수립
3. 암호화된 채널로 쿼리 전송
4. 암호화된 응답 수신
```

**OpenSSL이 없으면?**
```
Prisma: "SSL 연결을 만들어야 하는데..."
OpenSSL: (없음)
Prisma: "❌ 에러! libssl.so.3를 찾을 수 없습니다!"
```

---

### OpenSSL 버전 문제

#### OpenSSL 버전 종류
```
OpenSSL 1.0.x (구버전, 2019년 지원 종료)
OpenSSL 1.1.x (안정 버전)
OpenSSL 3.0.x (최신 버전, 2021년 출시)
```

#### Prisma Engine은 OpenSSL 버전별로 다릅니다
```
node_modules/@prisma/engines/
├── query-engine-debian-openssl-1.1.x  ← OpenSSL 1.1.x용
├── query-engine-debian-openssl-3.0.x  ← OpenSSL 3.0.x용
└── query-engine-windows.exe           ← Windows용 (OpenSSL 포함)
```

**Prisma는 자동으로 감지합니다**:
```
1. 시스템의 OpenSSL 버전 확인
   → openssl version 실행
   → "OpenSSL 3.0.2" 출력

2. 적절한 Engine 선택
   → query-engine-debian-openssl-3.0.x 사용
```

---

### Alpine Linux와 OpenSSL

#### Alpine Linux의 특징
```
일반 Linux (Ubuntu, Debian):
크기: 200MB
OpenSSL: 기본 포함 ✅

Alpine Linux:
크기: 5MB (매우 작음!)
OpenSSL: 기본 미포함 ❌
```

**우리가 사용하는 이미지**:
```dockerfile
FROM node:20-alpine
# → Alpine Linux 기반
# → OpenSSL 없음!
```

**Prisma 실행 시**:
```
Prisma: "OpenSSL 어디 있어?"
Alpine: "없는데요?"
Prisma: "⚠️ 경고! OpenSSL을 찾을 수 없습니다!"
Prisma: "기본값(openssl-1.1.x)으로 시도..."
Prisma: "❌ 실패! libssl.so.1.1을 찾을 수 없습니다!"
```

---

### 해결: OpenSSL 설치

```dockerfile
# Alpine Linux에 OpenSSL 설치
RUN apk add --no-cache openssl
```

**설치 후**:
```
Prisma: "OpenSSL 어디 있어?"
Alpine: "여기 있어요! OpenSSL 3.0.2"
Prisma: "✅ 좋아! query-engine-debian-openssl-3.0.x 사용할게"
```

---

## 실제 예시로 이해하기

### 예시 1: HTTPS 웹사이트 접속

**브라우저가 하는 일**:
```
1. https://google.com 접속
2. OpenSSL로 Google 인증서 확인
3. OpenSSL로 암호화 키 교환
4. 암호화된 채널로 데이터 송수신
```

**OpenSSL이 없다면?**:
```
브라우저: "HTTPS를 사용할 수 없습니다!"
사용자: "❌ 이 사이트는 안전하지 않습니다"
```

---

### 예시 2: Prisma 데이터베이스 연결

**Prisma가 하는 일**:
```
1. DATABASE_URL에서 SSL 요구 확인
2. OpenSSL로 MySQL 서버와 SSL 연결
3. 암호화된 채널로 쿼리 전송
   예: SELECT * FROM users WHERE id = 1
4. 암호화된 결과 수신
```

**OpenSSL이 없다면?**:
```
Prisma: "SSL 연결을 만들 수 없습니다!"
애플리케이션: "❌ 데이터베이스 연결 실패!"
```

---

## 요약

### Prisma 쓰기 권한

| 질문 | 답변 |
|------|------|
| **왜 필요한가?** | Prisma Engine 바이너리를 `node_modules/@prisma/engines`에 다운로드하기 위해 |
| **언제 필요한가?** | `npx prisma generate`, `npx prisma db push` 실행 시 |
| **해결 방법은?** | 1) 미리 `prisma generate` 실행 (root 권한)<br>2) `chown -R node:node /app`로 소유권 변경 |

### OpenSSL

| 질문 | 답변 |
|------|------|
| **무엇인가?** | 암호화 라이브러리 (HTTPS, SSL/TLS 구현) |
| **왜 필요한가?** | Prisma가 데이터베이스와 안전하게 통신하기 위해 |
| **Alpine에 왜 없나?** | Alpine은 크기를 줄이기 위해 기본 패키지 최소화 |
| **설치 방법은?** | `apk add --no-cache openssl` |

### 핵심 개념

**Prisma Engine**:
- Rust로 작성된 네이티브 바이너리
- 운영체제 + OpenSSL 버전별로 다름
- 런타임에 다운로드되면 쓰기 권한 필요

**OpenSSL**:
- 암호화 라이브러리
- HTTPS, SSL/TLS 통신에 필수
- Prisma가 데이터베이스와 안전하게 통신하는 데 사용
