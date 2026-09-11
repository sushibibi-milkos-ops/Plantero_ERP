#!/usr/bin/env bash
# Web servisi başlangıcı: veritabanı boşsa şema + seed (packages/db/src/bootstrap.ts), sonra next start.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${DATABASE_URL:?DATABASE_URL tanımlı olmalı}"

if [ "${PLANTERO_BOOTSTRAP:-1}" = "1" ]; then
  pnpm --filter @plantero/db bootstrap
fi

echo "[deploy] web başlıyor (port ${PORT:-3000})"
cd apps/web
exec pnpm exec next start -p "${PORT:-3000}"
