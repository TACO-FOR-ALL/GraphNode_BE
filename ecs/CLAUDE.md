# ecs/ — BE ECS Task Definition 빠른 참조

GraphNode **백엔드(BE)** 의 AWS ECS Fargate 태스크 정의 파일 모음.

> 배포 전체 파이프라인은 [`docs/architecture/CI_CD_and_AWS.md`](../docs/architecture/CI_CD_and_AWS.md) 참조.

---

## 파일 목록

| 파일 | ECS Family | 역할 |
|---|---|---|
| `task-definition.json` | `taco-5-graphnode-be-task` | **API 서버** — HTTP 요청 처리, 클라이언트 응답 |
| `worker-task-definition.json` | `taco-5-graphnode-worker-task` | **SQS Worker** — SQS Result Queue 소비, 그래프 생성 결과 처리 |

---

## task-definition.json (API 서버)

```
Container : taco5_graphnode_container
Image     : 571721033550.dkr.ecr.ap-northeast-2.amazonaws.com/taco5/graphnode-be:latest_10
CPU       : 1024 vCPU  |  Memory : 2048 MB
Port      : 3000 (taco5_graphnode_port)
Region    : ap-northeast-2
```

**역할**: Express API 서버. 클라이언트 요청을 받아 DB 조회·비즈니스 로직 수행 후 응답.
무거운 AI 작업(그래프 생성·문서 인제스트)은 **SQS Request Queue로 위임**하고 즉시 반환.

---

## worker-task-definition.json (SQS Worker)

```
Container : taco5_graphnode_worker_container
Image     : 571721033550.dkr.ecr.ap-northeast-2.amazonaws.com/taco4/graphnode:latest_10
CPU       : 1024 vCPU  |  Memory : 2048 MB
Region    : ap-northeast-2
```

**역할**: SQS Result Queue를 폴링하여 AI 파이프라인 완료 결과를 처리.
HTTP 포트 없음 — 외부 트래픽을 받지 않고 큐 메시지만 소비.

---

## 환경 변수 주입 방식

비밀값은 **Infisical / AWS Secrets Manager**에서 주입. 파일에 실제 값 없음.

```json
{ "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..." }
```

> **금지**: 이 파일에 실제 API 키·패스워드·토큰 직접 기입 금지. `valueFrom` 방식 사용.

---

## 수정 시 주의사항

| 수정 내용 | 해야 할 일 |
|---|---|
| 환경변수 추가 | Infisical/Secrets Manager에 먼저 등록 후 `valueFrom` 추가 |
| 채팅 내보내기 SMTP | 시크릿 JSON에 `CHAT_EXPORT_SMTP_USER`, `CHAT_EXPORT_SMTP_PASS`, 선택 `CHAT_EXPORT_EMAIL_FROM`. 태스크 재등록 |
| 이미지 태그 변경 | `image` 필드 업데이트 후 AWS CLI로 태스크 재등록 |
| CPU/Memory 변경 | 최상위 `cpu`·`memory` AND `containerDefinitions[].cpu`·`memory` 둘 다 수정 |
| 포트 추가 | `portMappings` 배열에 추가 + 보안 그룹 인바운드 규칙도 업데이트 |

```bash
# 태스크 정의 등록 (변경 후 실행)
aws ecs register-task-definition --cli-input-json file://task-definition.json
aws ecs register-task-definition --cli-input-json file://worker-task-definition.json
```

---

## BE–AI 통신 흐름 요약

```
Client
  → task-definition (API 서버, :3000)
    → SQS Request Queue
      → GraphNode_AI ECS Worker  (../GraphNode_AI/GrapeNode_AI/ecs/)
        → SQS Result Queue
          → worker-task-definition (SQS Worker)
            → FCM/WebSocket → Client
```
