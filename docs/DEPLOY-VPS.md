# Tek sunucuya kurulum (AWS Lightsail / EC2 / herhangi bir VPS)

Dört parça (Postgres, Redis, web, worker) tek makinede Docker Compose ile çalışır; Caddy önde HTTPS verir. Deneme ve küçük ekip kullanımı için yeterlidir.

## Gereken makine
- Ubuntu 22.04/24.04 veya Debian 12, **en az 2 vCPU / 4 GB RAM** (derleme sırasında bellek gerekir), 20 GB disk.
- AWS Lightsail'de "Linux/Unix → Ubuntu 24.04", 4 GB plan (~24 $/ay) uygundur; EC2'de t3.medium.
- Güvenlik grubunda / Lightsail ağ sekmesinde **80 ve 443** portları açık olmalı (22 zaten açıktır).

## Kurulum (tek komut)
Sunucuya SSH ile girin ve çalıştırın:
```bash
curl -fsSL https://raw.githubusercontent.com/sushibibi-milkos-ops/Plantero_ERP/claude/plantero-digital-twin-dvh9ui/scripts/deploy/vps-install.sh | sudo bash
```
Alan adınız varsa (DNS A kaydı sunucu IP'sine bakıyorsa) HTTPS için:
```bash
curl -fsSL https://raw.githubusercontent.com/sushibibi-milkos-ops/Plantero_ERP/claude/plantero-digital-twin-dvh9ui/scripts/deploy/vps-install.sh | sudo PLANTERO_DOMAIN=erp.ornek.com bash
```
Betik Docker'ı kurar, depoyu `/opt/plantero` altına alır, `.env` üretir (rastgele Postgres şifresi), imajı derler ve dört servisi başlatır. İlk derleme 10-15 dakika, ardından şema + seed 2-3 dakika sürer.

## Doğrulama
- `http://<sunucu-ip>/api/health` (alan adı verdiyseniz `https://<alan-adı>/api/health`) → `"seeded":true`
- Giriş: `admin@plantero.local` / `Plantero!2026` (`docs/TEST-ACCOUNTS.md`)

## Günlük işler
```bash
cd /opt/plantero
docker compose -f docker-compose.prod.yml logs -f web        # günlük
docker compose -f docker-compose.prod.yml ps                 # durum
sudo bash scripts/deploy/vps-install.sh                      # güncelleme: dalı çeker, yeniden derler
docker compose -f docker-compose.prod.yml down -v            # her şeyi sil (veri dahil)
```
API anahtarları (`ANTHROPIC_API_KEY`, Bizimhesap, Trendyol vb.) `/opt/plantero/.env` dosyasına eklenip `docker compose -f docker-compose.prod.yml up -d` ile yeniden yüklenir.
