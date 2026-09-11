#!/usr/bin/env bash
# Worker servisi başlangıcı: BullMQ işçileri (gece mutabakat, pazaryeri senkron, TCMB kuru, hatırlatmalar, kritik stok, OEE).
set -euo pipefail
cd "$(dirname "$0")/../../apps/worker"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[deploy] HATA: DATABASE_URL tanımlı değil (worker servisi → Variables → Add Reference → Postgres.DATABASE_URL)." >&2
  exit 1
fi
echo "[deploy] worker başlıyor (REDIS_URL ${REDIS_URL:-tanımsız → in-process zamanlayıcı})"
exec pnpm exec tsx src/index.ts
