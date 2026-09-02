# Plantero ERP

Plantero (Bigetaş Biyoteknoloji A.Ş.) bitkisel gıda üretiminin dijital ikizi — SAP Business One mantığında tek veri tabanı, belge zinciri, maliyetli stok defteri, kopmayan lot izlenebilirliği.

## Kurulum
```bash
pnpm install
cp .env.example .env           # DATABASE_URL, REDIS_URL
docker compose up -d           # ya da yerel Postgres 16 + Redis
pnpm db:reset                  # şema + seed (Excel importları dahil)
pnpm dev                       # web :3000 + worker
```
Test hesapları: `docs/TEST-ACCOUNTS.md`. Mimari ve servis sözleşmeleri: `docs/ARCHITECTURE.md`. Bütünlük kuralları: `docs/INVARIANTS.md`. Varsayımlar: `docs/ASSUMPTIONS.md`.

## Kalite döngüleri
- `pnpm db:check` — muhasebe/stok/lot bütünlüğü (sıfır tolerans)
- `pnpm e2e` — Playwright uçtan uca akışlar
- `pnpm shot /route` — görsel eleştiri için ekran görüntüleri
