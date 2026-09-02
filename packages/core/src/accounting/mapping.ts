import { eq } from 'drizzle-orm';
import { accounts, partners, type DbOrTx } from '@plantero/db';
import { NotFoundError, DomainError } from '../auth/errors.js';
import type { ProductType, StockMoveKind } from '../types.js';

/* ------------------------------------------------------------------ */
/* Ana hesap kataloğu (Tek Düzen Hesap Planı — kullanılan alt küme)     */
/* ------------------------------------------------------------------ */

export type AccountType = (typeof accounts.$inferInsert)['type'];

export type AccountDef = { code: string; name: string; type: AccountType; parentCode?: string; ifrsCode?: string; ifrsName?: string; isPostable?: boolean };

export const ACCOUNT_CATALOG: readonly AccountDef[] = [
  { code: '100', name: 'Kasa', type: 'asset' },
  { code: '102', name: 'Bankalar', type: 'asset' },
  { code: '120', name: 'Alıcılar', type: 'asset', ifrsCode: '120', ifrsName: 'Ticari Alacaklar' },
  { code: '150', name: 'İlk Madde ve Malzeme', type: 'asset', ifrsCode: '150', ifrsName: 'Stoklar — Hammadde' },
  { code: '151', name: 'Yarı Mamuller — Üretim', type: 'asset', ifrsCode: '151', ifrsName: 'Stoklar — Yarı Mamul (WIP)' },
  { code: '152', name: 'Mamuller', type: 'asset', ifrsCode: '152', ifrsName: 'Stoklar — Mamul' },
  { code: '153', name: 'Ticari Mallar', type: 'asset', ifrsCode: '153', ifrsName: 'Stoklar — Ticari Mal' },
  { code: '190', name: 'Devreden KDV', type: 'asset' },
  { code: '191', name: 'İndirilecek KDV', type: 'asset' },
  { code: '300', name: 'Banka Kredileri', type: 'liability' },
  { code: '320', name: 'Satıcılar', type: 'liability', ifrsCode: '320', ifrsName: 'Ticari Borçlar' },
  { code: '320.999', name: 'Faturası Gelmemiş Alımlar', type: 'liability', parentCode: '320' },
  { code: '360', name: 'Ödenecek Vergi ve Fonlar', type: 'liability' },
  { code: '391', name: 'Hesaplanan KDV', type: 'liability' },
  { code: '500', name: 'Sermaye', type: 'equity' },
  { code: '600', name: 'Yurtiçi Satışlar', type: 'income' },
  { code: '601', name: 'Yurtdışı Satışlar', type: 'income' },
  { code: '610', name: 'Satıştan İadeler (-)', type: 'income' },
  { code: '621', name: 'Satılan Mamuller Maliyeti (-)', type: 'cogs' },
  { code: '646', name: 'Kambiyo Kârları', type: 'income' },
  { code: '656', name: 'Kambiyo Zararları (-)', type: 'expense' },
  { code: '659', name: 'Diğer Olağan Gider ve Zararlar (-)', type: 'expense' },
  { code: '679', name: 'Diğer Olağandışı Gelir ve Kârlar', type: 'income' },
  { code: '731', name: 'Genel Üretim Giderleri Yansıtma', type: 'expense' },
  { code: '760', name: 'Pazarlama Satış ve Dağıtım Giderleri', type: 'expense' },
  { code: '770', name: 'Genel Yönetim Giderleri', type: 'expense' },
  { code: '780', name: 'Finansman Giderleri', type: 'expense' },
];

/** Katalogdaki ana hesapları (yoksa) oluşturur — seed ve test kurulumu için idempotent */
export async function ensureCoreAccounts(tx: DbOrTx): Promise<void> {
  for (const def of ACCOUNT_CATALOG) {
    await tx
      .insert(accounts)
      .values({
        code: def.code,
        name: def.name,
        type: def.type,
        parentCode: def.parentCode ?? null,
        level: def.code.includes('.') ? 2 : 1,
        isPostable: def.isPostable ?? true,
        ifrsCode: def.ifrsCode ?? null,
        ifrsName: def.ifrsName ?? null,
      })
      .onConflictDoNothing({ target: accounts.code });
  }
}

/* ------------------------------------------------------------------ */
/* Ürün tipi → envanter hesabı                                          */
/* ------------------------------------------------------------------ */

export const INVENTORY_ACCOUNT_BY_TYPE: Record<ProductType, string> = {
  raw_material: '150',
  packaging: '150',
  semi_finished: '151',
  finished: '152',
  equipment: '153',
  fixed_asset: '153',
  service: '153',
};

/** Ürün kartındaki eşleme öncelikli; yoksa tipe göre */
export function inventoryAccountFor(product: { type: ProductType; inventoryAccountCode?: string | null }): string {
  return product.inventoryAccountCode ?? INVENTORY_ACCOUNT_BY_TYPE[product.type] ?? '153';
}

export function cogsAccountFor(product: { cogsAccountCode?: string | null }): string {
  return product.cogsAccountCode ?? '621';
}

