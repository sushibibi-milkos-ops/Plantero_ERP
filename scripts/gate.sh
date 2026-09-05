#!/bin/bash
# Kapı koşusu: temiz seed → bütünlük → typecheck/lint/test → üretim derlemesi → prod sunucu → e2e (grep parametresi)
# Kullanım: scripts/gate.sh <grep> [logdir]
#
# Tur 4 P2 düzeltmesi — paylaşılan/çoklu-ajan ortamı izolasyonu:
# Bu makinede aynı anda başka bir oturumun `pnpm dev:web` süreci çalışıyor olabilir. Üretim
# doğrulama adımı (build+start+health+e2e) eskiden sabit port 3000 + öntanımlı `.next` dizinini
# kullanıyordu; bu, eşzamanlı bir dev sürecinin aynı `.next`'i yazdığı/okuduğu anda çakışıp
# ("Cannot find module for page: /_document") build'i bozabiliyor, `next start` `EADDRINUSE`
# ile patlayabiliyor VEYA (en sinsisi) health-check port 3000'de YANLIŞLIKLA diğer oturumun
# DEV sunucusundan 200 alıp e2e'yi sessizce dev'e karşı, derleme-gecikmesi kaynaklı sahte
# zaman aşımlarıyla koşturabiliyordu. Çözüm:
#   1) Bu koşuya özgü, çalışma zamanında bulunan boş bir port (asla sabit 3000).
#   2) Bu koşuya özgü ayrı bir `.next` çıktı dizini (next.config.ts → PLANTERO_NEXT_DIST_DIR).
#   3) Health-check yalnızca 200 kodunu değil, o portu dinleyen sürecin GERÇEKTEN bizim
#      başlattığımız PID olduğunu (/proc/net/tcp → inode → /proc/<pid>/fd eşlemesiyle,
#      lsof/ss'e ihtiyaç duymadan) doğrular.
#   4) Temizlik yalnızca bizim başlattığımız PID'i durdurur — sistemdeki başka bir oturumun
#      next dev/start sürecine ASLA dokunulmaz (eskiden `pkill -f "next dev|next start|..."`
#      TÜM oturumların sunucularını öldürüyordu — bu satır kaldırıldı).
set -uo pipefail
GREP=${1:-phase1}; L=${2:-/tmp/plantero-gate}; mkdir -p "$L"
cd "$(dirname "$0")/.."
ROOT=$(pwd)

echo "== db:reset"; pnpm db:reset > "$L/reset.log" 2>&1; echo reset_exit:$?
echo "== db:check"; pnpm db:check > "$L/check.log" 2>&1; echo check_exit:$?; tail -2 "$L/check.log"
pnpm typecheck --concurrency=1 > "$L/typecheck.log" 2>&1; echo typecheck_exit:$?
pnpm lint --concurrency=1 > "$L/lint.log" 2>&1; echo lint_exit:$?
pnpm test --concurrency=1 > "$L/test.log" 2>&1; echo test_exit:$?; grep -E "Tests " "$L/test.log" | tail -6

# /proc/net/tcp(6)'te verilen TCP portunu LISTEN durumunda tutan PID'leri döndürür.
# lsof/ss gerektirmez (bazı ortamlarda ikisi de eksik/izinsiz olabiliyor) — yalnızca procfs.
pids_listening_on_port() {
  local port="$1" port_hex inodes pid_dir pid ino
  port_hex=$(printf '%04X' "$port")
  inodes=$(awk -v p=":${port_hex}$" '$2 ~ p && $4=="0A" {print $10}' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)
  [ -z "$inodes" ] && return 0
  for pid_dir in /proc/[0-9]*; do
    pid=${pid_dir#/proc/}
    for ino in $inodes; do
      if ls -l "$pid_dir/fd" 2>/dev/null | grep -q "socket:\[${ino}\]"; then
        echo "$pid"
        break
      fi
    done
  done
}

echo "== build (izole port + izole .next)"
# Bu koşuya özgü boş bir port ve ayrı bir build çıktı dizini seç.
GATE_PORT=$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});")
export PLANTERO_NEXT_DIST_DIR=".next-gate-$$"
BASE_URL="http://127.0.0.1:$GATE_PORT"
echo "gate_port:$GATE_PORT dist_dir:$PLANTERO_NEXT_DIST_DIR"
rm -rf "apps/web/$PLANTERO_NEXT_DIST_DIR"

# Bu script'in önceki bir koşusundan kalan KENDİ sunucumuz varsa durdur (sistemdeki başka
# bir oturuma ait sürece asla dokunmuyoruz — yalnızca bu $L dizinine kendi yazdığımız PID'e).
if [ -f "$L/gate.pid" ]; then
  OLD_PID=$(cat "$L/gate.pid" 2>/dev/null)
  if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then kill "$OLD_PID" 2>/dev/null; fi
  rm -f "$L/gate.pid"
fi

pnpm --filter @plantero/web build > "$L/build.log" 2>&1; echo build_exit:$?

echo "== start (izole port: $GATE_PORT)"
(cd apps/web && exec node_modules/.bin/next start -p "$GATE_PORT") > "$L/start.log" 2>&1 &
GATE_PID=$!
echo "$GATE_PID" > "$L/gate.pid"

HEALTHY=0
for i in $(seq 1 60); do
  if ! kill -0 "$GATE_PID" 2>/dev/null; then
    echo "gate sunucu süreci ($GATE_PID) erken sonlandı — start.log'a bakın"; break
  fi
  LISTENERS=$(pids_listening_on_port "$GATE_PORT")
  if echo "$LISTENERS" | grep -qx "$GATE_PID"; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/health")
    if [ "$CODE" = "200" ]; then HEALTHY=1; break; fi
  fi
  sleep 2
done
echo "health_own_pid_verified:$HEALTHY gate_pid:$GATE_PID health:$(curl -s "$BASE_URL/api/health" 2>/dev/null)"

echo "== e2e $GREP (izole baz URL: $BASE_URL)"
cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PLAYWRIGHT_BASE_URL="$BASE_URL" npx playwright test --grep "$GREP" --workers=1 --reporter=line > "$L/e2e.log" 2>&1; echo e2e_exit:$?; grep -E "passed|failed|did not run|flaky" "$L/e2e.log" | tail -5
cd "$ROOT"

echo "== temizlik (yalnızca bu koşunun kendi süreci ve kendi .next dizini)"
kill "$GATE_PID" 2>/dev/null; wait "$GATE_PID" 2>/dev/null
rm -f "$L/gate.pid"
rm -rf "apps/web/$PLANTERO_NEXT_DIST_DIR"
