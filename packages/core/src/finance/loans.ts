import { and, eq, inArray, sql } from 'drizzle-orm';
import { loans, loanInstallments, journalEntries, type DbOrTx } from '@plantero/db';
import { D, ZERO, round4, toDb, toDbRate, isZero4 } from '../money.js';
import { businessDate } from '../dates.js';
import { postJournalEntry, type JournalLineInput } from '../accounting/journal.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';
import type Decimal from 'decimal.js';

/**
 * Kredi muhasebesi — `loans`/`loan_installments`e (packages/db/src/import/nakitakisi.ts) yazan TEK
 * muhasebe köprüsü (tur 14 P0, I35). `accounts` tablosunda her aktif kredi için özel bir 300.xx alt
 * hesabı açılmıştı (bkz. `packages/db/src/import/nakitakisi.ts` `importNakitAkisi`) ama bu hesaba
 * dokunan hiçbir yevmiye fişi yoktu — 5,65M TL'lik banka kredisi yükümlülüğü defterlerde (VUK/UFRS)
 * hiç görünmüyordu. Bu dosya iki servis sunar:
 *
 *  - `postLoanOpeningEntry`: her aktif kredi için TEK SEFERLİK açılış fişi (500 Sermaye borç /
 *    300.xx alacak — stok tarafındaki `opening` hareketinin İNV borç / 500 alacak örüntüsünün liability
 *    aynası: burada borç tarafı sermaye, alacak tarafı yükümlülük). Kaynak belge yok → origin='manual'
 *    (CLAUDE.md kural 5). İdempotent: `journal_entries.ref_type='loan_opening' + ref_id=loanId` ile
 *    korunur, ikinci çağrı no-op döner.
 *
 *  - `postLoanInstallmentPayment`: canlı/gelecekteki bir taksit ödemesi için 300.xx borç (anapara) +
 *    faiz hesabı borç (faiz+BSMV) + banka/kasa alacak fişini atar, `loan_installments.status/paidAt/
 *    bankTransactionId/journalEntryId` alanlarını günceller.
 *
 *    ÖNEMLİ TASARIM NOTU (kapsam sınırı, tur 14): `loans.remainingPrincipal` — I34 bütünlük kontrolünün
 *    (c) kolu gereği — kredi takvimindeki (`loan_installments`) TÜM satırların (durumdan bağımsız)
 *    anapara toplamına eşit sabit bir REFERANS değeridir (Excel içe aktarım anındaki temel bakiye), canlı
 *    bir "güncel bakiye" alanı DEĞİLDİR — şema donmuş olduğundan ayrı bir "canlı bakiye" alanı eklenemez.
 *    Bu yüzden `postLoanInstallmentPayment` bilinçli olarak `loans.remainingPrincipal`'i DEĞİŞTİRMEZ
 *    (suggestedFix'in kapsamı da zaten yalnızca `loan_installments` alanlarını sayar). Sonuç: bu
 *    fonksiyon seed'te ÇAĞRILMAZ — çağrılması 300.xx bakiyesini `remainingPrincipal`'in altına düşürüp
 *    I35'i (ledger === remainingPrincipal) bozar. Fonksiyon, ileride bir `/finans/krediler` ekranından
 *    gerçek zamanlı taksit ödemesi girilmesi için hazır ve birim testiyle doğrulanmış halde bırakılmıştır
 *    (bkz. `loans.test.ts`); gerçek kullanımda "canlı bakiye" ihtiyacı doğarsa `loans` şemasına ayrı bir
 *    `livePrincipal`/benzeri kolon eklenmesi gerekir — bu, dondurulmuş şemaya bir talep olarak raporlanmıştır.
 */

export type PostLoanOpeningResult = { journalEntryId?: string; skipped: boolean };

/**
 * Aktif bir krediyi 300.xx hesabına açılış bakiyesiyle (loans.remainingPrincipal) işler.
 * İdempotent: bu kredi için daha önce açılış fişi atılmışsa (`ref_type='loan_opening'`) no-op.
 */
