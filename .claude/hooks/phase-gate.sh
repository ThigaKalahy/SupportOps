#!/usr/bin/env bash
set -uo pipefail
INPUT=$(cat)

[ -f "$CLAUDE_PROJECT_DIR/.claude/.autorun" ] || exit 0
[ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ] && exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
grep -q '^## \[ \]' BLOCKERS.md 2>/dev/null && exit 0
[ -f package.json ] || exit 0

tem_script() { jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null 2>&1; }

FALHAS=""
for etapa in typecheck lint build; do
  tem_script "$etapa" || continue
  if ! pnpm "$etapa" > "/tmp/gate-$etapa.log" 2>&1; then
    FALHAS="${FALHAS}
- pnpm $etapa reprovou:
$(tail -40 "/tmp/gate-$etapa.log")"
  fi
done

if [ -n "$FALHAS" ]; then
  printf "Portao reprovado. Corrija antes de encerrar o turno:%s\n" "$FALHAS" >&2
  exit 2
fi
exit 0
