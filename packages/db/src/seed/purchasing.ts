import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import {
  products, partners, warehouses, supplierProducts, reorderRules, purchaseOrders,
  approvals, receipts, invoices,
} from '../schema/index.js';
import {
  D, SYSTEM_ACTOR, writeAudit, createPurchaseOrder, approvePurchaseOrder, markPurchaseOrderSent,
  createRetroactivePurchaseOrderForReceipt,
} from '@plantero/core';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Satın alma modülü seed'i — docs/modules/tedarik.md, docs/INVARIANTS.md I19/I23/I24/I25.
 *
 * İKİ adımdan oluşur (bkz. `seed/index.ts` SEED_STEPS sırası):
 *   1) `seedPurchasing` — masterdata'dan hemen sonra, `stock`'tan ÖNCE çalışır (docs/modules/tedarik.md:
 *      "sıralama: purchasing seed stock'tan ÖNCE çalışmalı"). Tüm hammadde/ambalaj için kritik stok
 *      kuralı (`reorder_rules`) ve `stock` seed'inin 6 mal kabulünün karşılığı olan, gerçek `purchase_orders`
 *      + `purchase_order_lines` üretir (status `sent`) — böylece `stock.ts`'teki `createAndReceive`
 *      çağrıları PO/PO satırına bağlanabilir (I24: `receipts.purchase_order_id` asla NULL kalmaz).
 *      Ayrıca kritik stok panosu/onay kuyrusu için 1 `pending_approval` AI taslağı ve 1 otomatik
 *      onaylanıp gönderilmiş sipariş ekler (docs §"Kabul": "beyaz liste dışı hiçbir PO otomatik
 *      gönderilmez" — otomatik olan, `reorder_rules.isAutoOrderWhitelisted=true` bir kuraldan gelir).
 *   2) `seedPurchasingBackfill` — TÜM diğer adımlardan (stock/production/sales/...) SONRA, son adım olarak
 *      çalışır. `packages/core/src/stock/receipts.ts` artık her partnerli/değerli mal kabulü aynı
 *      transaction içinde otomatik faturalar (I23/I25 canlı akışta artık kapalı) — ama bazı modüllerin
 *      kendi seed'leri (ör. `production.ts`: "SEED-URT-TEDARIK" takviyesi) PO'suz (`origin='manual'`)
 *      mal kabul üretebilir. Bu adım, PO'su hâlâ NULL olan her mal kabul için
 *      `createRetroactivePurchaseOrderForReceipt` ile geriye dönük, zaten tam alınmış/faturalanmış bir
 *      PO kurar (I24) — idempotent, `db:reset` sonrası kalıcı kırmızı bırakmaz.
 */

async function auditCreate(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'create', tableName, recordId, summary }, SYSTEM_ACTOR);
}
async function auditPost(tx: DbOrTx, tableName: string, recordId: string, summary: string): Promise<void> {
  await writeAudit(tx, { action: 'post', tableName, recordId, summary }, SYSTEM_ACTOR);
}

