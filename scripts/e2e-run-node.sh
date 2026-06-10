#!/bin/bash
# WSL1 / cmd→bash 환경에서 npx 대신 사용할 Node.js 경로 해석
_to_win_path_if_needed() {
  local p="$1"
  if [[ "$p" == /mnt/* ]] && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p"
  else
    printf '%s' "$p"
  fi
}

resolve_e2e_node() {
  if command -v node >/dev/null 2>&1 && node -e "process.exit(0)" >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidate=""
  for candidate in \
    "/mnt/c/nvm4w/nodejs/node.exe" \
    "/mnt/c/Program Files/nodejs/node.exe"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  echo "ERROR: Node.js not found. WSL2 사용 또는 Windows Node(nvm4w) 설치 후 다시 시도하세요." >&2
  return 1
}

run_e2e_node() {
  local node_bin
  node_bin="$(resolve_e2e_node)" || exit 1

  if [[ "$node_bin" == *.exe ]]; then
    local win_args=()
    local arg=""
    for arg in "$@"; do
      win_args+=("$(_to_win_path_if_needed "$arg")")
    done
    "$node_bin" "${win_args[@]}"
    return $?
  fi

  "$node_bin" "$@"
}
