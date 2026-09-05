# Plantero ERP — Mimari ve Servis Sözleşmeleri

Bu belge tüm modül agent'larının uyduğu sözleşmedir. Şema `packages/db/src/schema/**` dondurulmuştur; eksik gördüğün şeyi raporla, değiştirme.

## 1. Katmanlar
```
apps/web (Next 15 App Router)  ──►  packages/core (domain servisleri)  ──►  packages/db (Drizzle + Postgres)
apps/worker (BullMQ)           ──►  packages/integrations / packages/ai ──►  packages/core
```
- Ekranlar server component; yazma işlemleri server action (`'use server'`), `zod` ile doğrulanır, `requirePermission` + `withAudit` ile sarılır.
- Core servisleri **transaction alır** (`tx: DbOrTx`) ve asla kendi transaction'ını açmaz (çağıran açar). İstisna: dış API'lerden gelen tek satırlık job'lar.
- `ActorCtx = { userId: string | null; userEmail?: string; requestId?: string; ip?: string }` her yazma servisine geçilir (audit için).

## 2. Para ve miktar — `packages/core/src/money.ts`
```ts
import Decimal from 'decimal.js';
export type Money = Decimal;
export const D = (v: string | number | Decimal | null | undefined) => new Decimal(v ?? 0);
export const toDb = (d: Decimal) => d.toFixed(4);          // numeric(18,4) için
export const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const sum = (xs: Iterable<Decimal>) => ...;
export const pct = (base: Decimal, p: Decimal) => base.mul(p).div(100);
export const ZERO = new Decimal(0);
```
Float kullanma. DB'den gelen `numeric` string → `D(...)`. DB'ye yazarken `toDb(...)`.

## 3. Belge numaraları — `packages/core/src/sequences.ts`
`nextDocNo(tx, code): Promise<string>` → `${prefix}-${yıl}-${sıra 6 hane}`. `SELECT ... FOR UPDATE` ile atomik.
Kodlar: `QT` teklif, `SO` sipariş, `DN` irsaliye, `INV` satış faturası, `PINV` alış faturası, `PAY` tahsilat/ödeme, `GR` mal kabul, `PO` satın alma, `WO` iş emri, `TR` transfer, `CNT` sayım, `SCR` fire, `SM` stok hareketi, `JE` yevmiye, `QC` kalite, `RC` geri çağırma, `OPP` fırsat, `EXP` ihracat, `MO` bakım, `RD` Ar-Ge projesi.
Mamul lot no formatı: `PL-YYMMDD-<HAT>-<sıra2>` (ör. `PL-260902-H1-01`) — `nextLotNo(tx, lineCode, date)`.

