# GraphNode 부하 테스트 가이드

이 문서는 k6를 사용하여 GraphNode 백엔드 API의 부하 테스트를 수행하는 방법을 안내합니다.

## 1. 사전 준비

### 1.1. k6 설치

k6가 설치되어 있어야 합니다. 각 운영체제에 맞는 설치 방법은 [k6 공식 문서](https://k6.io/docs/getting-started/installation/)를 참고하세요.

- **macOS (Homebrew):**
  ```sh
  brew install k6
  ```
- **Windows (Chocolatey):**
  ```sh
  choco install k6
  ```
- **Linux (apt):**
  ```sh
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update
  sudo apt-get install k6
  ```

### 1.2. 환경변수 설정

테스트 실행 시, 대상 서버의 URL과 인증 쿠키를 환경변수로 설정해야 합니다.

- `BASE_URL`: 테스트할 백엔드 서버의 기본 URL입니다. (예: `https://api.graphnode.com`)
- `K6_COOKIE`: 인증에 사용할 세션 쿠키 값입니다. 브라우저로 로그인 후 개발자 도구에서 `connect.sid` 쿠키 값을 복사하여 사용합니다.

**PowerShell 예시:**
```powershell
$env:BASE_URL="https://api.graphnode.com"
$env:K6_COOKIE="sid=s%3A...<복사한 쿠키 값>"
```

## 2. 테스트 스크립트 실행

프로젝트 루트 디렉토리에서 다음 명령어를 실행합니다.

### 2.1. Read-Only 시나리오

일반적인 조회 기능의 성능을 테스트합니다.
```sh
k6 run .\loadtest\scenarios\scenario_read_only.js
```

### 2.2. Read & Write 시나리오

읽기와 쓰기(노트 생성)가 혼합된 상황을 테스트합니다.
```sh
k6 run .\loadtest\scenarios\scenario_read_write.js
```

### 2.3. Heavy-Read 시나리오

DB와 CPU 부하가 높은 조회 기능의 한계를 테스트합니다.
**주의:** 실행 전 `scenario_heavy_read.js` 파일의 `conversationIds` 배열에 실제 조회할 대화 ID를 채워넣어야 합니다.

```sh
k6 run .\loadtest\scenarios\scenario_heavy_read.js
```

## 3. 테스트 데이터 정리

**경고: 이 스크립트는 데이터베이스의 모든 데이터를 삭제합니다. 실제 운영 환경에서는 절대 실행하지 마세요.**

테스트로 인해 생성된 모든 데이터를 정리하려면 `cleanup` 스크립트를 실행합니다.

### 3.1. 사전 준비

스크립트 실행에 필요한 `mysql2`와 `mongodb` 드라이버를 설치합니다.
```sh
npm install mysql2 mongodb
```

### 3.2. 스크립트 실행

DB 접속 정보를 환경변수로 설정한 후 스크립트를 실행합니다.

**PowerShell 예시:**
```powershell
$env:DB_HOST="<DB 호스트>"
$env:DB_USER="<DB 사용자명>"
$env:DB_PASSWORD="<DB 비밀번호>"
$env:DB_NAME="<DB 이름>"
$env:MONGO_URI="<MongoDB 접속 URI>"

node .\loadtest\cleanup\db_cleanup.js
```

## 4. 결과 해석 가이드

k6 실행이 완료되면 콘솔에 결과가 요약되어 출력됩니다. 주요 메트릭은 다음과 같습니다.

- `http_reqs`: 총 요청 수.
- `http_req_duration`: 요청 처리 시간. `avg`(평균), `p(95)`(상위 95% 지점) 값이 중요합니다.
- `http_req_failed`: 실패한 요청의 비율. `rate`가 `0.01` 이하면 양호합니다.
- `vus`: 테스트에 사용된 가상 사용자 수.
- `checks`: 스크립트 내 `check()` 함수의 성공률. 100%에 가까울수록 좋습니다.

이 지표들을 `options`에 설정한 `thresholds`와 비교하여 테스트 성공 여부를 판단할 수 있습니다.
