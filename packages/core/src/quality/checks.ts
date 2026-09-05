import { and, eq, gt } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import {
  qcChecks, qcCheckResults, qcTemplateItems, stockLots, stockQuants, products, receipts, documentIndex, type DbOrTx,
} from '@plantero/db';
import { D, toDb } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { postStockMove } from '../stock/ledger.js';
import { indexDocument, linkDocuments } from '../documents/chain.js';
import type { ActorCtx } from '../types.js';

/**
 * Girdi/ara/final kalite kontrolü — TEK yazma noktası (docs/modules/kalite.md §Core `quality/checks.ts`).
 * Mal kabulde QC gerektiren ürünler için bekleyen kayıt zaten `stock/receipts.ts` (`receiveGoods`)
 * tarafından otomatik açılır — `createIncomingCheck` burada MANUEL/ek kontrol açmak için kullanılır
 * (ör. ara/final kontrol, ya da bir lotun ikinci kez örneklenmesi). Karar (serbest/red/kısmi) HER
 * ZAMAN `decide()` üzerinden, karantina→serbest/red hareketini `postStockMove` ile yapar — depo
 * modülünün `/depo/lotlar` ekranındaki `releaseLotAction`/`rejectLotAction` ile AYNI stok kuralına
 * (ledger.ts `enforceLotRules`) tabidir; iki giriş noktası aynı temel işlemi yapar, çakışma yoktur
 * (biri diğerinin işini yapmışsa `postStockMove` "yetersiz stok" ile reddeder).
 */

export type CreateIncomingCheckInput = {
  productId: string;
  lotId: string;
  receiptId?: string | null;
  receiptLineId?: string | null;
  workOrderId?: string | null;
  supplierId?: string | null;
  templateId?: string | null;
  kind?: 'incoming' | 'in_process' | 'final';
  sampledQty?: Decimal | null;
  note?: string | null;
};

export async function createIncomingCheck(tx: DbOrTx, input: CreateIncomingCheckInput, ctx: ActorCtx): Promise<typeof qcChecks.$inferSelect> {
  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, input.lotId)).limit(1);
  if (!lot) throw new NotFoundError('Lot', input.lotId);
  if (lot.productId !== input.productId) throw new ValidationError('Lot bu ürüne ait değil', { lotId: lot.id, productId: input.productId });

  const docNo = await nextDocNo(tx, 'QC');
  const [row] = await tx
    .insert(qcChecks)
    .values({
      docNo,
      kind: input.kind ?? 'incoming',
      templateId: input.templateId ?? null,
      productId: input.productId,
      lotId: input.lotId,
      receiptId: input.receiptId ?? null,
      receiptLineId: input.receiptLineId ?? null,
      workOrderId: input.workOrderId ?? null,
      supplierId: input.supplierId ?? lot.supplierId ?? null,
      result: 'pending',
      sampledQty: input.sampledQty ? toDb(input.sampledQty) : null,
      note: input.note ?? null,
    })
    .returning();
  if (!row) throw new ValidationError('Kalite kontrolü oluşturulamadı');

  await indexAndLinkCheck(tx, row, ctx);
  await writeAudit(tx, { action: 'create', tableName: 'qc_checks', recordId: row.id, summary: `Kalite kontrolü ${docNo} açıldı (${row.kind}, bekliyor)`, after: row }, ctx);
  return row;
}

/**
 * Belge zinciri (sözleşme #5): mal kabulde `receiveGoods` (depo modülü, `stock/receipts.ts`) otomatik
 * açtığı `qc_checks` kayıtları için `indexDocument`/`linkDocuments`i ÇAĞIRMAZ (o dosya benim yazma
 * kapsamımın dışında — raporda "ortak/başka modül düzeltmesi" olarak belirtildi). Burada, bu modülün
 * KENDİ yazdığı her fonksiyonda (oluşturma VE karar) geriye dönük olarak indeks/bağlantı garanti
 * edilir — `onConflictDoUpdate` (indexDocument) sayesinde tekrar çağrı zararsızdır.
 */
async function indexAndLinkCheck(tx: DbOrTx, check: typeof qcChecks.$inferSelect, ctx: ActorCtx): Promise<void> {
  await indexDocument(tx, {
    type: 'quality_check', recordId: check.id, docNo: check.docNo, status: check.result, origin: 'chain',
    title: `Kalite Kontrolü ${check.docNo}`, docDate: check.checkedAt ?? new Date(),
  });
  if (check.receiptId) {
    await linkDocuments(tx, { sourceType: 'receipt', sourceId: check.receiptId, targetType: 'quality_check', targetId: check.id }, ctx);
  }
}

