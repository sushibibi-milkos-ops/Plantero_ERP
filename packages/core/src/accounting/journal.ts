import { and, eq, gte, lte, or, like, inArray, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { accounts, fiscalPeriods, journals, journalEntries, journalLines, partners, type DbOrTx } from '@plantero/db';
import { D, toDb, toDbRate, round4, sum, ZERO, isZero4 } from '../money.js';
import { nextDocNo } from '../sequences.js';
import { writeAudit } from '../audit/index.js';
import { DomainError, NotFoundError, ValidationError } from '../auth/errors.js';
import { ensurePartnerAccount, isPartnerSubAccountCode } from './mapping.js';
import type { ActorCtx, DocumentOrigin, Ledger } from '../types.js';

export type JournalLineInput = {
  accountCode: string;
  debit?: Decimal;
  credit?: Decimal;
  partnerId?: string | null;
  description?: string | null;
  productId?: string | null;
  channelId?: string | null;
  warehouseId?: string | null;
  currency?: string | null;
  amountCurrency?: Decimal | null;
  dueDate?: Date | string | null;
  costCenter?: string | null;
};

export type JournalEntryInput = {
  ledger: Ledger | 'both';
  journalCode: string;
  entryDate: Date;
  description: string;
  refType?: string | null;
  refId?: string | null;
  refNo?: string | null;
  partnerId?: string | null;
  currency?: string | null;
  exchangeRate?: Decimal | null;
  lines: JournalLineInput[];
  origin?: DocumentOrigin;
  note?: string | null;
};

export type PostJournalResult = { vukId?: string; ufrsId?: string };

const toDateStr = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

/** Tarihin düştüğü mali dönemi bulur; kapalıysa hata */
export async function resolveOpenPeriod(tx: DbOrTx, entryDate: Date | string): Promise<{ id: string; code: string } | null> {
  const ds = toDateStr(entryDate);
  const [period] = await tx
    .select({ id: fiscalPeriods.id, code: fiscalPeriods.code, isClosed: fiscalPeriods.isClosed })
    .from(fiscalPeriods)
    .where(and(lte(fiscalPeriods.startDate, ds), gte(fiscalPeriods.endDate, ds)))
    .limit(1);
  if (!period) return null;
  if (period.isClosed) throw new DomainError('PERIOD_CLOSED', `${period.code} dönemi kapalı; kayıt yapılamaz`, { period: period.code, entryDate: ds });
  return { id: period.id, code: period.code };
}

type ResolvedLine = {
  accountId: string;
  accountCode: string;
  partnerId: string | null;
  debit: Decimal;
  credit: Decimal;
  input: JournalLineInput;
};

/** Hesap kodlarını çözer; 120/320 + cari → alt hesap açar */
async function resolveLines(tx: DbOrTx, lines: JournalLineInput[]): Promise<ResolvedLine[]> {
  const out: ResolvedLine[] = [];
  const cache = new Map<string, { id: string; isPostable: boolean }>();

  const lookup = async (code: string) => {
    const hit = cache.get(code);
    if (hit) return hit;
    const [acc] = await tx.select({ id: accounts.id, isPostable: accounts.isPostable, isActive: accounts.isActive }).from(accounts).where(eq(accounts.code, code)).limit(1);
    if (!acc) return null;
    const v = { id: acc.id, isPostable: acc.isPostable && acc.isActive };
    cache.set(code, v);
    return v;
  };

  for (const line of lines) {
    const debit = round4(D(line.debit));
    const credit = round4(D(line.credit));
    if (debit.lt(0) || credit.lt(0)) throw new ValidationError('Borç/alacak negatif olamaz', { accountCode: line.accountCode });
    if (!debit.isZero() && !credit.isZero()) throw new ValidationError('Bir satırda hem borç hem alacak olamaz', { accountCode: line.accountCode });

    let code = line.accountCode;
    let partnerId = line.partnerId ?? null;
    let acc = await lookup(code);

    // Cari ana hesabı (120/320) cari ile kullanılırsa alt hesap açılır; alt hesap kodu verilmiş ama yoksa da açılır
    if (partnerId && (code === '120' || code === '320')) {
      const sub = await ensurePartnerAccount(tx, partnerId, code);
      code = sub.code;
      acc = { id: sub.id, isPostable: true };
    } else if (!acc && partnerId && isPartnerSubAccountCode(code)) {
      const sub = await ensurePartnerAccount(tx, partnerId, code.startsWith('120') ? '120' : '320');
      code = sub.code;
      acc = { id: sub.id, isPostable: true };
    } else if (acc && !partnerId && isPartnerSubAccountCode(code)) {
      const [row] = await tx.select({ partnerId: accounts.partnerId }).from(accounts).where(eq(accounts.code, code)).limit(1);
      partnerId = row?.partnerId ?? null;
    }

    if (!acc) throw new NotFoundError('Hesap', code);
    if (!acc.isPostable) throw new DomainError('ACCOUNT_NOT_POSTABLE', `${code} hesabına kayıt yapılamaz`);
    out.push({ accountId: acc.id, accountCode: code, partnerId, debit, credit, input: line });
  }
  return out;
}

/**
 * TEK muhasebe yazma noktası.
 * - Σborç = Σalacak (4 hanede sıfır fark) yoksa hata
 * - Dönem kapalıysa hata
 * - ledger 'both' → VUK + UFRS iki fiş, twinEntryId çapraz bağlanır
 * - journalLines.accountCode denormalize, accountId çözümlenir
 * - Cari alt hesabı otomatik açılır; partners.balance yeniden hesaplanır
 */
export async function postJournalEntry(tx: DbOrTx, input: JournalEntryInput, ctx: ActorCtx): Promise<PostJournalResult> {
  if (!input.lines?.length) throw new ValidationError('Fişte en az bir satır olmalı');
  const [journal] = await tx.select({ id: journals.id, code: journals.code }).from(journals).where(eq(journals.code, input.journalCode)).limit(1);
  if (!journal) throw new NotFoundError('Yevmiye', input.journalCode);

  const lines = await resolveLines(tx, input.lines);
  const totalDebit = round4(sum(lines.map((l) => l.debit)));
  const totalCredit = round4(sum(lines.map((l) => l.credit)));
  if (!isZero4(totalDebit.minus(totalCredit))) {
    throw new DomainError('JOURNAL_UNBALANCED', `Fiş dengesiz: borç ${toDb(totalDebit)} ≠ alacak ${toDb(totalCredit)}`, {
      totalDebit: toDb(totalDebit), totalCredit: toDb(totalCredit),
    });
  }
  if (totalDebit.isZero()) throw new ValidationError('Fiş tutarı sıfır olamaz');

  const period = await resolveOpenPeriod(tx, input.entryDate);
  const ledgers: Ledger[] = input.ledger === 'both' ? ['VUK', 'UFRS'] : [input.ledger];
  const entryDate = toDateStr(input.entryDate);
  const ids: Partial<Record<Ledger, string>> = {};

  for (const ledger of ledgers) {
    const docNo = await nextDocNo(tx, 'JE', input.entryDate);
    const [entry] = await tx
      .insert(journalEntries)
      .values({
        docNo,
        ledger,
        journalId: journal.id,
        status: 'posted',
        entryDate,
        periodId: period?.id ?? null,
        description: input.description,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        refNo: input.refNo ?? null,
        partnerId: input.partnerId ?? null,
        currency: input.currency ?? 'TRY',
        exchangeRate: toDbRate(input.exchangeRate ?? 1),
        totalDebit: toDb(totalDebit),
        totalCredit: toDb(totalCredit),
        origin: input.origin ?? 'chain',
        postedBy: ctx.userId ?? null,
        createdBy: ctx.userId ?? null,
        note: input.note ?? null,
      })
      .returning({ id: journalEntries.id });
    const entryId = entry!.id;
    ids[ledger] = entryId;

    await tx.insert(journalLines).values(
      lines.map((l, i) => ({
        entryId,
        ledger,
        accountId: l.accountId,
        accountCode: l.accountCode,
        partnerId: l.partnerId,
        description: l.input.description ?? null,
        debit: toDb(l.debit),
        credit: toDb(l.credit),
        currency: l.input.currency ?? input.currency ?? 'TRY',
        amountCurrency: l.input.amountCurrency ? toDb(l.input.amountCurrency) : null,
        residual: l.partnerId && isPartnerSubAccountCode(l.accountCode) ? toDb(l.debit.minus(l.credit)) : null,
        dueDate: l.input.dueDate ? toDateStr(l.input.dueDate) : null,
        productId: l.input.productId ?? null,
        channelId: l.input.channelId ?? null,
        warehouseId: l.input.warehouseId ?? null,
        costCenter: l.input.costCenter ?? null,
        sequence: (i + 1) * 10,
      })),
    );
  }

  if (ids.VUK && ids.UFRS) {
    await tx.update(journalEntries).set({ twinEntryId: ids.UFRS }).where(eq(journalEntries.id, ids.VUK));
    await tx.update(journalEntries).set({ twinEntryId: ids.VUK }).where(eq(journalEntries.id, ids.UFRS));
  }

  // Cari bakiyeleri yeniden hesapla (VUK)
  const touched = new Set(lines.filter((l) => l.partnerId && isPartnerSubAccountCode(l.accountCode)).map((l) => l.partnerId as string));
  for (const pid of touched) await updatePartnerBalance(tx, pid);

  for (const ledger of ledgers) {
    await writeAudit(tx, {
      action: 'post',
      tableName: 'journal_entries',
      recordId: ids[ledger],
      summary: `${ledger} fişi kaydedildi: ${input.description} (${toDb(totalDebit)})`,
      after: { ledger, journalCode: input.journalCode, entryDate, totalDebit: toDb(totalDebit), refType: input.refType, refId: input.refId },
    }, ctx);
  }

  return { vukId: ids.VUK, ufrsId: ids.UFRS };
}

/**
 * Ters kayıt: satırları borç/alacak değiştirilmiş yeni fiş; orijinal `reversed`.
 * İkiz fiş varsa o da ters çevrilir ve ters fişler birbirine ikiz bağlanır.
 */
export async function reverseJournalEntry(
  tx: DbOrTx,
  entryId: string,
  ctx: ActorCtx,
  opts: { reversalDate?: Date; description?: string } = {},
): Promise<{ reversalIds: string[]; vukId?: string; ufrsId?: string }> {
  const [entry] = await tx.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1);
  if (!entry) throw new NotFoundError('Yevmiye fişi', entryId);
  if (entry.status !== 'posted') throw new DomainError('JOURNAL_NOT_POSTED', `Fiş ${entry.docNo} durumu ${entry.status}; ters kayıt yapılamaz`);

  const targets = [entry];
  if (entry.twinEntryId) {
    const [twin] = await tx.select().from(journalEntries).where(eq(journalEntries.id, entry.twinEntryId)).limit(1);
    if (twin && twin.status === 'posted') targets.push(twin);
  }

  const reversalDate = opts.reversalDate ?? new Date();
  const period = await resolveOpenPeriod(tx, reversalDate);
  // Orijinal fişin dönemi de kapalı olmamalı (kapalı dönem hareketi değişmez)
  await resolveOpenPeriod(tx, entry.entryDate);

  const [journal] = await tx.select({ code: journals.code }).from(journals).where(eq(journals.id, entry.journalId)).limit(1);
  const result: { reversalIds: string[]; vukId?: string; ufrsId?: string } = { reversalIds: [] };
  const touched = new Set<string>();

  for (const t of targets) {
    const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, t.id)).orderBy(journalLines.sequence);
    const docNo = await nextDocNo(tx, 'JE', reversalDate);
    const [rev] = await tx
      .insert(journalEntries)
      .values({
        docNo,
        ledger: t.ledger,
        journalId: t.journalId,
        status: 'posted',
        entryDate: toDateStr(reversalDate),
        periodId: period?.id ?? null,
        description: opts.description ?? `Ters kayıt: ${t.docNo} — ${t.description}`,
        refType: t.refType,
        refId: t.refId,
        refNo: t.refNo,
        partnerId: t.partnerId,
        currency: t.currency,
        exchangeRate: t.exchangeRate,
        totalDebit: t.totalCredit,
        totalCredit: t.totalDebit,
        reversesId: t.id,
        origin: 'system',
        postedBy: ctx.userId ?? null,
        createdBy: ctx.userId ?? null,
      })
      .returning({ id: journalEntries.id });
    const revId = rev!.id;
    if (lines.length) {
      await tx.insert(journalLines).values(
        lines.map((l) => ({
          entryId: revId,
          ledger: l.ledger,
          accountId: l.accountId,
          accountCode: l.accountCode,
          partnerId: l.partnerId,
          description: l.description,
          debit: l.credit,
          credit: l.debit,
          currency: l.currency,
          amountCurrency: l.amountCurrency ? toDb(D(l.amountCurrency).neg()) : null,
          residual: l.residual ? toDb(D(l.residual).neg()) : null,
          dueDate: l.dueDate,
          productId: l.productId,
          channelId: l.channelId,
          warehouseId: l.warehouseId,
          costCenter: l.costCenter,
          sequence: l.sequence,
        })),
      );
    }
    await tx.update(journalEntries).set({ status: 'reversed', reversedById: revId }).where(eq(journalEntries.id, t.id));
    for (const l of lines) if (l.partnerId && isPartnerSubAccountCode(l.accountCode)) touched.add(l.partnerId);
    result.reversalIds.push(revId);
    if (t.ledger === 'VUK') result.vukId = revId; else result.ufrsId = revId;

    await writeAudit(tx, {
      action: 'cancel',
      tableName: 'journal_entries',
      recordId: t.id,
      summary: `${t.ledger} fişi ters kayıtla iptal edildi: ${t.docNo} → ${docNo}`,
      before: { status: 'posted' },
      after: { status: 'reversed', reversedById: revId, journalCode: journal?.code },
    }, ctx);
  }

  if (result.vukId && result.ufrsId) {
    await tx.update(journalEntries).set({ twinEntryId: result.ufrsId }).where(eq(journalEntries.id, result.vukId));
    await tx.update(journalEntries).set({ twinEntryId: result.vukId }).where(eq(journalEntries.id, result.ufrsId));
  }
  for (const pid of touched) await updatePartnerBalance(tx, pid);
  return result;
}

