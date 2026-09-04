#!/bin/bash
# Kapı koşusu: temiz seed → bütünlük → typecheck/lint/test → üretim derlemesi → prod sunucu → e2e (grep parametresi)
# Kullanım: scripts/gate.sh <grep> [logdir]
GREP=${1:-phase1}; L=${2:-/tmp/plantero-gate}; mkdir -p $L
cd "$(dirname "$0")/.."
echo "== db:reset"; pnpm db:reset > $L/reset.log 2>&1; echo reset_exit:$?
echo "== db:check"; pnpm db:check > $L/check.log 2>&1; echo check_exit:$?; tail -2 $L/check.log
pnpm typecheck --concurrency=1 > $L/typecheck.log 2>&1; echo typecheck_exit:$?
pnpm lint --concurrency=1 > $L/lint.log 2>&1; echo lint_exit:$?
pnpm test --concurrency=1 > $L/test.log 2>&1; echo test_exit:$?; grep -E "Tests " $L/test.log | tail -6
echo "== build"; for p in $(pgrep -f "next dev|next start|next-server" ); do kill $p 2>/dev/null; done; sleep 2
pnpm --filter @plantero/web build > $L/build.log 2>&1; echo build_exit:$?
cd apps/web && (nohup pnpm start > $L/start.log 2>&1 &); cd ../..
for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health | grep -q 200 && break; sleep 2; done; echo health:$(curl -s http://localhost:3000/api/health)
echo "== e2e $GREP"; cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test --grep "$GREP" --workers=1 --reporter=line > $L/e2e.log 2>&1; echo e2e_exit:$?; grep -E "passed|failed|did not run|flaky" $L/e2e.log | tail -5
