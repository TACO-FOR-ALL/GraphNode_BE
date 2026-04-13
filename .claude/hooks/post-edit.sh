#!/bin/bash
# ============================================================
#  GraphNode BE — PostToolUse Master Hook
#  트리거: Write | Edit 완료 후 자동 실행
#  각 Hook은 file_path 패턴이 일치할 때만 동작한다.
# ============================================================

# ── 0. stdin 선독 후 file_path 파싱 ──────────────────────────
# stdin은 한 번만 읽을 수 있으므로 먼저 변수에 저장
INPUT=$(cat)

FILE=$(echo "$INPUT" | node -e "
let d='';
process.stdin.on('data', c => d += c).on('end', () => {
  try {
    const o = JSON.parse(d);
    const f = (o.tool_input?.file_path || '').replace(/\\\\/g, '/');
    process.stdout.write(f);
  } catch { process.stdout.write(''); }
});
" 2>/dev/null)

[ -z "$FILE" ] && exit 0

# ── SYNC-0: DATABASE.md 갱신 알림 ────────────────────────────
# 트리거: prisma/schema.prisma | src/core/types/persistence/**
if [[ "$FILE" =~ schema\.prisma$|/types/persistence/[^/]+\.ts$ ]]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║ [SYNC] DATABASE.md 갱신 필요                         ║"
  echo "║  변경 파일: $(basename "$FILE")"
  echo "║  → docs/architecture/DATABASE.md ERD·테이블 동기화   ║"
  echo "╚══════════════════════════════════════════════════════╝"
fi

# ── SYNC-0b: PROJECT_STRUCTURE.md 갱신 알림 ──────────────────
# 트리거: Bash 도구에서 mkdir 실행 시 → CLAUDE.md Auto-sync Rule 위임
# (Write/Edit hook으로는 신규 디렉토리와 기존 단일파일 디렉토리를 구별 불가)
# CLAUDE.md: "src/ 하위 신규 디렉토리 추가 완료 후 PROJECT_STRUCTURE.md 갱신"

# ── HOOK 1: OpenAPI Spec Lint ─────────────────────────────────
# 트리거: docs/api/openapi.yaml | docs/schemas/*.json
if [[ "$FILE" =~ /docs/api/openapi\.yaml$|/docs/schemas/[^/]+\.json$ ]]; then
  echo ""
  echo "┌─ [LINT] Spectral lint 실행 중... ($(basename "$FILE") 변경)"
  LINT_OUT=$(npm run docs:lint 2>&1)
  if echo "$LINT_OUT" | grep -qi " error "; then
    echo "│  ❌ Spectral 오류 감지 — 수정 필요:"
    echo "$LINT_OUT" | grep -i " error " | head -10 | sed 's/^/│    /'
  else
    echo "│  ✅ Spectral lint 통과"
  fi
  echo "└────────────────────────────────────────────────────"
fi

# ── HOOK 2: SDK Type Drift Detection ─────────────────────────
# 트리거: src/shared/dtos/*.ts
if [[ "$FILE" =~ /src/shared/dtos/([^/]+)\.ts$ ]]; then
  DTO_NAME="${BASH_REMATCH[1]}"
  echo ""
  echo "┌─ [DRIFT] DTO 변경 감지: ${DTO_NAME}.ts"
  EXACT=$(find z_npm_sdk/src/types/ -name "${DTO_NAME}.ts" 2>/dev/null | head -1)
  FUZZY=$(find z_npm_sdk/src/types/ -name "*${DTO_NAME}*" 2>/dev/null | head -3)
  if [ -n "$EXACT" ]; then
    echo "│  → z_npm_sdk/src/types/${DTO_NAME}.ts 동기화 확인 필요"
  elif [ -n "$FUZZY" ]; then
    echo "│  → 유사 SDK 타입 파일 확인 필요:"
    echo "$FUZZY" | while IFS= read -r f; do
      echo "│    ${f#*/z_npm_sdk/}"
    done
  else
    echo "│  ⚠️  SDK 대응 타입 없음 — 신규 DTO면 z_npm_sdk/src/types/ 에 추가 필요"
  fi
  echo "└────────────────────────────────────────────────────"
fi

# ── HOOK 3: ECS env.ts 동기화 경고 ───────────────────────────
# 트리거: src/config/env.ts
if [[ "$FILE" =~ /src/config/env\.ts$ ]]; then
  echo ""
  echo "┌─ [ECS] env.ts 변경 감지"
  echo "│  환경변수 추가·변경 시 아래 파일 secrets 섹션 갱신 필요:"
  echo "│    • ecs/task-definition.json"
  echo "│    • ecs/worker-task-definition.json"
  REQUIRED_COUNT=$(grep -c "\.min(1" "$FILE" 2>/dev/null || echo "?")
  ECS_SECRET_COUNT=$(node -e "
    try {
      const d = require('./ecs/task-definition.json');
      const n = (d.containerDefinitions||[]).reduce((s,c)=>s+(c.secrets||[]).length,0);
      process.stdout.write(String(n));
    } catch { process.stdout.write('?'); }
  " 2>/dev/null)
  echo "│  env.ts 필수값: ${REQUIRED_COUNT}개 | ecs secrets: ${ECS_SECRET_COUNT}개"
  echo "└────────────────────────────────────────────────────"
fi

# ── HOOK 4: Controller / Service LOC 체크 ────────────────────
# 트리거: src/app/controllers/*.ts (>150줄) | src/core/services/*.ts (>300줄)
if [[ "$FILE" =~ /src/app/controllers/[^/]+\.ts$ ]]; then
  LOC=$(wc -l < "$FILE" 2>/dev/null | tr -d ' ')
  if [ -n "$LOC" ] && [ "$LOC" -gt 150 ]; then
    echo ""
    echo "┌─ [LOC] ❌ Controller 줄 수 초과"
    echo "│  $(basename "$FILE") — ${LOC}줄 (허용 ≤150줄)"
    echo "│  → Presenter 추출 또는 Sub-controller 분리 검토"
    echo "└────────────────────────────────────────────────────"
  fi
fi

if [[ "$FILE" =~ /src/core/services/[^/]+\.ts$ ]]; then
  LOC=$(wc -l < "$FILE" 2>/dev/null | tr -d ' ')
  if [ -n "$LOC" ] && [ "$LOC" -gt 300 ]; then
    echo ""
    echo "┌─ [LOC] ❌ Service 줄 수 초과"
    echo "│  $(basename "$FILE") — ${LOC}줄 (허용 ≤300줄)"
    echo "│  → 책임 분리 또는 하위 Service 추출 검토"
    echo "└────────────────────────────────────────────────────"
  fi
fi

# ── HOOK 5: Cross-layer Import Guard ─────────────────────────
# 트리거: src/core/services/*.ts 에서 infra/ 직접 import 감지
if [[ "$FILE" =~ /src/core/services/[^/]+\.ts$ ]]; then
  VIOLATIONS=$(grep -nE "from ['\"].*\/infra\/" "$FILE" 2>/dev/null)
  if [ -n "$VIOLATIONS" ]; then
    echo ""
    echo "┌─ [LAYER] ❌ 레이어 위반 감지: $(basename "$FILE")"
    echo "│  services → infra 직접 import 금지 (DIP 위반)"
    echo "│  위반 라인:"
    echo "$VIOLATIONS" | head -5 | sed 's/^/│    /'
    echo "│  → src/core/ports/ 인터페이스를 통해 접근하세요"
    echo "└────────────────────────────────────────────────────"
  fi
fi

# ── HOOK 6: Port ↔ Repository 구현체 정합성 체크 ─────────────
# 트리거: src/core/ports/*.ts — infra/ 전체에서 implements 선언 탐색
if [[ "$FILE" =~ /src/core/ports/([^/]+)\.ts$ ]]; then
  PORT_NAME="${BASH_REMATCH[1]}"
  echo ""
  echo "┌─ [PORT] 포트 변경: ${PORT_NAME}.ts"
  IMPLS=$(grep -rl "implements ${PORT_NAME}\b" src/infra/ 2>/dev/null)
  if [ -z "$IMPLS" ]; then
    echo "│  ⚠️  구현체 없음 — src/infra/ 전체에서 'implements ${PORT_NAME}' 미발견"
    echo "│  → 신규 포트라면 infra/ 하위에 구현체 생성 필요"
  else
    echo "│  ✅ 구현체:"
    echo "$IMPLS" | while IFS= read -r f; do
      echo "│    ${f}"
    done
  fi
  echo "│  bootstrap/container.ts DI 연결도 확인하세요"
  echo "└────────────────────────────────────────────────────"
fi


exit 0