## 4. Kimlik ve yetki
- `packages/core/src/auth/password.ts`: `hashPassword`, `verifyPassword` (bcryptjs, 10 tur).
- `packages/core/src/auth/session.ts`: `createSession(tx, userId, meta) → { token, expiresAt }` (token rastgele 32 byte, DB'de sha256 hash), `resolveSession(db, token) → { user, roles, permissions } | null`, `destroySession`.
- `packages/core/src/auth/rbac.ts`: `PERMISSIONS` sabit listesi (`{ code, module, description }[]`), `ROLE_PRESETS` (rol → izin kodları), `hasPermission(ctx, code)`.
- `apps/web/src/lib/auth.ts`: `getCurrentUser()` (cookie `plantero_session`, `cache()`), `requirePermission(code)` → `UserCtx` veya `ForbiddenError` fırlatır (sayfada `forbidden()`/`redirect('/login')`), `requireUser()`.
- Roller: `admin`, `genel_mudur`, `muhasebe`, `finans`, `satis`, `satin_alma`, `depo`, `uretim_operatoru`, `uretim_sefi`, `kalite`, `bakim`, `arge`, `ihracat`.
- İzin kod deseni: `<modul>.<eylem>` — `masterdata.view/manage`, `stock.view/receive/pick/transfer/count/approve_count`, `production.view/plan/operate/close`, `sales.view/quote/order/confirm/price`, `purchasing.view/draft/approve/send`, `quality.view/inspect/release/recall`, `accounting.view/post/invoice/einvoice/reconcile/close_period`, `finance.view/manage/dunning`, `export.view/manage`, `maintenance.view/report/plan/execute`, `rnd.view/manage/release`, `cockpit.view`, `admin.users/settings/audit`.

## 5. Audit — `packages/core/src/audit/index.ts`
`writeAudit(tx, { action, tableName, recordId, summary, before?, after? }, ctx)`. `apps/web/src/lib/actions.ts` içinde `withAudit(name, fn)` server action sarmalayıcısı: hata yakalar, `{ ok: true, data } | { ok: false, error }` döner, başarıda audit satırı yazar.

## 6. Stok defteri — `packages/core/src/stock/ledger.ts` (TEK yazma noktası)
```ts
export type StockMoveInput = {
  kind: StockMoveKind; productId: string; lotId?: string | null;
  fromLocationId: string; toLocationId: string; qty: Decimal; uomId: string;
  unitCost?: Decimal;            // verilmezse lot.unitCost (lotlu) / product.averageCost (lotsuz)
  refType: string; refId: string; refLineId?: string; refNo?: string; partnerId?: string;
  movedAt?: Date; origin?: DocumentOrigin; note?: string; isValued?: boolean;
};
export async function postStockMove(tx, input, ctx): Promise<{ moveId: string; value: Decimal; journalEntryIds: string[] }>
export async function pickFefo(tx, { productId, qty, rootLocationId, allowStatuses = ['released'] }): Promise<Array<{ lotId; locationId; qty: Decimal; unitCost: Decimal; expiryDate }>>
export async function reserve(tx, { productId, lotId, locationId, qty }) / release(...)
export async function getOnHand(tx, { productId, warehouseId?, locationId?, lotId? }) → { qty, reserved, available, value }
```
Kurallar (ledger uygular, çağıran güvenmez):
1. Kaynak lokasyon `usage in ('internal','quarantine','rejected','transit')` ise quant düşer; `available = qty - reserved` yeterli olmalı (negatif stok yasak).
2. Hedef lokasyon `internal/quarantine/rejected/transit` ise quant artar (inDate, expiryDate lot'tan).
3. `usage in ('production','customer','supplier','scrap','inventory_loss')` sanal: quant tutulmaz.
4. Lotlu üründe `lotId` zorunlu. `status='rejected'|'recalled'|'expired'` lot **hiçbir yere** çıkamaz (scrap/return hariç); `quarantine` lot yalnızca karantina→serbest/red hareketi yapabilir; müşteriye/üretime yalnızca `released`.
5. Değerleme: `value = qty × unitCost` (4 hane). Lotlu ürün maliyeti lot'tan; `receipt`/`production` hareketi lot maliyetini **belirler**. Lotsuz üründe hareketli ağırlıklı ortalama güncellenir.
6. Her değerli hareket (`isValued`) **iki deftere** (VUK+UFRS) `postJournalEntry` ile fiş atar ve `journalEntryId` (VUK fişi) move'a yazılır. `transfer`, `quarantine_release`, `quarantine_reject` değersizdir (hesap değişmez).
7. Hesap eşlemesi (`packages/core/src/accounting/mapping.ts`):
| Hareket | Borç | Alacak |
|---|---|---|
| receipt (tedarikçiden) | 150/152/153 (ürün tipine göre envanter) | 320.999 "Faturası gelmemiş alımlar" |
| return_out (tedarikçiye iade) | 320.999 | 15X |
| consumption (iş emri) | 151.01 Üretimde (WIP) | 150 |
| production (mamul çıktı) | 152 (mamul) / 151.02 (yarı mamul çıktı) | 151.01 (malzeme payı) + 731 Genel üretim gideri yansıtma (genel gider payı) |
| byproduct | 152 / 151.02 | 151.01 |
| scrap | 659 Diğer olağan gider (fire) | 15X (fiziksel stok) / 151.01 (iş emri WIP firesi: kaynak lokasyon `production`) |
| delivery (müşteriye) | 621 Satılan mamul maliyeti (SMM) | 152 (lot maliyeti) |
| return_in (müşteriden iade) | 152 | 621 |
| count_gain | 15X | 679 Diğer olağandışı gelir |
| count_loss | 659 | 15X |
| recall_return | 152 | 621 |
| opening | 15X | 500 Sermaye (açılış) |
Envanter hesabı ürün tipine göre: raw_material→150, packaging→150, semi_finished→**151.02 Yarı Mamul Stok**, finished→152, merchandise→153. **151.01 Üretimde (WIP)** yalnızca açık iş emri değeri taşır (I15); I1 yarı mamul quant değerini 151.02 ile karşılaştırır. Ana hesap 151 = 151.01 + 151.02.
**Dönem kuralı:** fiş tarihi hiçbir `fiscal_periods` satırına düşmüyorsa `postJournalEntry` hata verir (PERIOD_NOT_FOUND); kapalı dönem → PERIOD_CLOSED.

## 7. Muhasebe — `packages/core/src/accounting/journal.ts` (TEK yazma noktası)
```ts
export type JournalLineInput = { accountCode: string; debit?: Decimal; credit?: Decimal; partnerId?: string; description?: string; productId?; channelId?; warehouseId?; currency?; amountCurrency?; dueDate? };
export type JournalEntryInput = { ledger: 'VUK' | 'UFRS' | 'both'; journalCode: string; entryDate: Date; description: string; refType?: string; refId?: string; refNo?: string; partnerId?: string; currency?: string; exchangeRate?: Decimal; lines: JournalLineInput[]; origin?: DocumentOrigin };
export async function postJournalEntry(tx, input, ctx): Promise<{ vukId?: string; ufrsId?: string }>
export async function reverseJournalEntry(tx, entryId, ctx)
export async function getAccountBalance(tx, { accountCode, ledger, asOf?, partnerId? }) → Decimal  (borç − alacak)
export async function getPartnerBalance(tx, partnerId) → { receivable, payable, net }
```
Kurallar: Σborç = Σalacak (4 hane, sıfır fark); dönem kapalıysa hata; `both` → iki fiş, `twinEntryId` çapraz bağlanır; cari alt hesabı otomatik açılır (`ensurePartnerAccount(tx, partnerId, '120'|'320')` → `120.<code>`); `journalLines.accountCode` denormalize.
Fatura/tahsilat kayıtları:
| Olay | Borç | Alacak |
|---|---|---|
| Satış faturası | 120.cari (brüt) | 600 Yurtiçi satış (net) + 391 Hesaplanan KDV |
| Satış faturası (ihracat) | 120.cari | 601 Yurtdışı satış (KDV 0) |
| Satış iade | 610 Satıştan iade + 391 | 120.cari |
| Kanal komisyonu/kargo (pazaryeri hakediş) | 760 Pazarlama gideri | 120.cari (kanal carisi) |
| Alış faturası (stoklu) | 320.999 (stok tutarı) + 191 İndirilecek KDV | 320.cari |
| Alış faturası (gider) | 7XX gider + 191 | 320.cari |
| Tahsilat | 102.banka / 100 kasa | 120.cari |
| Ödeme | 320.cari | 102.banka |
| Kur farkı (lehte / aleyhte) | 120.cari / 656 Kambiyo zararı | 646 Kambiyo kârı / 120.cari |
| Kredi taksiti | 300 Banka kredileri (anapara) + 780 Finansman gideri (faiz+BSMV) | 102.banka |
| Banka masrafı | 770 Genel yönetim gideri | 102.banka |
| KDV dönem kapanışı | 391 | 191 (+190 devreden / 360 ödenecek) |
UFRS defteri aynı kayıtları alır; fark yalnızca `ifrsCode` eşlemesi olan hesaplarda (raporlama) ve dönem sonu düzeltmelerinde.

## 8. Belge zinciri — `packages/core/src/documents/chain.ts`
`linkDocuments(tx, { sourceType, sourceId, sourceLineId?, targetType, targetId, targetLineId?, qty?, amount? }, ctx)`, `getChain(db, type, id) → { upstream: Node[], downstream: Node[] }` (BFS, her düğüm `{ type, id, docNo, status, date, amount, partnerName }`), `indexDocument(tx, { type, recordId, docNo, partnerId, status, origin, title, amount, docDate })` — her belge oluşturma/durum değişiminde çağrılır.
Miktar zinciri servis tarafında zorlanır: `deliveredQty ≤ qty` (sipariş satırı), `invoicedQty ≤ deliveredQty`; `receivedQty ≤ qty` (PO satırı).

## 9. Lot izlenebilirlik — `packages/core/src/lots/trace.ts`
`traceBackward(db, lotId)` → mamul lot → iş emri → tüketilen lotlar → mal kabul → tedarikçi (rekürsif, yarı mamul dahil). `traceForward(db, lotId)` → lot → iş emirleri (tüketim) → mamul lotlar → sevkiyat satırları → müşteri; ayrıca eldeki stok (quant). Çıktı: `{ nodes: TraceNode[], edges: TraceEdge[] }`; `TraceNode = { id, kind: 'lot'|'work_order'|'receipt'|'delivery'|'partner'|'quant', label, sub, qty?, status?, href }`.
`simulateRecall(db, lotId, direction)` → `recalls.impact` şekli `{ lots, workOrders, deliveries, customers, qtyInStock, qtyDelivered }`.

## 10. Web uygulaması iskeleti
- Route grupları: `src/app/(auth)/login`, `src/app/(app)/...` (kenar çubuğu + üst bar), `src/app/(operator)/operator/...` (tablet, tam ekran, büyük butonlar), `src/app/api/health`.
- Modül route'ları: `/kokpit`, `/ana-veri/{urunler,cariler,receteler,depolar,import}`, `/depo/{stok,mal-kabul,sevkiyat,transfer,sayim,lotlar,skt}`, `/uretim/{is-emirleri,hatlar,planlama}`, `/operator`, `/satis/{siparisler,teklifler,firsatlar,kanallar,fiyat-listeleri,net-ciro}`, `/satin-alma/{siparisler,kritik-stok,onay-kuyrugu,tedarikciler}`, `/kalite/{kontroller,tedarikci-skoru,izlenebilirlik,geri-cagirma}`, `/muhasebe/{faturalar,tahsilatlar,banka,mutabakat,yevmiye,hesap-plani,kdv}`, `/finans/{nakit-akisi,break-even,butce,krediler,tahsilat-takibi,tahmin}`, `/ihracat/{sevkiyatlar,belgeler,kurlar}`, `/bakim/{makineler,planlar,is-emirleri,oee}`, `/arge/{projeler,[id]/board,receteler}`, `/ayarlar/{kullanicilar,roller,audit}`.
- Ortak bileşenler `src/components/`: `app-shell/{sidebar,topbar,command-menu,mobile-nav}`, `page-header`, `data-table/*` (TanStack Table + Virtuoso büyük listede; sütun sıralama, filtre, arama, boş/yükleniyor durumları, satır aksiyonları, mobilde kart görünümüne düşer), `kpi-card`, `status-badge` (durum → renk sözlüğü), `money-cell`, `qty-cell`, `lot-badge`, `expiry-badge` (SKT: >90 gün nötr, 60-90 sarı, 30-60 turuncu, <30 kırmızı, geçmiş koyu kırmızı), `empty-state`, `form/*` (react-hook-form + zod alan sarmalayıcıları), `document-chain` (zincir görselleştirme), `trace-graph`.
- `src/lib/format.ts`: `formatMoney(v, currency='TRY')` → `₺1.234,56`, `formatQty`, `formatDate` (`dd.MM.yyyy`), `formatDateTime`, `formatPct`, `relativeTime`.
- Tasarım token'ları `src/app/globals.css`: Tailwind v4 `@theme`; yazı tipi Inter (next/font) + JetBrains Mono (tabular sayılar); nötr zinc skalası; tek vurgu: Plantero yeşili `--primary: oklch(0.55 0.16 152)`; `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, `--ease-drawer: cubic-bezier(0.32,0.72,0,1)`; radius 8px; hairline `border-border/60`; koyu tema desteklenir (next-themes).

## 11. Seed sırası (`packages/db/src/seed/index.ts`)
`core` (roller, izinler, kullanıcılar, diziler, ayarlar) → `uoms` → `masterdata` (kategoriler, SKU segmentleri, Excel ürün importu, cariler, depolar/lokasyonlar, hatlar, kanallar, fiyat listeleri, reçeteler) → `accounting` (hesap planı TDHP, yevmiyeler, vergiler, dönemler, banka hesapları) → `finance` (Excel: 7 kredi + taksit takvimi, sabit giderler, varsayımlar, kanal varsayımları) → `stock` (açılış stokları: hammadde lotları + mamul lotları, opening move'lar → 15X/500) → `production` (örnek iş emirleri: biri tamamlanmış, biri devam eden) → `sales` (fırsatlar, siparişler, sevkiyatlar, faturalar) → `purchasing` → `quality` → `notifications` (SKT özetleri, worker ile aynı core fonksiyonu) → `bank` (banka hareketleri: gerçek tahsilatlarla eşleşen + eşleşmeyen) → `maintenance` → `rnd`. Her seed idempotent; belge akışları **core servisleri üzerinden** üretilir (elle insert ile tutarsız veri yaratma).

## 12. Worker kuyrukları (`apps/worker`)
`reconciliation-nightly` (02:00), `marketplace-sync` (15 dk), `replenishment-engine` (06:00), `dunning-scheduler` (09:00), `tcmb-rates` (16:00), `expiry-alerts` (07:00), `maintenance-scheduler` (05:00), `oee-daily` (23:30), `cashflow-recompute` (03:00), `einvoice-send` (anlık), `notifications` (anlık). Her job `job_runs` tablosuna yazar. Job mantığı `packages/core`/`packages/ai`'dedir; worker yalnızca tetikler.

## 13. Entegrasyon adaptörleri (`packages/integrations`)
Her adaptör `{ mode: 'sandbox' | 'live' }`; env yoksa sandbox. Arayüzler: `EInvoiceProvider` (bizimhesap: `sendInvoice`, `sendDespatch`, `getStatus`), `MarketplaceProvider` (trendyol/hepsiburada: `fetchOrders(since)`, `updateStock`, `fetchSettlements`), `BankProvider` (`fetchTransactions(account, since)`; `parseMt940(text)`, `parseCsv(text, mapping)`), `RateProvider` (tcmb: `fetchDaily(date)` — sandbox deterministik kur), `Messenger` (`sendWhatsApp`, `sendEmail` — sandbox `outbox` tablosu yerine `notifications` kaydı + dosyaya yazar), `PdfRenderer` (sipariş/proforma/packing list PDF — `@react-pdf/renderer` yerine basit HTML→PDF: Playwright chromium ile `page.pdf`).

## 14. AI (`packages/ai`)
`getClient()` — `ANTHROPIC_API_KEY` yoksa `null`; her fonksiyonun deterministik kural tabanlı fallback'i vardır: `matchBankTransaction(tx, candidates) → ranked matches` (fuzzy: tutar eşitliği, isim benzerliği (trigram), IBAN öğrenilmiş desen, tarih yakınlığı, fatura no geçişi), `draftPurchaseOrder(rules, consumption)`, `draftDunningMessage(invoice, partner, level, tone)`, `forecastSales(history)` (fallback: mevsimsel hareketli ortalama), `forecastCash(...)`. Model: `claude-sonnet-5` (hız) — sadece yapılandırılmış JSON çıktı.
