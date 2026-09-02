# Plantero ERP — Proje Kuralları (tüm agent'lar önce bunu okur)

Plantero (Bigetaş Biyoteknoloji A.Ş., VKN 1700727314, üretim: Tire Küçük Sanayi Sitesi, merkez: Bayraklı/İzmir; 3 üretim hattı — `docs/PRODUCTION-LINES.md`) bitkisel gıda üreticisinin tam dijital ikizi. SAP Business One mantığı: tek veritabanı, tek ana veri, belge zinciri (teklif → sipariş → irsaliye → fatura → tahsilat), her stok hareketi maliyetli kayıt üretir, lot izlenebilirliği hiçbir noktada kopmaz. RBAC + audit log her tabloda standart. UI dili Türkçe.

## Monorepo
- `apps/web` — Next.js 15 App Router, React 19, Tailwind v4, shadcn/ui. Tüm ekranlar `src/app/(app)/<modul>/...`, modül mantığı `src/modules/<modul>/{actions.ts,queries.ts,components/}`.
- `apps/worker` — BullMQ işçileri (gece mutabakat, pazaryeri senkron, hatırlatmalar, TCMB kuru, kritik stok motoru).
- `packages/db` — Drizzle şeması (`src/schema/*.ts`, **dondurulmuş**, sadece orkestratör değiştirir), seed (`src/seed/*.ts`), bütünlük kontrolleri (`src/checks/*.sql`), Excel import (`src/import/*.ts`).
- `packages/core` — domain servisleri: `stock/ledger.ts` (postStockMove — tek stok yazma noktası), `accounting/journal.ts` (postJournalEntry — tek muhasebe yazma noktası), `documents/chain.ts` (belge zinciri), `lots/trace.ts`, `auth/`, `audit/`, `money.ts`, `sequences.ts`.
- `packages/integrations` — Bizimhesap (e-Fatura/e-Arşiv/e-İrsaliye), Trendyol, Hepsiburada, açık bankacılık + MT940/CSV, TCMB, WhatsApp, e-posta. Her entegrasyon `sandbox` modunda deterministik sahte veri üretir; gerçek kimlik bilgisi `.env`'de yoksa sandbox.
- `packages/ai` — Anthropic SDK; mutabakat eşleştirme, sipariş taslağı, tahsilat hatırlatma metni, satış/nakit tahmini. `ANTHROPIC_API_KEY` yoksa deterministik kural tabanlı fallback.

## Komutlar
- `pnpm install` · `pnpm dev` (web :3000 + worker) · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (vitest) · `pnpm e2e` (Playwright)
- DB: `pnpm db:push` (şemayı uygula) · `pnpm db:seed` · `pnpm db:reset` (drop+push+seed) · `pnpm db:check` (bütünlük SQL'leri) · `pnpm db:studio`
- Ekran görüntüsü: `pnpm shot /route` → `artifacts/screens/<slug>/{desktop,mobile}.png`
- Ortam: `.env` (DATABASE_URL=postgres://postgres:postgres@localhost:5432/plantero, REDIS_URL=redis://localhost:6379). Postgres 16 ve Redis lokal çalışır.

## Değişmez kurallar
1. Stok yazımı yalnızca `postStockMove`; muhasebe yazımı yalnızca `postJournalEntry`; ikisi aynı transaction'da (`db.transaction`).
2. Lotlu üründe lotsuz hareket yok. Karantina/red lotu sevk edilemez ve üretime giremez. FEFO: en erken SKT önce.
3. Her belge `document_links` ile kaynağına bağlı; miktar zinciri: teslim ≤ sipariş, fatura ≤ teslim.
4. Para `numeric(18,4)`, `decimal.js` ile hesap; float yasak. Tarih/saat UTC `timestamptz`, ekranda `Europe/Istanbul`.
5. Her server action: `requirePermission` + `withAudit`. Audit satırı: tablo, kayıt id, eylem, önce/sonra JSON, kullanıcı, zaman.
6. Ürün adları ve barkodlar Excel'den geldiği gibi kalır; asla normalize edilmez.
7. Çift defter: her yevmiye `ledger` = `VUK` | `UFRS`; stok/satış/alış kayıtları iki deftere de düşer (fark yalnızca değerleme/politika kalemlerinde).
8. KDV: satış %1 (gıda), alış %20 ağırlıklı; devreden KDV 190/191/391 hesaplarında izlenir.

## UI kuralları (kısa)
`.claude/skills/{design-engineering,apple-design,animate,pick-ui-library}/SKILL.md` geçerlidir. Linear tablo + Stripe finans çıtası. Kurumsal-sıkıcı ERP görünümü yasak. Tam mobil uyum (375px). Ortak bileşenler: `PageHeader`, `DataTable`, `KpiCard`, `StatusBadge`, `EmptyState`, `MoneyCell`, `LotBadge`, `ExpiryBadge` (`apps/web/src/components`).

## Test hesapları
`docs/TEST-ACCOUNTS.md` (admin@plantero.local / Plantero!2026 vb.)