export function revenueAccountFor(product: { revenueAccountCode?: string | null }, isExport = false): string {
  return product.revenueAccountCode ?? (isExport ? '601' : '600');
}

/* ------------------------------------------------------------------ */
/* Stok hareketi → hesap eşlemesi (ARCHITECTURE §6.7)                   */
/* ------------------------------------------------------------------ */

export type MoveAccountLine = { accountCode: string; side: 'debit' | 'credit'; share: 'material' | 'overhead' | 'total' };

/** Değersiz hareketler: hesap değişmez */
export const UNVALUED_MOVE_KINDS: readonly StockMoveKind[] = ['transfer', 'quarantine_release', 'quarantine_reject'];

/**
 * Hareket türü → borç/alacak hesap çiftleri. `INV` = ürünün envanter hesabı.
 * production: 152 borç; 151 (malzeme payı) + 731 (genel gider payı) alacak.
 */
export function moveAccountLines(kind: StockMoveKind, inventoryCode: string, cogsCode = '621'): MoveAccountLine[] | null {
  const INV = inventoryCode;
  const pair = (debit: string, credit: string): MoveAccountLine[] => [
    { accountCode: debit, side: 'debit', share: 'total' },
    { accountCode: credit, side: 'credit', share: 'total' },
  ];
  switch (kind) {
    case 'receipt': return pair(INV, '320.999');
    case 'return_out': return pair('320.999', INV);
    case 'consumption': return pair('151', INV);
    case 'production':
      return [
        { accountCode: INV, side: 'debit', share: 'total' },
        { accountCode: '151', side: 'credit', share: 'material' },
        { accountCode: '731', side: 'credit', share: 'overhead' },
      ];
    case 'byproduct': return pair(INV, '151');
    case 'scrap': return pair('659', INV);
    case 'delivery': return pair(cogsCode, INV);
    case 'return_in': return pair(INV, cogsCode);
    case 'count_gain': return pair(INV, '679');
    case 'count_loss': return pair('659', INV);
    case 'recall_return': return pair(INV, cogsCode);
    case 'opening': return pair(INV, '500');
    case 'transfer':
    case 'quarantine_release':
    case 'quarantine_reject':
      return null;
    default:
      return null;
  }
}

/** Hareket türü → yevmiye kodu (STK stok, URT üretim) */
export function journalCodeForMove(kind: StockMoveKind): string {
  return kind === 'consumption' || kind === 'production' || kind === 'byproduct' ? 'URT' : 'STK';
}

/* ------------------------------------------------------------------ */
/* Cari alt hesabı: 120.<cari kodu> / 320.<cari kodu>                    */
/* ------------------------------------------------------------------ */

export type PartnerAccountRoot = '120' | '320';

export const partnerAccountCode = (root: PartnerAccountRoot, partnerCode: string) => `${root}.${partnerCode}`;

/**
 * Cari alt hesabını accounts tablosunda (yoksa) açar ve cari kartına yazar.
 * isPartnerAccount=true, partnerId dolu.
 */
export async function ensurePartnerAccount(tx: DbOrTx, partnerId: string, root: PartnerAccountRoot): Promise<{ id: string; code: string }> {
  const [partner] = await tx.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', partnerId);

  const code = partnerAccountCode(root, partner.code);
  const [existing] = await tx.select({ id: accounts.id, code: accounts.code, partnerId: accounts.partnerId }).from(accounts).where(eq(accounts.code, code)).limit(1);
  let accountId = existing?.id;
  if (existing && existing.partnerId && existing.partnerId !== partnerId) {
    throw new DomainError('ACCOUNT_PARTNER_MISMATCH', `${code} hesabı başka bir cariye bağlı`);
  }
  if (!accountId) {
    await tx
      .insert(accounts)
      .values({
        code,
        name: partner.name,
        type: root === '120' ? 'asset' : 'liability',
        parentCode: root,
        level: 2,
        isPostable: true,
        isPartnerAccount: true,
        partnerId,
        currency: partner.currency ?? 'TRY',
      })
      .onConflictDoNothing({ target: accounts.code });
    const [row] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.code, code)).limit(1);
    if (!row) throw new DomainError('ACCOUNT_CREATE_FAILED', `${code} hesabı oluşturulamadı`);
    accountId = row.id;
  } else if (!existing?.partnerId) {
    await tx.update(accounts).set({ isPartnerAccount: true, partnerId }).where(eq(accounts.id, accountId));
  }

  const field = root === '120' ? partner.receivableAccountCode : partner.payableAccountCode;
  if (field !== code) {
    await tx
      .update(partners)
      .set(root === '120' ? { receivableAccountCode: code } : { payableAccountCode: code })
      .where(eq(partners.id, partnerId));
  }
  return { id: accountId, code };
}

/** `120.C-000001` gibi bir kodun cari alt hesabı olup olmadığı */
export const isPartnerSubAccountCode = (code: string): boolean => /^(120|320)\.(?!999$)/.test(code);