async function wh(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(warehouses).where(eq(warehouses.code, code)).limit(1);
  if (!row) throw new Error(`seed:purchasing — depo bulunamadı: ${code}`);
  return row;
}
async function partnerByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(partners).where(eq(partners.code, code)).limit(1);
  if (!row) throw new Error(`seed:purchasing — cari bulunamadı: ${code}`);
  return row;
}
async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:purchasing — ürün bulunamadı (SKU): ${sku}`);
  return row;
}

/* ==================================================================== */
/* 1) Kritik stok kuralları (reorder_rules) — tüm hammadde + ambalaj    */
/* ==================================================================== */

/** SKU → {min, max}: `seed/stock.ts`'teki açılış hedef miktarlarına göre (max = tipik eldeki, min = ~%35'i).
 * Bir kısmı kasıtlı olarak eldeki stoğun ÜZERİNDE min ile "kritik altında" başlar (doc §1: kritik stok
 * panosunun ilk çalıştırmada boş olmaması) — `CRITICAL_FROM_DAY_ONE` seti. */
const REORDER_TARGETS: Array<{ sku: string; typicalQty: number; leadTimeDays?: number; safetyDays?: number }> = [
  { sku: '304030000', typicalQty: 80 }, { sku: '301030000', typicalQty: 60 }, { sku: '306030000', typicalQty: 100 },
  { sku: '306050000', typicalQty: 50 }, { sku: '307010000', typicalQty: 60 }, { sku: '307020000', typicalQty: 700 },
  { sku: '301040000', typicalQty: 65 }, { sku: '303010000', typicalQty: 55 }, { sku: '306020000', typicalQty: 75 },
  { sku: '308040000', typicalQty: 160 }, { sku: '302030000', typicalQty: 125 }, { sku: '306010000', typicalQty: 100 },
  { sku: '301010000', typicalQty: 90 }, { sku: '308010000', typicalQty: 70 }, { sku: '301050000', typicalQty: 55 },
  { sku: '308020000', typicalQty: 50 }, { sku: '301020000', typicalQty: 330 }, { sku: '306040000', typicalQty: 50 },
  { sku: '306060000', typicalQty: 50 }, { sku: '302010000', typicalQty: 50 }, { sku: '304010000', typicalQty: 50 },
  { sku: '308030000', typicalQty: 50 }, { sku: '303020000', typicalQty: 55 }, { sku: '301060000', typicalQty: 375 },
  { sku: '305010000', typicalQty: 50 }, { sku: '304020000', typicalQty: 50 }, { sku: '302020000', typicalQty: 50 },
  { sku: '304050000', typicalQty: 50 }, { sku: '304040000', typicalQty: 50 },
  { sku: '402010000', typicalQty: 1500 }, { sku: '401030000', typicalQty: 5000 }, { sku: '401020000', typicalQty: 3000 },
  { sku: '401010000', typicalQty: 2000 }, { sku: '401040000', typicalQty: 800 }, { sku: '402030000', typicalQty: 2500 },
  { sku: '402020000', typicalQty: 8000 },
];
/** Kritik stok panosunun ilk çalıştırmada boş kalmaması için eldeki stoğun altında min ile başlayan kalemler. */
const CRITICAL_FROM_DAY_ONE = new Set(['304010000', '306050000', '301050000', '308020000']); // Vanilya Aroması, Bromelain, Kaju, Matcha
/** Otomatik sipariş beyaz listesi (kural bazlı) — düşük tutarlı, sık tüketilen ambalaj kalemleri. */
const AUTO_ORDER_WHITELIST: Record<string, number> = {
  '401030000': 20000, // Etiket — ₺20.000'e kadar otomatik
  '401020000': 15000, // Kapak
  '402020000': 12000, // Saşe
};

async function seedReorderRules(tx: DbOrTx, tireId: string, summary: SeedSummary): Promise<void> {
  let count = 0;
  for (const t of REORDER_TARGETS) {
    const product = await productBySku(tx, t.sku);
    const [preferred] = await tx
      .select()
      .from(supplierProducts)
      .where(and(eq(supplierProducts.productId, product.id), eq(supplierProducts.isPreferred, true)))
      .limit(1);

    const critical = CRITICAL_FROM_DAY_ONE.has(t.sku);
    // Kritik-baştan-itibaren kalemler: eldeki (≈ typicalQty, açılış hedefi) min'in altında kalsın diye
    // min yükseltilir — ama max'ı da orantılı yükseltmezsek min > max gibi tutarsız bir kural doğar ve
    // motor "max'a tamamlama" bileşenini hesaplayamaz (fillToMax negatif/sıfır çıkar, suggestedQty
    // yanlışlıkla 0 kalır — tur 6 bulgusu, canlı /satin-alma/kritik-stok denemesinde yakalandı).
    const max = critical ? Math.round(t.typicalQty * 2) : t.typicalQty;
    const min = critical ? Math.round(t.typicalQty * 1.3) : Math.round(t.typicalQty * 0.35);
    const whitelistAmount = AUTO_ORDER_WHITELIST[t.sku];

    await tx
      .insert(reorderRules)
      .values({
        productId: product.id, warehouseId: tireId, minQty: D(min).toFixed(4), maxQty: D(max).toFixed(4),
        leadTimeDays: t.leadTimeDays ?? preferred?.leadTimeDays ?? 14, safetyDays: t.safetyDays ?? 3,
        preferredSupplierId: preferred?.partnerId ?? null,
        isAutoOrderWhitelisted: whitelistAmount !== undefined, autoOrderMaxAmount: whitelistAmount !== undefined ? D(whitelistAmount).toFixed(4) : null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [reorderRules.productId, reorderRules.warehouseId],
        set: {
          minQty: D(min).toFixed(4), maxQty: D(max).toFixed(4), leadTimeDays: t.leadTimeDays ?? preferred?.leadTimeDays ?? 14,
          preferredSupplierId: preferred?.partnerId ?? null, isAutoOrderWhitelisted: whitelistAmount !== undefined,
          autoOrderMaxAmount: whitelistAmount !== undefined ? D(whitelistAmount).toFixed(4) : null,
        },
      });
    count += 1;
  }
  summary.add('reorder_rules', count);
  log('purchasing', `${count} kritik stok kuralı (reorder_rules) oluşturuldu`);
}

/* ==================================================================== */
/* 2) `stock` seed'inin 6 mal kabulüne karşılık gelen, gerçek PO'lar    */
/* ==================================================================== */

type PoLineSeed = { sku: string; qty: number; unitCost: number };
type PoSeed = { supplierCode: string; deliveryNo: string; lines: PoLineSeed[]; expectedDateOffsetDays: number };

/** `seed/stock.ts` R1–R6 mal kabulleriyle BİREBİR eşleşir (aynı tedarikçi/ürün/miktar/maliyet) — o dosya
 * bu siparişlerin satırlarına `purchaseOrderLineId` ile bağlanır.
 * `expectedDateOffsetDays`: `receipts.was_on_time` (tedarikçi kartları "zamanında teslimat %" —
 * `packages/core/src/stock/receipts.ts::receiveGoods`) yalnızca PO'nun `expectedDate`'i doluysa
 * hesaplanır; `stock.ts`'teki `createAndReceive` çağrıları `receivedAt = new Date()` (seed'in
 * ÇALIŞTIĞI an) kullanır — bu yüzden burada bugüne göre (seed çalıştığı ana göre) pozitif/negatif bir
 * ofset veriyoruz (negatif = beklenen tarih geçmişte kaldı → geç; pozitif = henüz gelmedi → zamanında)
 * ki panoda gerçek bir zamanında/geç karışımı görünsün (docs/modules/tedarik.md §4: "tedarikçi kartları
 * kalite skoru, zamanında teslimat %, beyaz liste"). */
const RECEIPT_POS: PoSeed[] = [
  { supplierCode: 'S-000001', deliveryNo: 'İRS-8842', expectedDateOffsetDays: -4, lines: [{ sku: '301010000', qty: 120, unitCost: 210 }] },
  { supplierCode: 'S-000005', deliveryNo: 'İRS-3301', expectedDateOffsetDays: 2, lines: [{ sku: '301030000', qty: 200, unitCost: 315 }, { sku: '301040000', qty: 150, unitCost: 275 }] },
  { supplierCode: 'S-000002', deliveryNo: 'İRS-5567', expectedDateOffsetDays: -2, lines: [{ sku: '302010000', qty: 80, unitCost: 690 }, { sku: '302020000', qty: 60, unitCost: 650 }] },
  { supplierCode: 'S-000003', deliveryNo: 'İRS-9012', expectedDateOffsetDays: 5, lines: [{ sku: '304010000', qty: 40, unitCost: 910 }] },
  { supplierCode: 'S-000004', deliveryNo: 'İRS-1180', expectedDateOffsetDays: 1, lines: [{ sku: '401010000', qty: 1000, unitCost: 22 }, { sku: '401020000', qty: 1000, unitCost: 10 }, { sku: '401030000', qty: 2000, unitCost: 8 }, { sku: '401040000', qty: 300, unitCost: 25 }] },
  { supplierCode: 'S-000006', deliveryNo: 'İRS-6603', expectedDateOffsetDays: -6, lines: [{ sku: '308010000', qty: 100, unitCost: 255 }, { sku: '308020000', qty: 25, unitCost: 810 }] },
];

async function seedOpenPurchaseOrders(tx: DbOrTx, tireId: string, summary: SeedSummary): Promise<void> {
  let count = 0;
  for (const p of RECEIPT_POS) {
    const supplier = await partnerByCode(tx, p.supplierCode);
    const lines = await Promise.all(p.lines.map(async (l) => {
      const product = await productBySku(tx, l.sku);
      return { productId: product.id, qty: D(l.qty), uomId: product.uomId, unitPrice: D(l.unitCost), vatRate: D(product.purchaseVatRate ?? '20') };
    }));
    const { order } = await createPurchaseOrder(tx, {
      partnerId: supplier.id, warehouseId: tireId, paymentTermDays: 30, origin: 'manual',
      expectedDate: new Date(Date.now() + p.expectedDateOffsetDays * 86_400_000),
      note: `Tedarikçi irsaliyesi: ${p.deliveryNo} (bkz. seed/stock.ts mal kabulü)`, lines,
    }, SYSTEM_ACTOR);
    await auditCreate(tx, 'purchase_orders', order.id, `Satın alma siparişi ${order.docNo} oluşturuldu (${supplier.name})`);
    await approvePurchaseOrder(tx, order.id, SYSTEM_ACTOR);
    const sent = await markPurchaseOrderSent(tx, order.id, { sentVia: 'email', sentTo: supplier.email }, SYSTEM_ACTOR);
    await auditPost(tx, 'purchase_orders', order.id, `Satın alma siparişi ${order.docNo}: tedarikçiye gönderildi (${sent.status})`);
    count += 1;
  }
  summary.add('purchase_orders (mal kabul öncesi açık sipariş)', count);
  log('purchasing', `${count} açık satın alma siparişi (stock seed'i tarafından mal kabulle tamamlanacak) oluşturuldu`);
}