export type QcResultInput = {
  templateItemId?: string | null;
  name: string;
  kind?: 'numeric' | 'boolean' | 'text' | 'document';
  valueNumeric?: Decimal | string | null;
  valueBool?: boolean | null;
  valueText?: string | null;
  sequence?: number;
};

function evaluatePass(item: QcResultInput, templateItem: typeof qcTemplateItems.$inferSelect | undefined): boolean | null {
  const kind = item.kind ?? templateItem?.kind ?? 'text';
  if (kind === 'numeric') {
    if (item.valueNumeric === null || item.valueNumeric === undefined || item.valueNumeric === '') return null;
    const v = D(item.valueNumeric);
    const min = templateItem?.minValue !== null && templateItem?.minValue !== undefined ? D(templateItem.minValue) : null;
    const max = templateItem?.maxValue !== null && templateItem?.maxValue !== undefined ? D(templateItem.maxValue) : null;
    if (min && v.lt(min)) return false;
    if (max && v.gt(max)) return false;
    return true;
  }
  if (kind === 'boolean') {
    if (item.valueBool === null || item.valueBool === undefined) return null;
    return item.valueBool === true;
  }
  // text / document: kayıt girildiyse (boş değilse) uygun kabul edilir — belge/metin varlığı kontrolü
  if (item.valueText === null || item.valueText === undefined || item.valueText.trim() === '') return null;
  return true;
}

export type RecordResultsResult = { check: typeof qcChecks.$inferSelect; results: Array<typeof qcCheckResults.$inferSelect>; allPassed: boolean; anyCritical: boolean };

/**
 * Sonuç girişi (mobil uyumlu ekran bu fonksiyonu bir kerede tüm kalemlerle çağırır — önceki
 * sonuçlar silinip yeniden yazılır, idempotent). Kalemin `isPassed`'i şablon min/max'ına (numeric),
 * `true` beklentisine (boolean) ya da doluluk kontrolüne (text/document) göre HESAPLANIR — kullanıcı
 * elle "geçti/kaldı" işaretlemez, ölçülen değerden türetilir (docs kabul: nesnel kayıt).
 */
export async function recordResults(tx: DbOrTx, checkId: string, items: QcResultInput[], ctx: ActorCtx, opts: { sampledQty?: Decimal | string | null } = {}): Promise<RecordResultsResult> {
  const [check] = await tx.select().from(qcChecks).where(eq(qcChecks.id, checkId)).for('update');
  if (!check) throw new NotFoundError('Kalite kontrolü', checkId);
  if (check.result !== 'pending') throw new DomainError('QC_ALREADY_DECIDED', `${check.docNo} zaten karara bağlanmış (${check.result})`, { checkId });
  if (!items.length) throw new ValidationError('En az bir sonuç kalemi girilmeli');

  const templateItems = check.templateId ? await tx.select().from(qcTemplateItems).where(eq(qcTemplateItems.templateId, check.templateId)) : [];
  const templateItemById = new Map(templateItems.map((t) => [t.id, t]));

  await tx.delete(qcCheckResults).where(eq(qcCheckResults.checkId, checkId));

  const rows: Array<typeof qcCheckResults.$inferSelect> = [];
  let seq = 10;
  let allPassed = true;
  let anyCritical = false;
  for (const item of items) {
    const ti = item.templateItemId ? templateItemById.get(item.templateItemId) : undefined;
    const isPassed = evaluatePass(item, ti);
    if (isPassed !== true) allPassed = false;
    if (isPassed === false && ti?.isCritical) anyCritical = true;
    const [row] = await tx
      .insert(qcCheckResults)
      .values({
        checkId,
        templateItemId: item.templateItemId ?? null,
        name: item.name,
        valueNumeric: item.valueNumeric !== undefined && item.valueNumeric !== null ? toDb(D(item.valueNumeric)) : null,
        valueBool: item.valueBool ?? null,
        valueText: item.valueText ?? null,
        isPassed,
        sequence: item.sequence ?? seq,
      })
      .returning();
    if (row) rows.push(row);
    seq += 10;
  }

  const sampledQty = opts.sampledQty !== undefined && opts.sampledQty !== null ? toDb(D(opts.sampledQty)) : check.sampledQty;
  await tx.update(qcChecks).set({ sampledQty, updatedBy: ctx.userId ?? null }).where(eq(qcChecks.id, checkId));

  await writeAudit(tx, {
    action: 'update', tableName: 'qc_checks', recordId: checkId,
    summary: `${check.docNo}: ${rows.length} sonuç kalemi girildi (${allPassed ? 'tümü uygun' : 'uygunsuzluk var'}${anyCritical ? ', kritik' : ''})`,
    after: { allPassed, anyCritical, results: rows.map((r) => ({ name: r.name, isPassed: r.isPassed })) },
  }, ctx);

  const [updatedCheck] = await tx.select().from(qcChecks).where(eq(qcChecks.id, checkId)).limit(1);
  return { check: updatedCheck!, results: rows, allPassed, anyCritical };
}

