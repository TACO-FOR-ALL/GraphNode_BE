#!/bin/bash
# GraphNode doc auto-sync trigger
# PostToolUse(Write|Edit) 후 실행 — 관련 파일 변경 시에만 갱신 지시를 출력한다.

F=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

[[ "$F" =~ schema\.prisma|/types/persistence/ ]] \
  && echo "[SYNC] DATABASE.md 갱신 — prisma schema 또는 persistence 타입이 변경되었습니다."

[[ "$F" =~ /src/[a-zA-Z]+/?$ ]] \
  && echo "[SYNC] PROJECT_STRUCTURE.md 확인 — src/ 최상위 변경이 감지되었습니다."

exit 0