/** Kritik stok panosu/onay kuyrusu demoları: 1 AI taslağı onay bekliyor, 1 otomatik onaylanıp gönderilmiş. */
async function seedDemoDrafts(tx: DbOrTx, tireId: string, summary: SeedSummary): Promise<void> {
  // AI taslağı — beyaz listede olmayan kural (Vanilya Aroması, S-000003) → onay bekliyor.
  const aromatik = await partnerByCode(tx, 'S-000003');
  const vanilya = await productBySku(tx, '304010000');
  const { order: draftOrder } = await createPurchaseOrder(tx, {
    partnerId: aromatik.id, warehouseId: tireId, isAiGenerated: true, status: 'pending_approval',
    aiRationale: 'Vanilya Aroması kapsama süresi lead time (20 gün) altında — kritik stok motoru önerisi',
    aiConfidence: D('0.82'),
    lines: [{ productId: vanilya.id, qty: D(30), uomId: vanilya.uomId, unitPrice: D(910), vatRate: D(vanilya.purchaseVatRate ?? '20') }],
  }, SYSTEM_ACTOR);
  await auditCreate(tx, 'purchase_orders', draftOrder.id, `AI taslağı ${draftOrder.docNo} oluşturuldu (onay bekliyor)`);
  const [approvalRow] = await tx
    .insert(approvals)
    .values({
      kind: 'purchase_draft', refTable: 'purchase_orders', refId: draftOrder.id, title: `Satın alma taslağı ${draftOrder.docNo}`,
      // Tur 3 P1 bulgu (onaylar-13/onaylar-15): tutar özet cümlesine gömülmez — onay kuyruğu
      // (dispatch.ts) `purchase_orders.grandTotal`'i kendi yapısal `amount` alanında gösterir.
      summary: `${aromatik.name} — AI: kritik stok motoru`, confidence: '0.82',
      status: 'pending', requestedBy: null,
    })
    .returning();
  await auditCreate(tx, 'approvals', approvalRow!.id, `Onay kaydı: satın alma taslağı ${draftOrder.docNo}`);

  // Otomatik onaylanıp gönderilmiş — beyaz listedeki ambalaj kalemi (Etiket, S-000004), tutar sınırı altında.
  const ege = await partnerByCode(tx, 'S-000004');
  const etiket = await productBySku(tx, '401030000');
  const { order: autoOrder } = await createPurchaseOrder(tx, {
    partnerId: ege.id, warehouseId: tireId, isAiGenerated: true,
    aiRationale: 'Etiket kapsama süresi lead+güvenlik altında; beyaz liste + tutar sınırı içinde → otomatik onay/gönderim',
    aiConfidence: D('0.91'), status: 'ai_draft',
    lines: [{ productId: etiket.id, qty: D(1500), uomId: etiket.uomId, unitPrice: D(8), vatRate: D(etiket.purchaseVatRate ?? '20') }],
  }, SYSTEM_ACTOR);
  const autoApproved = await approvePurchaseOrder(tx, autoOrder.id, SYSTEM_ACTOR);
  await tx.update(purchaseOrders).set({ isAutoApproved: true }).where(eq(purchaseOrders.id, autoApproved.id));
  const autoSent = await markPurchaseOrderSent(tx, autoOrder.id, { sentVia: 'email', sentTo: ege.email, isAutoApproved: true }, SYSTEM_ACTOR);
  await auditPost(tx, 'purchase_orders', autoOrder.id, `Satın alma siparişi ${autoOrder.docNo}: beyaz liste + tutar sınırı içinde otomatik onaylanıp gönderildi (${autoSent.status})`);

  summary.add('purchase_orders (AI taslak/otomatik demo)', 2);
  log('purchasing', '1 AI taslağı (onay bekliyor) + 1 otomatik onaylanıp gönderilmiş sipariş oluşturuldu');
}

