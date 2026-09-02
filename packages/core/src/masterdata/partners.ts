import { and, desc, eq, sql } from 'drizzle-orm';
import { partners, partnerAddresses, partnerContacts, supplierProducts, schema, type DbOrTx } from '@plantero/db';
import { DomainError, NotFoundError, ValidationError } from '../auth/errors.js';
import { nextSequence } from '../sequences.js';

/**
 * Cariler (müşteri / tedarikçi / her ikisi / banka). Bakiye (`partners.balance`) denormalizedir —
 * satış/tahsilat modülleri `postJournalEntry` sonrası günceller; burada yalnızca okunur/gösterilir.
 */

/** 10 haneli VKN ya da 11 haneli TCKN. TCKN için basit algoritma doğrulaması da yapılır. */
export function validateTaxNumber(v: string | null | undefined): { valid: boolean; kind: 'vkn' | 'tckn' | null; error?: string } {
  const s = (v ?? '').trim();
  if (!s) return { valid: true, kind: null }; // opsiyonel alan
  if (!/^\d+$/.test(s)) return { valid: false, kind: null, error: 'Yalnızca rakam içermeli' };
  if (s.length === 10) return { valid: true, kind: 'vkn' };
  if (s.length === 11) {
    if (isValidTckn(s)) return { valid: true, kind: 'tckn' };
    return { valid: false, kind: 'tckn', error: 'TCKN algoritma doğrulaması başarısız' };
  }
  return { valid: false, kind: null, error: 'VKN 10, TCKN 11 haneli olmalı' };
}

function isValidTckn(s: string): boolean {
  const d = s.split('').map(Number);
  if (d[0] === 0) return false;
  const oddSum = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const evenSum = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = ((oddSum * 7 - evenSum) % 10 + 10) % 10;
  if (d10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  const d11 = sum10 % 10;
  return d11 === d[10];
}

/** Sıradaki cari kodu: müşteri C-000001, tedarikçi S-000001. Yıl bileşeni yok — tek büyüyen dizi. */
export async function nextPartnerCode(tx: DbOrTx, kind: 'customer' | 'supplier'): Promise<string> {
  const prefix = kind === 'customer' ? 'C' : 'S';
  const { n } = await nextSequence(tx, { code: `PARTNER_${prefix}`, year: 0, prefix, padding: 6 });
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

export type CreatePartnerInput = {
  code?: string; // verilmezse nextPartnerCode ile üretilir (customer/supplier); both/bank için zorunlu
  name: string;
  kind: string;
  taxNumber?: string | null;
  taxOffice?: string | null;
  isEInvoiceRegistered?: boolean;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  country?: string;
  currency?: string;
  paymentTermKind?: string;
  paymentTermDays?: number;
  creditLimit?: string | null;
  defaultChannelId?: string | null;
  priceListId?: string | null;
  supplierLeadTimeDays?: number | null;
  isPurchaseWhitelisted?: boolean;
  note?: string | null;
  tags?: string[];
};

export async function createPartner(tx: DbOrTx, input: CreatePartnerInput): Promise<typeof partners.$inferSelect> {
  const taxCheck = validateTaxNumber(input.taxNumber);
  if (!taxCheck.valid) throw new ValidationError(`Vergi kimlik no geçersiz: ${taxCheck.error}`);

  let code = input.code?.trim();
  if (!code) {
    if (input.kind !== 'customer' && input.kind !== 'supplier') throw new ValidationError('Bu cari tipi için kod elle girilmelidir.');
    // Dizi sayacı, seed'de elle atanmış kodların ilerisinde olmayabilir — boş kod bulana kadar ilerlet.
    for (let attempt = 0; attempt < 1000 && !code; attempt++) {
      const candidate = await nextPartnerCode(tx, input.kind);
      const [taken] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.code, candidate)).limit(1);
      if (!taken) code = candidate;
    }
    if (!code) throw new DomainError('CODE_EXHAUSTED', 'Boş cari kodu üretilemedi.');
  } else {
    const [existing] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.code, code)).limit(1);
    if (existing) throw new ValidationError(`Cari kodu zaten kullanımda: ${code}`);
  }

  const [row] = await tx
    .insert(partners)
    .values({
      code,
      name: input.name,
      kind: input.kind as (typeof partners.$inferInsert)['kind'],
      taxNumber: input.taxNumber ?? null,
      taxOffice: input.taxOffice ?? null,
      isEInvoiceRegistered: input.isEInvoiceRegistered ?? false,
      email: input.email ?? null,
      phone: input.phone ?? null,
      whatsapp: input.whatsapp ?? null,
      website: input.website ?? null,
      country: input.country ?? 'TR',
      currency: input.currency ?? 'TRY',
      paymentTermKind: (input.paymentTermKind ?? 'cash') as (typeof partners.$inferInsert)['paymentTermKind'],
      paymentTermDays: input.paymentTermDays ?? 0,
      creditLimit: input.creditLimit ?? null,
      defaultChannelId: input.defaultChannelId ?? null,
      priceListId: input.priceListId ?? null,
      supplierLeadTimeDays: input.supplierLeadTimeDays ?? null,
      isPurchaseWhitelisted: input.isPurchaseWhitelisted ?? false,
      note: input.note ?? null,
      tags: input.tags ?? [],
    })
    .returning();
  return row!;
}

