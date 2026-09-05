import { describe, it, expect } from 'vitest';
import { fiscalPeriods, invoices, invoiceLines, journalLines, vatPeriods, type Tx } from '@plantero/db';
import { closeVatPeriod, previousPeriod } from './vat.js';
import { withRollback, seedBase, ctx, balanceProbe, eq, type Base } from '../__tests__/helpers.js';

/** İki ardışık ay için açık mali dönem satırı ekler (seedBase yalnızca "bugünün ayı"nı açar) */
async function openFiscalPeriod(tx: Tx, year: number, month: number) {
  const code = `${year}-${String(month).padStart(2, '0')}`;
  const start = `${code}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  await tx.insert(fiscalPeriods).values({ code, year, month, startDate: start, endDate: end }).onConflictDoNothing({ target: fiscalPeriods.code });
}

async function makeInvoice(tx: Tx, b: Base, kind: 'sales' | 'purchase', lineVat: string, invoiceDate: string, seq: number) {
  const partnerId = kind === 'sales' ? b.customer.id : b.supplier.id;
  const [inv] = await tx
    .insert(invoices)
    .values({
      docNo: `${kind === 'sales' ? 'INV' : 'PINV'}-TEST-${b.s}-${seq}`,
      kind,
      status: 'posted',
      partnerId,
      invoiceDate,
      dueDate: invoiceDate,
      subtotal: '1000.0000',
      vatTotal: lineVat,
      grandTotal: '1000.0000',
    })
    .returning();
  await tx.insert(invoiceLines).values({
    invoiceId: inv!.id,
    description: 'Test satırı',
    qty: '1.000',
    unitPrice: '1000.0000',
    lineSubtotal: '1000.0000',
    lineVat,
    lineTotal: '1000.0000',
  });
  return inv!;
}

describe('accounting/vat — closeVatPeriod (checks/21_vat_carryforward.sql formülü)', () => {
  it('dönemi hesaplar, devreden zinciri kurar ve idempotent kalır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Gerçek takvim ayları ile hiç çakışmaması için uzak, ardışık iki ay kullanılır.
      await openFiscalPeriod(tx, 2031, 1);
      await openFiscalPeriod(tx, 2031, 2);

      expect(previousPeriod('2031-02')).toBe('2031-01');

      // Sadece alış (satış yok) — standart KDV mantığında bu ay ÖDENECEK KDV YOK, tamamı
      // bir sonraki aya DEVREDEN KDV alacağı (190, borç) olarak taşınır (Tur 4 P0 düzeltmesi:
      // eski kod bunun tersini yapıp 360'a hayali bir "ödenecek KDV" yazıyordu).
      await makeInvoice(tx, b, 'purchase', '1000.0000', '2031-01-20', 2);

      const probe1 = await balanceProbe(tx);
      const r1 = await closeVatPeriod(tx, '2031-01', ctx);
      expect(r1.outputVat.toFixed(4)).toBe('0.0000');
      expect(r1.inputVat.toFixed(4)).toBe('1000.0000');
      expect(r1.carriedFromPrev.toFixed(4)).toBe('0.0000');
      // checks/21 formülü (standart KDV mahsubu): net = carriedFromPrev + inputVat - outputVat = 0+1000-0 = 1000
      // net ≥ 0 ⇒ ödenecek KDV yok, tamamı devreden: payable = max(-net,0) = 0 ; carriedToNext = max(net,0) = 1000
      expect(r1.payable.toFixed(4)).toBe('0.0000');
      expect(r1.carriedToNext.toFixed(4)).toBe('1000.0000');
      expect(r1.journalEntryId).toBeTruthy();
      expect(r1.skipped).toBeFalsy();

      // Fiş dengeli atılmış: 190 borç 1000, 391.99 alacak 1000 (getAccountBalance/probe alt hesapları
      // ana hesaba yuvarladığı için '391.99' hareketi '391' sondasında da görünür — bu satır
      // checks/12_vat.sql'in TAM eşleşmesini (jl.account_code = '391', LIKE değil) bozmaz;
      // aşağıda ham satırlar üzerinden ayrıca doğrulanıyor.
      expect((await probe1.bal('190', 'VUK')).toFixed(4)).toBe('1000.0000');
      expect((await probe1.bal('391.99', 'VUK')).toFixed(4)).toBe('-1000.0000');
      expect((await probe1.bal('360', 'VUK')).toFixed(4)).toBe('0.0000');
      // I12'nin aradığı TAM eşleşme (`account_code = '391'` / `'191'`) hiçbir satırda yok —
      // fiş yalnızca 190/360/391.99 kullanır, ham 391/191 asla dokunulmaz.
      const entryLines = await tx.select({ code: journalLines.accountCode }).from(journalLines).where(eq(journalLines.entryId, r1.journalEntryId!));
      expect(entryLines.map((l) => l.code).sort()).toEqual(['190', '391.99']);

      // İdempotent: aynı dönemi tekrar kapatmak yeni fiş atmaz
      const r1again = await closeVatPeriod(tx, '2031-01', ctx);
      expect(r1again.skipped).toBe(true);
      expect(r1again.journalEntryId).toBe(r1.journalEntryId);

      // İkinci ay: devreden alacak (1000) bu ayın büyük bir satışını karşılamaya yetmiyor —
      // hesaplanan KDV devreden+indirilecek'i aşıyor, fark vergi dairesine ÖDENECEK KDV'dir (360, alacak)
      await makeInvoice(tx, b, 'sales', '1200.0000', '2031-02-05', 3);
      await makeInvoice(tx, b, 'purchase', '5.0000', '2031-02-10', 4);

      const probe2 = await balanceProbe(tx);
      const r2 = await closeVatPeriod(tx, '2031-02', ctx);
      expect(r2.carriedFromPrev.toFixed(4)).toBe(r1.carriedToNext.toFixed(4));
      // net = 1000 + 5 - 1200 = -195 ⇒ payable = max(195,0) = 195, carriedToNext = max(-195,0) = 0
      expect(r2.payable.toFixed(4)).toBe('195.0000');
      expect(r2.carriedToNext.toFixed(4)).toBe('0.0000');
      expect((await probe2.bal('360', 'VUK')).toFixed(4)).toBe('-195.0000');
      expect((await probe2.bal('391.99', 'VUK')).toFixed(4)).toBe('195.0000');
      const entryLines2 = await tx.select({ code: journalLines.accountCode }).from(journalLines).where(eq(journalLines.entryId, r2.journalEntryId!));
      expect(entryLines2.map((l) => l.code).sort()).toEqual(['360', '391.99']);

      // vat_periods zinciri: I21(a) — bu ayın carried_from_prev = önceki ayın carried_to_next
      const [row2] = await tx.select().from(vatPeriods).where(eq(vatPeriods.period, '2031-02'));
      expect(row2!.carriedFromPrev).toBe('1000.0000');
    });
  });
});