/** Hesap kodu ve alt hesapları (`120` → `120.*`) için koşul */
const accountCodeCond = (code: string) => or(eq(journalLines.accountCode, code), like(journalLines.accountCode, `${code}.%`));

/**
 * Hesap bakiyesi = Σborç − Σalacak (posted + reversed fişler; ters kayıtlar birbirini götürür).
 * Kod alt hesapları da kapsar (120 → tüm cari alt hesapları).
 */
export async function getAccountBalance(
  tx: DbOrTx,
  opts: { accountCode: string; ledger: Ledger; asOf?: Date | string; partnerId?: string | null; from?: Date | string },
): Promise<Decimal> {
  const conds = [
    accountCodeCond(opts.accountCode),
    eq(journalLines.ledger, opts.ledger),
    inArray(journalEntries.status, ['posted', 'reversed']),
  ];
  if (opts.partnerId) conds.push(eq(journalLines.partnerId, opts.partnerId));
  if (opts.asOf) conds.push(lte(journalEntries.entryDate, toDateStr(opts.asOf)));
  if (opts.from) conds.push(gte(journalEntries.entryDate, toDateStr(opts.from)));
  const [row] = await tx
    .select({
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conds));
  return D(row?.debit).minus(D(row?.credit));
}

/** Cari bakiyesi (VUK): alacak 120.*, borç 320.*; net = receivable − payable (pozitif = bize borçlu) */
export async function getPartnerBalance(tx: DbOrTx, partnerId: string): Promise<{ receivable: Decimal; payable: Decimal; net: Decimal }> {
  const receivable = await getAccountBalance(tx, { accountCode: '120', ledger: 'VUK', partnerId });
  const payableDebitMinusCredit = await getAccountBalance(tx, { accountCode: '320', ledger: 'VUK', partnerId });
  const payable = payableDebitMinusCredit.neg();
  return { receivable, payable, net: receivable.minus(payable) };
}

/** partners.balance'ı 120/320 bakiyelerinden yeniden hesaplar ve yazar */
export async function updatePartnerBalance(tx: DbOrTx, partnerId: string): Promise<Decimal> {
  const { net } = await getPartnerBalance(tx, partnerId);
  await tx.update(partners).set({ balance: toDb(net) }).where(eq(partners.id, partnerId));
  return net;
}

export { ZERO };
