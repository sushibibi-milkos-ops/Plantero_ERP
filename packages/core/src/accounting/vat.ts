import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { invoices, invoiceLines, vatPeriods, type DbOrTx } from '@plantero/db';
import { D, ZERO, max, round4, sum, toDb, isZero4 } from '../money.js';
import { ValidationError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { postJournalEntry } from './journal.js';
import { ensureCoreAccounts } from './mapping.js';
import type { ActorCtx } from '../types.js';

/**
 * Aylık KDV kapanışı (CLAUDE.md kural 8, ARCHITECTURE.md §7 "KDV dönem kapanışı" satırı,
 * checks/21_vat_carryforward.sql). `vat_periods` tablosunu dolduran TEK servis budur.
 *
 * ÖNEMLİ tasarım notu (bilerek): checks/12_vat.sql (I12) 391/191 hesaplarının o dönemin
 * fatura KDV'siyle TAM eşit olmasını (dönem bazlı akış, ham hesap kodu) ister — hesaplar hiçbir
 * zaman başka bir kayıtla "kapatılmaz". Bu yüzden kapanış fişi ham `391`/`191` hesaplarına
 * DOKUNMAZ; onun yerine ayrı bir mahsup alt hesabı (`391.99`) kullanılır — I12 tam eşleşme
 * (`=`) aradığı için alt hesabı görmez, dolayısıyla bozulmaz. `190`/`360` ise checks/21'in
 * beklediği gibi doğrudan bu dönemin tarihiyle, ham kodla işlenir.
 *
 * Standart KDV mahsup formülü (checks/21_vat_carryforward.sql, Tur 4'te düzeltildi — bkz. o
 * dosyanın başındaki not; `packages/db/src/checks/*.sql` veri-critic'in kendi yazma alanıdır,
 * şema gibi dondurulmuş DEĞİLDİR):
 *   net = carriedFromPrev + inputVat − outputVat
 *   net ≥ 0 ⇒ indirilecek+devreden hesaplananı karşılıyor/aşıyor ⇒ ödenecek KDV yok,
 *             fark bir sonraki aya DEVREDEN KDV alacağı (190, borç) olarak taşınır
 *   net < 0 ⇒ hesaplanan KDV indirilecek+devreden'i aşıyor ⇒ aradaki fark vergi dairesine
 *             ÖDENECEK KDV'dir (360, alacak)
 *   ⇒ payable = max(−net, 0); carriedToNext = max(net, 0)
 * (Önceki bir tur bunun tersini uygulamıştı — net pozitifken, yani işletme net KDV alacaklısıyken
 * bunu 360'a "ödenecek KDV" olarak yazıyor, gerçek 190 devreden alacağını hiç kaydetmiyordu;
 * bkz. Tur 4 P0 düzeltmesi.)
 */

export type VatCloseResult = {
  period: string;
  outputVat: Decimal;
  inputVat: Decimal;
  carriedFromPrev: Decimal;
  payable: Decimal;
  carriedToNext: Decimal;
  journalEntryId?: string;
  skipped?: boolean;
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assertPeriod(period: string): void {
  if (!PERIOD_RE.test(period)) throw new ValidationError('Geçersiz dönem biçimi (YYYY-MM bekleniyor)', { period });
}

/** `YYYY-MM` → bir önceki ay `YYYY-MM` */
export function previousPeriod(period: string): string {
  assertPeriod(period);
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM` → o ayın ilk günü / bir sonraki ayın ilk günü (yarı açık aralık [start, endExclusive)) */
function periodBounds(period: string): { start: string; endExclusive: string; lastDay: string } {
  const [y, m] = period.split('-').map(Number);
  const start = `${period}-01`;
  const endExclusive = `${new Date(Date.UTC(y!, m!, 1)).toISOString().slice(0, 10)}`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return { start, endExclusive, lastDay };
}

/** Bir dönemin (fatura tarihine göre) toplam satış/alış KDV'si — checks/12_vat.sql ile birebir aynı filtre. */
async function periodInvoiceVat(tx: DbOrTx, kind: 'sales' | 'purchase', start: string, endExclusive: string): Promise<Decimal> {
  const rows = await tx
    .select({ vat: invoiceLines.lineVat })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(
      eq(invoices.kind, kind),
      inArray(invoices.status, ['posted', 'partially_paid', 'paid']),
      gte(invoices.invoiceDate, start),
      lt(invoices.invoiceDate, endExclusive),
    ));
  return round4(sum(rows.map((r) => D(r.vat))));
}

/**
 * Bir dönemi kapatır: `vat_periods` satırını hesaplar/yazar ve 190/360 (+391.99 mahsup) fişini atar.
 * İdempotent: dönem zaten `declared`/`paid` ise (veya `journalEntryId` doluysa) yeniden fiş atmaz,
 * yalnızca güncel hesaplanan değerleri döner (`skipped: true`).
 */
export async function closeVatPeriod(tx: DbOrTx, period: string, ctx: ActorCtx): Promise<VatCloseResult> {
  assertPeriod(period);
  const { start, endExclusive, lastDay } = periodBounds(period);

  const [existing] = await tx.select().from(vatPeriods).where(eq(vatPeriods.period, period)).limit(1);
  if (existing && existing.journalEntryId) {
    return {
      period, outputVat: D(existing.outputVat), inputVat: D(existing.inputVat), carriedFromPrev: D(existing.carriedFromPrev),
      payable: D(existing.payable), carriedToNext: D(existing.carriedToNext), journalEntryId: existing.journalEntryId, skipped: true,
    };
  }

  const outputVat = await periodInvoiceVat(tx, 'sales', start, endExclusive);
  const inputVat = await periodInvoiceVat(tx, 'purchase', start, endExclusive);

  const [prev] = await tx.select({ carriedToNext: vatPeriods.carriedToNext }).from(vatPeriods).where(eq(vatPeriods.period, previousPeriod(period))).limit(1);
  const carriedFromPrev = prev ? D(prev.carriedToNext) : ZERO;

  // checks/21_vat_carryforward.sql formülü — birebir (bkz. dosya başı not)
  const net = carriedFromPrev.plus(inputVat).minus(outputVat);
  const payable = max(net.neg(), ZERO);
  const carriedToNext = max(net, ZERO);

  await ensureCoreAccounts(tx);

  let journalEntryId: string | undefined;
  const lines: Array<{ accountCode: string; debit: Decimal; credit: Decimal; description: string }> = [];
  let debitTotal = ZERO;
  let creditTotal = ZERO;
  if (!isZero4(carriedToNext)) {
    lines.push({ accountCode: '190', debit: carriedToNext, credit: ZERO, description: `${period} devreden KDV` });
    debitTotal = debitTotal.plus(carriedToNext);
  }
  if (!isZero4(payable)) {
    lines.push({ accountCode: '360', debit: ZERO, credit: payable, description: `${period} ödenecek KDV` });
    creditTotal = creditTotal.plus(payable);
  }
  const plug = creditTotal.minus(debitTotal);
  if (!isZero4(plug)) {
    const memo = `${period} KDV kapanış mahsubu (hesaplanan ${toDb(outputVat)} / indirilecek ${toDb(inputVat)})`;
    if (plug.gt(0)) lines.push({ accountCode: '391.99', debit: plug, credit: ZERO, description: memo });
    else lines.push({ accountCode: '391.99', debit: ZERO, credit: plug.neg(), description: memo });
  }

  if (lines.length) {
    const entryDate = new Date(`${lastDay}T12:00:00Z`);
    const res = await postJournalEntry(tx, {
      ledger: 'both',
      journalCode: 'GEN',
      entryDate,
      description: `${period} KDV dönem kapanışı`,
      refType: 'vat_period',
      refNo: period,
      origin: 'system',
      lines: lines.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit, description: l.description })),
    }, ctx);
    journalEntryId = res.vukId;
  }

  await tx
    .insert(vatPeriods)
    .values({
      period, outputVat: toDb(outputVat), inputVat: toDb(inputVat), carriedFromPrev: toDb(carriedFromPrev),
      payable: toDb(payable), carriedToNext: toDb(carriedToNext), status: 'declared', journalEntryId: journalEntryId ?? null,
    })
    .onConflictDoUpdate({
      target: vatPeriods.period,
      set: {
        outputVat: toDb(outputVat), inputVat: toDb(inputVat), carriedFromPrev: toDb(carriedFromPrev),
        payable: toDb(payable), carriedToNext: toDb(carriedToNext), status: 'declared', journalEntryId: journalEntryId ?? null,
        computedAt: new Date(),
      },
    });

  await writeAudit(tx, {
    action: 'post',
    tableName: 'vat_periods',
    recordId: period,
    summary: `${period} KDV dönemi kapatıldı: hesaplanan ${toDb(outputVat)}, indirilecek ${toDb(inputVat)}, devreden ${toDb(carriedToNext)}, ödenecek ${toDb(payable)}`,
    after: { period, outputVat: toDb(outputVat), inputVat: toDb(inputVat), carriedFromPrev: toDb(carriedFromPrev), payable: toDb(payable), carriedToNext: toDb(carriedToNext) },
  }, ctx);

  return { period, outputVat, inputVat, carriedFromPrev, payable, carriedToNext, journalEntryId };
}

/** Bugünün (Europe/Istanbul kabaca) bir önceki takvim ayı — worker job'unun kapattığı varsayılan dönem */
export function currentClosablePeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12, bir önceki ay
  const d = new Date(Date.UTC(y, m - 1 - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
