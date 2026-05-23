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
| `tests/e2e/utils/db-seed.ts` | `user-12345` + 대화/노트 + **PDF/DOCX/PPTX/unknown.xyz** mock `user_files` + S3 원본 업로드 |
| `tests/e2e/specs/macro-s3-bundle.spec.ts` | `POST /generate` 직후 S3 `graph-generation/{taskId}/` bundle 키 검증 |
| `tests/e2e/specs/graph-flow.spec.ts` | BE→AI→Worker→Neo4j 전체 플로우 + `nodeType: file` / 확장자별 `fileType` |
| `scripts/e2e-test.sh` | compose 헬스 확인 → 시드 → Jest E2E |
| `.github/workflows/BE-AI-flow-test.yml` | PR 시 위 스크립트를 Runner에서 실행 |

실유저(프로덕션 Mongo)에 `user_files`가 없으면 로컬 Infisical 스모크는 대화/노트만 번들된다. **원시 파일 포함 검증은 E2E mock 유저만 사용.**

**CI 검증(권장):** `feature/support-raw-files` → `develop` PR 시 `BE-AI-flow-test.yml` 이 compose 스택에서 E2E 실행.

로컬 Docker E2E가 필요할 때만 (선택):

**CI / 통합 E2E (`E2E_SCOPE=full`, PR 게이트)**

- `BE-AI-flow-test.yml` · `npm run e2e:test` → **`tests/e2e/specs/` 전체** (macro-s3-bundle + graph-flow + microscope).
- CI `OPENAI_API_KEY` secret 필요. graph-flow는 metadata·`file_counts_by_extension.other`·Macro API snapshot 검증 포함.

**로컬 (키 없음, 빠른 검증)**

- `npm run e2e:bundle` 또는 `npm run e2e:test:bundle` — bundle 스펙만 (~2초).

**전체 LLM E2E (로컬)**

- `npm run e2e:test` (기본 `E2E_SCOPE=full`) 또는 `npm run e2e:local` — graph-flow + microscope 포함.
- `.env`의 `OPENAI_API_KEY`가 placeholder이면 **AWS Secrets Manager**에서 자동 조회 (`DEV_OPENAI_API_KEY`, `DEV_GROQ_API_KEY`). Node SDK 사용 — `aws` CLI 없어도 됨 (`aws configure` / SSO 또는 IAM 자격 필요).
- **Groq는 E2E 테스트 전용** (`docker-compose.test.yml`). `E2E_PREFER_GROQ=1` + `GROQ_API_KEY`일 때만 Macro/Microscope가 groq 사용 (기본 `E2E_PREFER_GROQ=0`).
- OpenAI quota(429)로 로컬 full E2E만 Groq: `.env`에 `E2E_PREFER_GROQ=1`, `GROQ_API_KEY=gsk-...` (또는 `DEV_GROQ_API_KEY` SM + `aws sso login`).

**전체 graph-flow / microscope (로컬, LLM 필요)**

- OpenAI: `export OPENAI_API_KEY='sk-...'`
- **Groq(E2E만)**: `E2E_PREFER_GROQ=1` + `GROQ_API_KEY=gsk-...` 후 `npm run e2e:test`
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

**Worker `NOT_CREATED` + `unresolvedOrigIds: docx_uf-e2e-docx_...`**

- `normalizeAiOrigId`가 bundle 파일 id(`docx_{userFileId}_…`) → `user_files._id`로 정규화.

**Neo4j 노드 3개 vs 기대 6개**

- AI Macro는 conv+note+파일 1개만 feature로 처리하는 경우가 있음(로그: `Feature data extracted for 3 conversations`).
- BE `augmentGraphOutputWithUserFileNodes`가 활성 `user_files` 중 AI 출력에 없는 항목을 스냅샷에 보강.

**코드 변경 후** `docker build -t graphnode-be:test .` → worker 재기동 필수.
