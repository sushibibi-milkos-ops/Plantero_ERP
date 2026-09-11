#!/usr/bin/env bash
# Worker servisi başlangıcı: BullMQ işçileri (gece mutabakat, pazaryeri senkron, TCMB kuru, hatırlatmalar, kritik stok, OEE).
set -euo pipefail
cd "$(dirname "$0")/../../apps/worker"
: "${DATABASE_URL:?DATABASE_URL tanımlı olmalı}"
echo "[deploy] worker başlıyor (REDIS_URL ${REDIS_URL:-tanımsız → in-process zamanlayıcı})"
exec pnpm exec tsx src/index.ts