export type UpdatePartnerInput = Partial<Omit<CreatePartnerInput, 'code' | 'kind'>> & { isActive?: boolean };

export async function updatePartner(tx: DbOrTx, id: string, input: UpdatePartnerInput): Promise<typeof partners.$inferSelect> {
  const [existing] = await tx.select().from(partners).where(eq(partners.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Cari', id);
  if (input.taxNumber !== undefined) {
    const taxCheck = validateTaxNumber(input.taxNumber);
    if (!taxCheck.valid) throw new ValidationError(`Vergi kimlik no geçersiz: ${taxCheck.error}`);
  }
  const set: Partial<typeof partners.$inferInsert> = {};
  for (const k of [
    'name', 'taxNumber', 'taxOffice', 'isEInvoiceRegistered', 'email', 'phone', 'whatsapp', 'website', 'country', 'currency',
    'paymentTermDays', 'creditLimit', 'defaultChannelId', 'priceListId', 'supplierLeadTimeDays', 'isPurchaseWhitelisted', 'note', 'tags', 'isActive',
  ] as const) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) (set as Record<string, unknown>)[k] = v;
  }
  if (input.paymentTermKind !== undefined) set.paymentTermKind = input.paymentTermKind as (typeof partners.$inferInsert)['paymentTermKind'];
  const [row] = await tx.update(partners).set(set).where(eq(partners.id, id)).returning();
  return row!;
}

export async function addPartnerAddress(
  tx: DbOrTx,
  input: Omit<typeof partnerAddresses.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
): Promise<typeof partnerAddresses.$inferSelect> {
  const [row] = await tx.insert(partnerAddresses).values(input).returning();
  return row!;
}

export async function addPartnerContact(
  tx: DbOrTx,
  input: Omit<typeof partnerContacts.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
): Promise<typeof partnerContacts.$inferSelect> {
  const [row] = await tx.insert(partnerContacts).values(input).returning();
  return row!;
}

export type UpsertSupplierProductInput = {
  partnerId: string;
  productId: string;
  supplierSku?: string | null;
  price: string;
  currency?: string;
  leadTimeDays?: number;
  minOrderQty?: string;
  isPreferred?: boolean;
};

export async function upsertSupplierProduct(tx: DbOrTx, input: UpsertSupplierProductInput): Promise<typeof supplierProducts.$inferSelect> {
  const [row] = await tx
    .insert(supplierProducts)
    .values({
      partnerId: input.partnerId,
      productId: input.productId,
      supplierSku: input.supplierSku ?? null,
      price: input.price,
      currency: input.currency ?? 'TRY',
      leadTimeDays: input.leadTimeDays ?? 7,
      minOrderQty: input.minOrderQty ?? '0',
      isPreferred: input.isPreferred ?? false,
    })
    .onConflictDoUpdate({
      target: [supplierProducts.partnerId, supplierProducts.productId],
      set: { supplierSku: input.supplierSku ?? null, price: input.price, leadTimeDays: input.leadTimeDays ?? 7, minOrderQty: input.minOrderQty ?? '0', isPreferred: input.isPreferred ?? false },
    })
    .returning();
  return row!;
}

/** Cari özet kartı: bakiye, açık fatura, son sipariş — satış/muhasebe tabloları boşsa sıfır/null döner. */
export async function getPartnerSummary(
  tx: DbOrTx,
  partnerId: string,
): Promise<{
  balance: string;
  openInvoiceCount: number;
  openInvoiceAmount: string;
  lastOrderNo: string | null;
  lastOrderAt: string | null;
}> {
  const [p] = await tx.select({ balance: partners.balance }).from(partners).where(eq(partners.id, partnerId)).limit(1);
  if (!p) throw new NotFoundError('Cari', partnerId);

  let openInvoiceCount = 0;
  let openInvoiceAmount = '0';
  try {
    const rows = await tx
      .select({ n: sql<number>`count(*)`, sum: sql<string>`coalesce(sum(${schema.invoices.residual}), 0)` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.partnerId, partnerId), sql`${schema.invoices.status} not in ('paid', 'cancelled')`));
    if (rows[0]) {
      openInvoiceCount = Number(rows[0].n) || 0;
      openInvoiceAmount = rows[0].sum ?? '0';
    }
  } catch {
    /* satış/muhasebe modülü henüz seed edilmemiş olabilir */
  }

  let lastOrderNo: string | null = null;
  let lastOrderAt: string | null = null;
  try {
    const [row] = await tx
      .select({ docNo: schema.salesOrders.docNo, orderDate: schema.salesOrders.orderDate })
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.partnerId, partnerId))
      .orderBy(desc(schema.salesOrders.orderDate))
      .limit(1);
    if (row) {
      lastOrderNo = row.docNo;
      lastOrderAt = row.orderDate as unknown as string;
    }
  } catch {
    /* satış modülü henüz seed edilmemiş olabilir */
  }

  return { balance: p.balance, openInvoiceCount, openInvoiceAmount, lastOrderNo, lastOrderAt };
}