export async function seedPurchasing(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const tire = await wh(tx, 'TIRE');
  await seedReorderRules(tx, tire.id, summary);
  await seedOpenPurchaseOrders(tx, tire.id, summary);
  await seedDemoDrafts(tx, tire.id, summary);
}

/* ==================================================================== */
/* 3) Geriye dönük yama (SEED_STEPS'in EN SONUNDA çalışır) — I24        */
/* ==================================================================== */

/**
 * `stock`/`production`/`sales` (ve ileride `quality`/`bank`/...) seed'leri arasında PO'suz kalan
 * (`origin='manual'`, `purchase_order_id IS NULL`) her mal kabul için geriye dönük bir PO kurar.
 * Idempotent: zaten `purchase_order_id` dolu kabuller atlanır (`createRetroactivePurchaseOrderForReceipt`
 * de aynı korumayı taşır, burada baştan filtrelemek gereksiz iş yapmayı önler).
 */
export async function seedPurchasingBackfill(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const rows = await tx
    .select({ id: receipts.id, docNo: receipts.docNo })
    .from(receipts)
    .where(and(sql`${receipts.status} NOT IN ('draft', 'cancelled')`, sql`${receipts.purchaseOrderId} IS NULL`))
    .orderBy(receipts.docNo);

  let count = 0;
  for (const r of rows) {
    const po = await createRetroactivePurchaseOrderForReceipt(tx, r.id, SYSTEM_ACTOR);
    await auditCreate(tx, 'purchase_orders', po.id, `Geriye dönük sipariş ${po.docNo} — PO'suz mal kabul ${r.docNo} için oluşturuldu (I24)`);
    count += 1;
  }

  // Bilgi amaçlı: hâlâ faturasız kalan mal kabul var mı (I23 kalıcı doğrulama izi — normalde 0 olmalı).
  const stillUnbilled = await tx
    .select({ id: receipts.id })
    .from(receipts)
    .where(sql`${receipts.status} <> 'draft' AND ${receipts.status} <> 'cancelled' AND NOT EXISTS (
      SELECT 1 FROM ${invoices} i WHERE i.kind = 'purchase' AND i.receipt_id = ${receipts.id} AND i.status <> 'cancelled'
    )`);

  summary.add('purchase_orders (geriye dönük — I24 yaması)', count);
  log('purchasing', `${count} PO'suz mal kabul geriye dönük siparişe bağlandı (${stillUnbilled.length} faturasız kabul kaldı — beklenen: 0)`);
}