export type DecideInput = {
  /**
   * Ledger'ın (`stock/ledger.ts` `enforceLotRules`) kendisi bir lotun YALNIZCA BİR kez karantina→
   * serbest YA DA karantina→red hareketi yapabileceğini zorlar (her iki hareket de `lot.status ===
   * 'quarantine'` şartı arar; ilki lotu bu durumdan çıkarır, ikincisi artık reddedilir — canlı
   * testte doğrulandı, bkz. checks.test.ts). Bu yüzden TEK bir fiziksel lot, aynı QC kararında hem
   * "kısmen serbest" hem "kısmen red" olamaz — böyle bir bölünme yalnızca MAL KABUL satırında
   * (`stock/receipts.ts`, `disposition`+`rejectedQty`) baştan iki ayrı lot olarak açılabilir; o zaman
   * her lot kendi bağımsız `qc_checks` kaydını alır ve burada ayrı ayrı karara bağlanır. `decide()`
   * bu yüzden kasıtlı olarak yalnızca TAM karar sunar — depo modülünün `/depo/lotlar` ekranındaki
   * `releaseLotAction`/`rejectLotAction` ile AYNI kural (şema/ledger kısıtı, raporda belirtildi).
   */
  decision: 'released' | 'rejected';
  /** decision='released' hedefi (fiziksel hammadde/ambalaj lokasyonu) */
  releaseToLocationId?: string | null;
  /** decision='rejected' hedefi (TIRE/RED vb.) */
  rejectToLocationId?: string | null;
  note?: string | null;
  /**
   * Reddedilen miktar tedarikçiye iade edilsin mi? Yalnızca NİYETİ `decisionNote`'a işler — bir
   * `return_out` stok/muhasebe hareketi ÜRETMEZ (bkz. aşağıdaki `rejectMove` içindeki not: bu kod
   * tabanında her mal kabul anında otomatik faturalandığından `return_out`un 320.999 eşlemesi karar
   * anında artık geçerli değil; gerçek iade faturası satın alma modülünün ayrı bir servisini gerektirir).
   */
  returnToSupplier?: boolean;
};

export type DecideResult = { check: typeof qcChecks.$inferSelect; lot: typeof stockLots.$inferSelect; moveIds: string[] };

/**
 * Kalite kararı — lotun karantina→serbest/red hareketini `postStockMove` ile üretir ve `qc_checks`
 * kaydını kapatır. Lotun eldeki fiziksel miktarı `stock_quants`tan okunur (tek satır beklenir —
 * kalite kararı verilecek bir lot normalde tek bir karantina lokasyonunda durur).
 */
