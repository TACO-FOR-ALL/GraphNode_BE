# 2026-05-20 — Macro 그래프 생성 S3 prefix bundle 정렬

## 배경

GraphNode_AI `Macro Raw File Support` 문서에 따라 Worker는 다음을 모두 지원한다.

1. **신버전**: `s3Key`가 `graph-generation/{taskId}/`처럼 슬래시로 끝나는 **prefix bundle** — prefix 아래 객체 전체를 입력 디렉터리로 사용.
2. **구버전**: `s3Key` 단일 파일 + `extraS3Keys` 추가 키.

BE는 권장 방식으로 전환하여 `extraS3Keys` 없이 bundle만 전송한다.

## BE 변경 요약

- `graph-generation/{taskId}/` prefix에 `input.json`, `notes.json`, `files/{userFileId}_{displayName}` 업로드.
- SQS `GRAPH_GENERATION_REQUEST` payload: `s3Key` = 위 prefix(반드시 `/` 종료), `inputType: 'auto'`, `minClusters` / `maxClusters` 기본 3·8, **`extraS3Keys` 생략**.
- 사용자 라이브러리 파일은 기존 `user_files` S3 키에서 **바이트를 읽어** bundle `files/`로 복사(확장자 유지).

## 관련 코드

- `src/core/services/GraphGenerationService.ts` — `requestGraphGenerationViaQueue`
- `src/shared/dtos/queue.ts` — `GraphGenRequestPayload` 필드 정리

## E2E / CI 검증 (가상 환경)

프로덕션(Infisical)이 아닌 **`docker-compose.test.yml` + LocalStack** 에서 검증한다.

| 구성 | 역할 |
|------|------|
| `tests/e2e/utils/db-seed.ts` | `user-12345` + 대화/노트 + **PDF/DOCX/PPTX** mock `user_files` + S3 원본 업로드 |
| `tests/e2e/specs/macro-s3-bundle.spec.ts` | `POST /generate` 직후 S3 `graph-generation/{taskId}/` bundle 키 검증 |
| `tests/e2e/specs/graph-flow.spec.ts` | BE→AI→Worker→Neo4j 전체 플로우 + `nodeType: file` / 확장자별 `fileType` |
| `scripts/e2e-test.sh` | compose 헬스 확인 → 시드 → Jest E2E |
| `.github/workflows/BE-AI-flow-test.yml` | PR 시 위 스크립트를 Runner에서 실행 |

실유저(프로덕션 Mongo)에 `user_files`가 없으면 로컬 Infisical 스모크는 대화/노트만 번들된다. **원시 파일 포함 검증은 E2E mock 유저만 사용.**

**CI 검증(권장):** `feature/support-raw-files` → `develop` PR 시 `BE-AI-flow-test.yml` 이 compose 스택에서 E2E 실행.

로컬 Docker E2E가 필요할 때만 (선택):

**CI / 기본 E2E (`E2E_SCOPE=bundle`, PR 게이트)**

- `BE-AI-flow-test.yml` · `npm run e2e:test` → **`macro-s3-bundle.spec.ts` 만** 실행 (graph-flow/microscope 미실행).
- OpenAI 키가 CI secret에 있어도 Macro 파이프라인 실패로 job이 깨지지 않음.

**로컬 (키 없음)**

- `npm run e2e:bundle` — 인프라 + BE만, bundle 스펙만 (~2초).

**전체 LLM E2E (선택)**

- `E2E_SCOPE=full npm run e2e:test` 또는 `npm run e2e:test:full` — graph-flow + microscope 포함, 유효 LLM 키 필요.

**전체 graph-flow / microscope (로컬, LLM 필요)**

- OpenAI: `export OPENAI_API_KEY='sk-...'`
- 또는 **Groq 무료 키**: `export GROQ_API_KEY='gsk_...'` 후 `npm run e2e:local` (macro/microscope가 groq provider 사용)
- `.env`의 `sk-placeholder` 그대로면 AI 401 → `NOT_CREATED`

```bash
docker build -t graphnode-be:test .
# AI: ECR base 없이 로컬 base 빌드 후 앱 이미지 (401 방지)
docker build -f ../GraphNode_AI/Dockerfile.base -t graphnode-ai-base:local ../GraphNode_AI
docker build --build-arg BASE_IMAGE=graphnode-ai-base:local -t graphnode-ai:test ../GraphNode_AI
# 또는 한 번에: npm run e2e:local
docker compose -f docker-compose.test.yml up -d
bash scripts/e2e-test.sh
```

종료: `docker compose -f docker-compose.test.yml down -v`