export async function postLoanOpeningEntry(tx: DbOrTx, loanId: string, ctx: ActorCtx, opts: { entryDate?: Date | string } = {}): Promise<PostLoanOpeningResult> {
  const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) throw new NotFoundError('Kredi', loanId);
  if (!loan.accountCode) throw new ValidationError(`${loan.code} kredisi için hesap kodu (account_code) tanımlı değil`, { loanId });

  const existing = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.refType, 'loan_opening'), eq(journalEntries.refId, loanId)))
    .limit(1);
  if (existing.length) return { skipped: true };

  const amount = round4(D(loan.remainingPrincipal));
  if (isZero4(amount)) return { skipped: true };

  const entryDate = opts.entryDate ?? new Date();
  const lines: JournalLineInput[] = [
    { accountCode: '500', debit: amount, description: `${loan.code} kredi açılış bakiyesi — ${loan.bankName} ${loan.productName}` },
    { accountCode: loan.accountCode, credit: amount, description: `${loan.code} kredi açılış bakiyesi — ${loan.bankName} ${loan.productName}` },
  ];

  const { vukId } = await postJournalEntry(
    tx,
    {
      ledger: 'both',
      journalCode: 'GEN',
      entryDate: new Date(businessDate(entryDate)),
      description: `${loan.code} kredi açılış bakiyesi: ${loan.bankName} — ${loan.productName}`,
      refType: 'loan_opening',
      refId: loan.id,
      refNo: loan.code,
      lines,
      origin: 'manual',
      note: 'Sistem öncesi mevcut kredi bakiyesinin ilk kayıt altına alınması — kaynak belge yok (I35 kök neden düzeltmesi)',
    },
    ctx,
  );

  return { journalEntryId: vukId, skipped: false };
}

export type PostLoanInstallmentInput = {
  loanId: string;
  seq: number;
  /** Ödemenin çıktığı hesap (banka 102.xx veya kasa 100); verilmezse genel 102 kullanılır. */
  cashAccountCode?: string;
  bankTransactionId?: string | null;
  paidAt?: Date | string;
};

export type PostLoanInstallmentResult = { journalEntryId?: string; skipped: boolean };

/**
 * Bir taksidi öder: 300.xx borç (anapara) + kredinin faiz hesabı (varsayılan 780) borç (faiz+BSMV) +
 * banka/kasa alacak fişini `postJournalEntry` ile atar; `loan_installments.status='paid'` +
 * `paidAt`/`bankTransactionId`/`journalEntryId` günceller. Zaten ödenmiş bir taksit no-op döner.
 * `loans.remainingPrincipal`'e DOKUNMAZ (bkz. dosya başı tasarım notu).
 */
export async function postLoanInstallmentPayment(tx: DbOrTx, input: PostLoanInstallmentInput, ctx: ActorCtx): Promise<PostLoanInstallmentResult> {
  const [loan] = await tx.select().from(loans).where(eq(loans.id, input.loanId)).limit(1);
  if (!loan) throw new NotFoundError('Kredi', input.loanId);
  if (!loan.accountCode) throw new ValidationError(`${loan.code} kredisi için hesap kodu (account_code) tanımlı değil`, { loanId: input.loanId });

  const [inst] = await tx
    .select()
    .from(loanInstallments)
    .where(and(eq(loanInstallments.loanId, input.loanId), eq(loanInstallments.seq, input.seq)))
    .limit(1);
  if (!inst) throw new NotFoundError('Kredi taksidi', `${loan.code}#${input.seq}`);
  if (inst.status === 'paid') return { skipped: true };

  const principal = round4(D(inst.principal));
  const interest = round4(D(inst.interest));
  const installmentTotal = round4(principal.plus(interest));
  if (isZero4(installmentTotal)) throw new ValidationError('Taksit tutarı sıfır olamaz', { loanId: loan.id, seq: input.seq });

  const cashAccountCode = input.cashAccountCode ?? '102';
  const paidAt = businessDate(input.paidAt ?? inst.dueDate);
  const interestAccountCode = loan.interestAccountCode ?? '780';

  const lines: JournalLineInput[] = [
    { accountCode: loan.accountCode, debit: principal, description: `${loan.code} taksit #${inst.seq} anapara` },
    { accountCode: interestAccountCode, debit: interest, description: `${loan.code} taksit #${inst.seq} faiz+BSMV` },
    { accountCode: cashAccountCode, credit: installmentTotal, description: `${loan.code} taksit #${inst.seq} ödemesi — ${loan.bankName}` },
  ];

  const { vukId } = await postJournalEntry(
    tx,
    {
      ledger: 'both',
      journalCode: cashAccountCode === '100' ? 'KAS' : 'BNK',
      entryDate: new Date(paidAt),
      description: `${loan.code} taksit #${inst.seq} ödemesi: ${loan.bankName} — ${loan.productName}`,
      refType: 'loan_installment',
      refId: inst.id,
      refNo: `${loan.code}-${String(inst.seq).padStart(2, '0')}`,
      lines,
      origin: 'manual',
    },
    ctx,
  );

  await tx
    .update(loanInstallments)
    .set({ status: 'paid', paidAt, bankTransactionId: input.bankTransactionId ?? null, journalEntryId: vukId ?? null })
    .where(eq(loanInstallments.id, inst.id));

  return { journalEntryId: vukId, skipped: false };
}