export async function decide(tx: DbOrTx, checkId: string, input: DecideInput, ctx: ActorCtx): Promise<DecideResult> {
  const [check] = await tx.select().from(qcChecks).where(eq(qcChecks.id, checkId)).for('update');
  if (!check) throw new NotFoundError('Kalite kontrolü', checkId);
  if (check.result !== 'pending') throw new DomainError('QC_ALREADY_DECIDED', `${check.docNo} zaten karara bağlanmış (${check.result})`, { checkId });
  if (!check.lotId) throw new DomainError('QC_NO_LOT', `${check.docNo} bir lota bağlı değil — karar verilemez`, { checkId });

  const [lot] = await tx.select().from(stockLots).where(eq(stockLots.id, check.lotId)).for('update');
  if (!lot) throw new NotFoundError('Lot', check.lotId);
  const [product] = await tx.select().from(products).where(eq(products.id, lot.productId)).limit(1);
  if (!product) throw new NotFoundError('Ürün', lot.productId);

  const quants = await tx.select().from(stockQuants).where(and(eq(stockQuants.lotId, lot.id), gt(stockQuants.qty, '0')));
  if (!quants.length) throw new DomainError('QC_NO_STOCK', `${lot.lotNo} lotunun eldeki stoğu yok — karar verilemez`, { lotId: lot.id });
  if (quants.length > 1) throw new DomainError('QC_MULTI_LOCATION', `${lot.lotNo} lotu birden fazla lokasyonda — önce tek lokasyona konsolide edin (transfer)`, { lotId: lot.id });
  const quant = quants[0]!;
  const totalQty = D(quant.qty);
  const movedAt = new Date();
  const moveIds: string[] = [];

  async function releaseMove(qty: Decimal, toLocationId: string) {
    if (!toLocationId) throw new ValidationError('Serbest bırakma lokasyonu seçin');
    const res = await postStockMove(tx, {
      kind: 'quarantine_release', productId: product!.id, lotId: lot!.id, fromLocationId: quant!.locationId, toLocationId,
      qty, uomId: lot!.uomId, refType: 'quality_check', refId: checkId, refNo: check!.docNo, origin: 'manual', movedAt, note: input.note ?? null,
    }, ctx);
    moveIds.push(res.moveId);
  }
  async function rejectMove(qty: Decimal, toLocationId: string) {
    if (!toLocationId) throw new ValidationError('Red lokasyonu seçin');
    const res = await postStockMove(tx, {
      kind: 'quarantine_reject', productId: product!.id, lotId: lot!.id, fromLocationId: quant!.locationId, toLocationId,
      qty, uomId: lot!.uomId, refType: 'quality_check', refId: checkId, refNo: check!.docNo, origin: 'manual', movedAt, note: input.note ?? null,
    }, ctx);
    moveIds.push(res.moveId);
    // `returnToSupplier` KASITLI OLARAK bir `return_out` stok hareketi ÜRETMEZ (canlı ölçümle
    // bulunan I25 kök nedeni): `return_out`un muhasebe eşlemesi (`accounting/mapping.ts`, dondurulmuş/
    // benim değiştiremediğim bir dosya) 320.999 "Faturası gelmemiş alımlar" hesabını temizlemek
    // üzere tasarlanmış — ama bu kod tabanında HER mal kabul, kabul anında otomatik faturalanıyor
    // (`stock/receipts.ts` `receiveGoods`, I23/I25 tasarımı — `createPurchaseInvoiceFromReceipt`
    // reddedilen lotu da içeren TÜM kabulü hemen 320.<tedarikçi>ye devrediyor). Karar aşamasında
    // (mal kabulden GÜNLER sonra olabilir) 320.999 zaten sıfırlanmış durumdayken bir `return_out`
    // ona tekrar dokunup dengesini bozuyor — `pnpm db:check` I25'i CANLI olarak kırdı (kanıtlandı,
    // rapora yazıldı). Doğru düzeltme gerçek bir tedarikçi iade/kredi notu faturası (320.cari karşı)
    // ama böyle bir core servis (satın alma/muhasebe) bugün yok — bu yüzden `returnToSupplier`
    // yalnızca NİYETİ karar notuna işler; gerçek iade fatura akışı satın alma modülüne bırakılır.
  }

  if (input.decision === 'released') {
    await releaseMove(totalQty, input.releaseToLocationId ?? '');
  } else {
    await rejectMove(totalQty, input.rejectToLocationId ?? '');
  }

  const result: (typeof qcChecks.$inferSelect)['result'] = input.decision === 'released' ? 'passed' : 'failed';
  const [updatedCheck] = await tx
    .update(qcChecks)
    .set({
      result, disposition: input.decision,
      decisionNote: input.decision === 'rejected' && input.returnToSupplier
        ? `${input.note ? `${input.note} — ` : ''}Tedarikçiye iade talep edildi (satın alma/muhasebe modülünde iade faturası kesilmeli)`
        : (input.note ?? null),
      checkedAt: movedAt, inspectorId: ctx.userId, updatedBy: ctx.userId ?? null,
    })
    .where(eq(qcChecks.id, checkId))
    .returning();

  const [updatedLot] = await tx.select().from(stockLots).where(eq(stockLots.id, lot.id)).limit(1);
  await indexAndLinkCheck(tx, updatedCheck!, ctx);

  /**
   * Mal kabul kapanışı (P0 düzeltmesi — canlı doğrulama: Kaju/Anadolu Kuruyemiş S-000005, reddedilen
   * QC kararı `supplier_scores.qc_checks`e HİÇ yansımıyordu): `stock/receipts.ts` `receiveGoods()`
   * QC gerektiren bir satır karantinaya girdiğinde `receipts.status`'u 'qc_pending' bırakır ve bunu
   * BİR DAHA GÜNCELLEMEZ — `computeSupplierScore.ts` yalnızca `status='done'` mal kabullerini saydığı
   * için, QC kararı verilse BİLE (serbest ya da red, fark etmez) o mal kabul tedarikçi kalite skoruna
   * asla girmiyordu. Burası bu zincirin TEK kapanış noktasıdır: kararla (`decide`) bağlı olduğu mal
   * kabulün BAŞKA bekleyen (`pending`) qc_checks kaydı kalmadıysa, mal kabul 'done'a taşınır — tıpkı
   * PO'nun tüm satırları alındığında 'received' olması gibi, burada "tüm QC kalemleri karara bağlandı"
   * mal kabulün tamamlandığı anlamına gelir. `qc_pending` DIŞINDA bir durumdaysa (ör. zaten `done`,
   * ya da mal kabul iptal edilmiş) dokunulmaz — idempotent ve güvenli.
   */
  if (check.receiptId) {
    const stillPending = await tx.select({ id: qcChecks.id }).from(qcChecks).where(and(eq(qcChecks.receiptId, check.receiptId), eq(qcChecks.result, 'pending')));
    if (stillPending.length === 0) {
      const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, check.receiptId)).limit(1);
      if (receipt && receipt.status === 'qc_pending') {
        await tx.update(receipts).set({ status: 'done', updatedBy: ctx.userId ?? null }).where(eq(receipts.id, receipt.id));
        // Belge dizini (`document_index`, belge zinciri kartlarının okuduğu denormalize anlık görüntü)
        // burada da güncellenmezse "Belge zinciri" kartı ("Kalite bekliyor" rozeti) mal kabul GERÇEKTE
        // 'done' olduktan SONRA da eskisini göstermeye devam eder — canlı ekran ölçümüyle yakalandı.
        // `receipts.ts` `receiveGoods()`'un aynı belgeyi ilk indekslediği satırla AYNI alan kümesi
        // (`onConflictDoUpdate` TÜM alanları `set` eder — yalnızca `status` göndermek docNo/partnerId/
        // tutarı null'a düşürür), mevcut satırdan okunup yalnızca durum değiştirilerek yeniden yazılır.
        const [existingDoc] = await tx.select().from(documentIndex).where(and(eq(documentIndex.type, 'receipt'), eq(documentIndex.recordId, receipt.id))).limit(1);
        await indexDocument(tx, {
          type: 'receipt', recordId: receipt.id, docNo: receipt.docNo, partnerId: receipt.partnerId, status: 'done',
          origin: receipt.origin, title: existingDoc?.title ?? `Mal Kabul ${receipt.docNo}`, amount: existingDoc?.amount ?? null, docDate: existingDoc?.docDate ?? receipt.receivedAt ?? new Date(),
        });
        await writeAudit(tx, {
          action: 'update', tableName: 'receipts', recordId: receipt.id,
          summary: `Mal kabul ${receipt.docNo}: bekleyen kalite kontrolü kalmadı — durum 'done'a geçti (${check.docNo} kararıyla)`,
        }, ctx);
      }
    }
  }

  await writeAudit(tx, {
    action: input.decision === 'released' ? 'approve' : 'reject', tableName: 'qc_checks', recordId: checkId,
    summary: `${check.docNo}: karar verildi — ${input.decision === 'released' ? 'serbest bırakıldı' : 'reddedildi'} (lot ${lot.lotNo})`,
    after: { decision: input.decision, moveIds },
  }, ctx);

  return { check: updatedCheck!, lot: updatedLot!, moveIds };
}

export async function listPendingChecksCount(tx: DbOrTx): Promise<number> {
  const rows = await tx.select({ id: qcChecks.id }).from(qcChecks).where(eq(qcChecks.result, 'pending'));
  return rows.length;
}
