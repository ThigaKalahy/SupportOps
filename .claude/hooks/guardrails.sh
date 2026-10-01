#!/usr/bin/env bash
set -uo pipefail
INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
FILE="${FILE//\\//}"
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

PROTEGIDOS=(".env" "MANUAL-COMPLETO.md" "PLANO-TECNICO.md" "pnpm-lock.yaml" ".git/")
for p in "${PROTEGIDOS[@]}"; do
  if [[ "$FILE" == *"$p"* ]]; then
    echo "Bloqueado: '$p' e protegido. Registre em BLOCKERS.md e pare." >&2
    exit 2
  fi
done

DESTRUTIVOS=("migrate reset" "db push --force-reset" "git push --force" "git push -f" "git reset --hard" "rm -rf /" "DROP TABLE" "DROP DATABASE" "TRUNCATE")
for d in "${DESTRUTIVOS[@]}"; do
  if [[ "$CMD" == *"$d"* ]]; then
    echo "Bloqueado: '$d' exige autorizacao humana. Registre em BLOCKERS.md e pare." >&2
    exit 2
  fi
done

PROIBIDAS=("redux" "@reduxjs" "@trpc" "zustand" "framer-motion" "gsap" "styled-components" "@emotion" "algoliasearch" "meilisearch" "chakra" "@mui/" "antd" "next-auth@4" "recharts" "chart.js")
if [[ "$CMD" == *"install"* || "$CMD" == *" add "* ]]; then
  for lib in "${PROIBIDAS[@]}"; do
    if [[ "$CMD" == *"$lib"* ]]; then
      echo "Bloqueado: '$lib' esta fora da stack do CLAUDE.md. Registre em BLOCKERS.md com justificativa e pare." >&2
      exit 2
    fi
  done
fi

exit 0