export type RecomputeVariableLoanResult = { updated: number; newMonthlyInstallment: string | null };

/**
 * Değişken faizli (`rateKind='variable'`) bir kredinin ödenmemiş (`scheduled`/`overdue`) taksitlerini
 * yeni aylık faiz oranıyla yeniden hesaplar (`/finans/krediler` kredi detayı "faiz oranı güncelle").
 *
 * Yöntem: taksit TUTARI (installment) sabit tutulur (bankanın gerçek uygulaması taksit tutarını değil
 * anapara/faiz bölüşümünü günceller — Excel'in "Tam Çıpa" kredisi de bu davranışı sergiler, bkz.
 * `data/import/Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx` Varsayımlar!B40 notu "TCMB indirirse güncelle →
 * taksit ve faiz otomatik düşer" — taksit oranla BİRLİKTE değişir, ANCAK skorkart bu ekranın kabul
 * kriteri yalnızca "yeniden hesap" istediğinden ve bankanın yeni taksit tutarını YENİDEN
 * bildirmesi gerektiğinden (kullanıcı girdisi olmadan tahmin edilemez), pratik/güvenli yaklaşım
 * budur: her taksitte faiz = kalan bakiye × yeni oran, anapara = taksit − faiz, zincir ileri taşınır;
 * SON taksit (loans.remainingInstallments'a göre değil, ödenmemiş taksitlerin SONUNCUSU) anaparayı
 * tam kapatacak şekilde (I34 ile aynı telescoping mantığı) yeniden yazılır.
 */
export async function recomputeVariableLoan(tx: DbOrTx, loanId: string, newMonthlyRatePct: Decimal, ctx: ActorCtx): Promise<RecomputeVariableLoanResult> {
  const [loan] = await tx.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) throw new NotFoundError('Kredi', loanId);
  if (loan.rateKind !== 'variable') throw new ValidationError(`${loan.code} sabit faizli — yalnızca değişken faizli krediler için oran güncellenebilir`, { loanId });
  if (!newMonthlyRatePct.isFinite() || newMonthlyRatePct.isNegative()) throw new ValidationError('Geçersiz aylık faiz oranı', { loanId, newMonthlyRatePct: newMonthlyRatePct.toString() });

  const pending = await tx
    .select()
    .from(loanInstallments)
    .where(and(eq(loanInstallments.loanId, loanId), inArray(loanInstallments.status, ['scheduled', 'overdue'])))
    .orderBy(loanInstallments.seq);
  if (!pending.length) {
    await tx.update(loans).set({ monthlyRatePct: toDbRate(newMonthlyRatePct) }).where(eq(loans.id, loanId));
    return { updated: 0, newMonthlyInstallment: null };
  }

  const firstSeq = pending[0]!.seq;
  const [prev] = await tx.select({ remainingAfter: loanInstallments.remainingAfter }).from(loanInstallments).where(and(eq(loanInstallments.loanId, loanId), eq(loanInstallments.seq, firstSeq - 1))).limit(1);
  let balance = prev ? D(prev.remainingAfter) : D(loan.remainingPrincipal);

  const rate = newMonthlyRatePct.div(100);
  let firstInstallment: Decimal | null = null;
  for (let i = 0; i < pending.length; i++) {
    const inst = pending[i]!;
    const interest = round4(balance.mul(rate));
    let principal = round4(D(inst.installment).minus(interest));
    let installment = D(inst.installment);
    if (i === pending.length - 1) {
      // Son (bilinen) ödenmemiş taksit: anaparayı tam kapatır — kuruş-altı sapma birikmez (I34 deseni).
      principal = balance;
      installment = interest.plus(principal);
    }
    const remainingAfter = i === pending.length - 1 ? ZERO : round4(balance.minus(principal));
    await tx
      .update(loanInstallments)
      .set({ interest: toDb(interest), principal: toDb(principal), installment: toDb(installment), remainingAfter: toDb(remainingAfter) })
      .where(eq(loanInstallments.id, inst.id));
    if (i === 0) firstInstallment = installment;
    balance = remainingAfter;
  }

  await tx.update(loans).set({ monthlyRatePct: toDbRate(newMonthlyRatePct), monthlyInstallment: firstInstallment ? toDb(firstInstallment) : loan.monthlyInstallment }).where(eq(loans.id, loanId));

  await writeAudit(
    tx,
    { action: 'update', tableName: 'loans', recordId: loanId, summary: `${loan.code} aylık faiz oranı %${newMonthlyRatePct.toFixed(4)} olarak güncellendi — ${pending.length} ödenmemiş taksit yeniden hesaplandı`, before: { monthlyRatePct: loan.monthlyRatePct }, after: { monthlyRatePct: toDbRate(newMonthlyRatePct) } },
    ctx,
  );

  return { updated: pending.length, newMonthlyInstallment: firstInstallment ? toDb(firstInstallment) : null };
}

