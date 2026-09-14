#!/usr/bin/env bash
# Tek komutla sunucu kurulumu (Ubuntu 22.04/24.04, Debian 12; AWS Lightsail/EC2 veya herhangi bir VPS).
#   curl -fsSL https://raw.githubusercontent.com/sushibibi-milkos-ops/Plantero_ERP/claude/plantero-digital-twin-dvh9ui/scripts/deploy/vps-install.sh | sudo bash
# İsteğe bağlı ortam değişkenleri: PLANTERO_DOMAIN=erp.ornek.com  PLANTERO_BRANCH=...  POSTGRES_PASSWORD=...
set -euo pipefail

REPO_URL="${PLANTERO_REPO:-https://github.com/sushibibi-milkos-ops/Plantero_ERP.git}"
BRANCH="${PLANTERO_BRANCH:-claude/plantero-digital-twin-dvh9ui}"
DIR="${PLANTERO_DIR:-/opt/plantero}"

if [ "$(id -u)" -ne 0 ]; then echo "root olarak çalıştırın (sudo)"; exit 1; fi

echo "== 1/4 Docker kuruluyor"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { apt-get update && apt-get install -y docker-compose-plugin; }

echo "== 2/4 Kaynak alınıyor ($BRANCH → $DIR)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  apt-get install -y git >/dev/null 2>&1 || true
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

echo "== 3/4 .env hazırlanıyor"
if [ ! -f .env ]; then
  PW="${POSTGRES_PASSWORD:-$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)}"
  cat > .env <<ENV
PLANTERO_DOMAIN=${PLANTERO_DOMAIN:-}
POSTGRES_PASSWORD=$PW
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
TCMB_LIVE=${TCMB_LIVE:-}
ENV
  chmod 600 .env
fi

echo "== 4/4 Derleme ve başlatma (ilk seferde 10-15 dk sürer)"
docker compose -f docker-compose.prod.yml up -d --build

IP="$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
DOMAIN="$(grep -E '^PLANTERO_DOMAIN=' .env | cut -d= -f2-)"
echo
echo "Kurulum başladı. Şema ve seed yüklenirken 2-3 dakika bekleyin, sonra:"
if [ -n "$DOMAIN" ]; then echo "  https://$DOMAIN/api/health"; else echo "  http://$IP/api/health"; fi
echo "  Giriş: admin@plantero.local / Plantero!2026"
echo "Günlük: docker compose -f $DIR/docker-compose.prod.yml logs -f web"
