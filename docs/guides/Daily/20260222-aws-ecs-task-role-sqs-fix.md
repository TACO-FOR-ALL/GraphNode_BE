# 작업 상세 문서 — AWS ECS Task Role SQSClient 인증 에러 수정

## 📌 메타 (Meta)
- **작성일**: 2026-02-22 KST
- **작성자**: AI Agent
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AWS]

---

## 📝 TL;DR (핵심 요약)
- **목표:** Worker 프로세스가 SQS 큐에서 메시지를 읽어오지 못하고 `InvalidClientTokenId` 403 오류를 출력하는 문제를 진단 및 픽스하고, AWS 인증 방식을 문서화함.
- **결과:** SDK SQSClient의 `credentials` 초기화 방식을 `undefined` 폴백(Fallback) 구조로 수정하여, AWS ECS Task Role의 메타데이터 인증 구조를 정상적으로 타도록 수정함.
- **영향 범위:** 백그라운드 워커(`src/workers/index.ts`)의 모든 SQS 큐 처리 과정. (메인 API 서버는 이미 올바른 방식으로 되어 있어 변경 없음)

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 운영 서버(ECS Fargate 컨테이너) 환경에서 기동된 워커 노드가 `taco-graphnode-response-graph-sqs` 큐로부터 데이터를 가져오려 할 때 권한 오류가 발생함.
- `AWS_ACCESS_KEY_ID` 등의 환경변수들을 Task Definition 파일에 직접 주입하지 않는 운영 스펙에 맞게 구현체를 대응 및 수정해야 함.

### 사전 조건/선행 작업
- `.github/workflows/deploy.yml`, `ecs/worker-task-definition.json` 등 현재 인프라 설정 파악
- 기존 SQS 어댑터 코드 (`AwsSqsAdapter.ts`)의 초기화 패턴 분석

---

## 📦 산출물

### 📁 추가된 파일
- `docs/architecture/CI_CD_and_AWS.md` — CI/CD 개요와 AWS IAM Task Role 개념을 통한 권한 처리 방식을 포함하도록 새로 작성된 아키텍처 문서.

### 📄 수정된 파일
- `src/workers/index.ts` — SQSClient 생성자 내의 `credentials` 설정부 수정.

### 🗑 삭제된 파일
- `docs/architecture/CI_CD.md` — 위 신규 통합 문서로 병합/대체하여 삭제함.

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)
- `src/workers/index.ts` — SQS Client 초기화
  - AS-IS: 없는 환경변수를 참조하여 빈 문자열 `''`을 `credentials`에 억지로 집어넣음.
    이로 인해 AWS SDK가 빈 엑세스 키를 사용하려 시도하면서 `403 InvalidClientTokenId` 발현.
  - TO-BE: `AWS_ACCESS_KEY_ID` 및 `AWS_SECRET_ACCESS_KEY` 둘 중 하나라도 없을 때에는 전체 `credentials` 오브젝트를 `undefined`로 지정.
    이렇게 하면 AWS SDK가 컨테이너 실행 환경을 확인한 뒤, ECS 메타데이터로부터 Task Role(임시 토큰)을 정상적으로 가져와서 폴링을 시도함.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- AWS IAM: `graphnode-ecs-task-role` Role 존재.
- `.env`에 AWS 키가 존재하지 않아야 Task Role 인증 분기의 테스트가 정상적으로 가능하지만, 로컬 머신에서는 AWS CLI 프로필 정보가 사용됨.

### 📦 설치
```bash
npm install
```

### ▶ 실행
```bash
# 로컬 개발 환경에서
npm run start:worker
```

### 🧪 검증
- 이제 서버를 기동하거나 워커를 띄웠을 때 403 인증 토큰 관련 에러 없이 SQS 메시지 폴링이 정상 수행됨.

---

## 🛠 구성 / 가정 / 제약
- ECS 기반 Fargate 운영 환경에서 환경 변수(environment) 대신 반드시 Task Role을 통해 컨테이너 자체에 최소 권한을 부여한다는 원칙을 전제함.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 해당 문제는 로컬 개발 환경에서는 `.env` 에 할당된 키가 동작하기 때문에 재현 및 발견이 원천적으로 불가능한 이슈였음. 
- 오직 인프라(Task Definition)와의 연계를 정확하게 점검해야만 파악이 가능한 사안이었으며, 앞으로 S3Client, SESClient 등의 다른 객체를 초기화할 때도 반드시 이와 동일한 자격 증명 체크 패턴을 사용해야 함.

---

## 🔜 다음 작업 / TODO
- (Optional) AWS Client 초기화 코드를 분리된 공통 모듈이나 Util로 빼내어, API 서버 어댑터와 Worker 측에서 모두 싱글 톤으로 공유하도록 리팩토링할 시 중복 코드 방지 가능.

---

## 📎 참고 / 링크
- `docs/architecture/CI_CD_and_AWS.md`

---

## 📜 변경 이력
- v1.0 (2026-02-22): 최초 작성