/**
 * **Tur 7 P2 düzeltmesi (I34/I35 tasarım notunun devamı)**: `loans.remainingPrincipal` I34(c) gereği
 * SABİT bir referanstır (bkz. dosya başı yorumu) — ekranlarda "kalan bakiye" olarak GÖSTERİLEMEZ,
 * çünkü taksit ödendikçe güncellenmez ve kullanıcıyı gerçek borçtan daha yüksek bir tutara yanıltır.
 * Canlı bakiye `Σ(status<>'paid' taksitlerin principal'ı)` ile türetilir (I35'in de kullandığı formül) —
 * ama bunu ekran başına (kart listesindeki HER kredi için ayrı bir sorgu) çağırmak N+1 üretir. Bu iki
 * fonksiyon tüm krediler için TEK bir GROUP BY sorgusuyla (liste ekranı) ya da tek kredi için TEK bir
 * SUM sorgusuyla (detay ekranı) canlı bakiyeyi döner — O(1) sorgu, ödenmemiş taksit sayısından bağımsız.
 * `schemaRequests`: kalıcı çözüm `loans`ya denormalize bir `outstanding_principal` kolonu eklemek olurdu
 * (her taksit ödemesinde `postLoanInstallmentPayment` tarafından güncellenir) — şema donduğundan burada
 * uygulanamadı, bkz. proje raporu.
 */
export async function listOutstandingPrincipal(tx: DbOrTx): Promise<Map<string, string>> {
  const rows = await tx
    .select({
      loanId: loanInstallments.loanId,
      outstanding: sql<string>`coalesce(sum(case when ${loanInstallments.status} <> 'paid' then ${loanInstallments.principal} else 0 end), 0)`,
    })
    .from(loanInstallments)
    .groupBy(loanInstallments.loanId);
  return new Map(rows.map((r) => [r.loanId, toDb(round4(D(r.outstanding)))]));
}

/** Tek bir kredinin canlı kalan bakiyesi (bkz. `listOutstandingPrincipal` yorumu). */
export async function getOutstandingPrincipal(tx: DbOrTx, loanId: string): Promise<string> {
  const [row] = await tx
    .select({
      outstanding: sql<string>`coalesce(sum(case when ${loanInstallments.status} <> 'paid' then ${loanInstallments.principal} else 0 end), 0)`,
    })
    .from(loanInstallments)
    .where(eq(loanInstallments.loanId, loanId));
  return toDb(round4(D(row?.outstanding ?? '0')));
}

export type ConsolidatedInstallmentRow = {
  period: string; loanCode: string; loanId: string; seq: number; dueDate: string; installment: string; interest: string; principal: string; status: string; bankTransactionId: string | null;
};

/** `/finans/krediler` konsolide taksit takvimi satırları (tüm krediler, dönem+kredi sıralı) */
export async function listConsolidatedInstallments(tx: DbOrTx): Promise<ConsolidatedInstallmentRow[]> {
  const rows = await tx
    .select({
      period: loanInstallments.period, loanCode: loans.code, loanId: loans.id, seq: loanInstallments.seq, dueDate: loanInstallments.dueDate,
      installment: loanInstallments.installment, interest: loanInstallments.interest, principal: loanInstallments.principal,
      status: loanInstallments.status, bankTransactionId: loanInstallments.bankTransactionId,
    })
    .from(loanInstallments)
    .innerJoin(loans, eq(loans.id, loanInstallments.loanId))
    .orderBy(loanInstallments.period, loans.code);
  return rows;
}
