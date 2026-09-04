import { eq } from 'drizzle-orm';
import { exportDocuments, exportShipments, type DbOrTx } from '@plantero/db';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import type { ActorCtx } from '../types.js';

/**
 * İhracat belge takip listesi — `docs/modules/ihracat.md` §1 "Belgeler" sekmesi. Rejime göre gerekli
 * belge seti farklıdır: ETGB (mikro ihracat, kolay usul) gümrük beyannamesi + ATR/EUR.1 istemez,
 * standart rejim tam evrak seti ister.
 */
export type ExportDocCode = 'PROFORMA' | 'INVOICE' | 'PACKING_LIST' | 'ATR' | 'EUR1' | 'ORIGIN' | 'HEALTH' | 'BL' | 'CMR' | 'AWB' | 'ETGB' | 'INSURANCE';

const DOC_NAMES: Record<ExportDocCode, string> = {
  PROFORMA: 'Proforma fatura',
  INVOICE: 'Ticari fatura',
  PACKING_LIST: 'Çeki listesi (packing list)',
  ATR: 'ATR dolaşım belgesi',
  EUR1: 'EUR.1 dolaşım sertifikası',
  ORIGIN: 'Menşe şahadetnamesi',
  HEALTH: 'Sağlık sertifikası',
  BL: 'Konşimento (B/L)',
  CMR: 'CMR taşıma senedi',
  AWB: 'Hava yolu taşıma senedi (AWB)',
  ETGB: 'ETGB (mikro ihracat beyanı)',
  INSURANCE: 'Nakliye sigortası',
};

/**
 * Rejime göre gerekli belge seti (sıra, gerekliliği). `standard`: tam gümrük evrakı (ATR/EUR.1'den
 * yalnızca biri gerçekte kullanılır ama ikisi de listede "not_required" olarak durur, sorumlu
 * seçime göre birini 'required'a çevirebilir). `etgb`: 300 kg / 15.000 EUR altı kolay usul — gümrük
 * müşavirsiz, ETGB numarasıyla kapanır; ATR/EUR.1/CMR/BL/AWB gerekmez (taşıma genelde kurye/kargo).
 */
const REQUIRED_BY_REGIME: Record<'standard' | 'etgb', ExportDocCode[]> = {
  standard: ['PROFORMA', 'INVOICE', 'PACKING_LIST', 'ORIGIN', 'HEALTH', 'BL', 'INSURANCE'],
  etgb: ['PROFORMA', 'INVOICE', 'PACKING_LIST', 'HEALTH', 'ETGB'],
};
const NOT_REQUIRED_BY_REGIME: Record<'standard' | 'etgb', ExportDocCode[]> = {
  standard: ['ETGB'],
  etgb: ['ATR', 'EUR1', 'BL', 'CMR', 'AWB', 'INSURANCE'],
};

const ALL_CODES: ExportDocCode[] = ['PROFORMA', 'INVOICE', 'PACKING_LIST', 'ATR', 'EUR1', 'ORIGIN', 'HEALTH', 'BL', 'CMR', 'AWB', 'ETGB', 'INSURANCE'];

/**
 * Sevkiyatın belge takip listesini rejime göre kurar (idempotent — zaten var olan kodları atlar).
 * `createFromOrder` tarafından otomatik çağrılır; rejim sonradan değişirse (`updateLogistics`)
 * yeniden çağrılabilir, eksik kodlar eklenir, gerekmeyenler `not_required` işaretlenir (silinmez —
 * elle girilmiş bir tarih/ek varsa kaybolmaz).
 */
export async function ensureDocumentSet(tx: DbOrTx, shipmentId: string, regime: 'standard' | 'etgb', _ctx: ActorCtx): Promise<Array<typeof exportDocuments.$inferSelect>> {
  const existing = await tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipmentId));
  const byCode = new Map(existing.map((d) => [d.code, d]));
  const required = new Set(REQUIRED_BY_REGIME[regime]);
  const notRequired = new Set(NOT_REQUIRED_BY_REGIME[regime]);

  let seq = 10;
  for (const code of ALL_CODES) {
    const current = byCode.get(code);
    const shouldBeNotRequired = notRequired.has(code) && !required.has(code);
    if (!current) {
      if (!required.has(code) && !shouldBeNotRequired) continue; // rejimde ne gerekli ne yasaklı (nötr belge) → satır açma
      await tx.insert(exportDocuments).values({
        shipmentId, code, name: DOC_NAMES[code], status: shouldBeNotRequired ? 'not_required' : 'required', sequence: seq,
      });
    } else if (shouldBeNotRequired && current.status === 'required') {
      await tx.update(exportDocuments).set({ status: 'not_required', updatedAt: new Date() }).where(eq(exportDocuments.id, current.id));
    } else if (required.has(code) && current.status === 'not_required') {
      await tx.update(exportDocuments).set({ status: 'required', updatedAt: new Date() }).where(eq(exportDocuments.id, current.id));
    }
    seq += 10;
  }
  // Not: bu, `createFromOrder`'ın bir alt adımıdır — kayıt-bazlı audit yalnızca ayrı bir kullanıcı
  // eylemiyle DEĞİŞEN satırlar için `updateExportDocument`'ta yazılır (I17 kapsamı `export_documents`'ı
  // içermiyor); burada her sevkiyat oluşturmada 5-7 satırlık gürültülü bir audit izi üretmek yerine
  // çağıran katmanın (web: withAudit, seed: writeAudit) tek özet satırına güveniyoruz.
  return tx.select().from(exportDocuments).where(eq(exportDocuments.shipmentId, shipmentId)).orderBy(exportDocuments.sequence);
}

export type UpdateExportDocInput = {
  status?: (typeof exportDocuments.$inferSelect)['status'];
  docNo?: string | null;
  issuedAt?: string | null;
  responsibleId?: string | null;
  dueDate?: string | null;
  attachmentId?: string | null;
  note?: string | null;
};

/** Tek belge satırını günceller (durum, no, sorumlu, vade, ek). Kayıt-bazlı audit burada bırakılır. */
export async function updateExportDocument(tx: DbOrTx, documentId: string, input: UpdateExportDocInput, ctx: ActorCtx): Promise<typeof exportDocuments.$inferSelect> {
  const [doc] = await tx.select().from(exportDocuments).where(eq(exportDocuments.id, documentId)).limit(1);
  if (!doc) throw new NotFoundError('İhracat belgesi', documentId);
  const [shipment] = await tx.select().from(exportShipments).where(eq(exportShipments.id, doc.shipmentId)).limit(1);
  if (!shipment) throw new NotFoundError('İhracat sevkiyatı', doc.shipmentId);

  const [updated] = await tx
    .update(exportDocuments)
    .set({
      status: input.status ?? doc.status,
      docNo: input.docNo !== undefined ? input.docNo : doc.docNo,
      issuedAt: input.issuedAt !== undefined ? input.issuedAt : doc.issuedAt,
      responsibleId: input.responsibleId !== undefined ? input.responsibleId : doc.responsibleId,
      dueDate: input.dueDate !== undefined ? input.dueDate : doc.dueDate,
      attachmentId: input.attachmentId !== undefined ? input.attachmentId : doc.attachmentId,
      note: input.note !== undefined ? input.note : doc.note,
      updatedAt: new Date(),
    })
    .where(eq(exportDocuments.id, documentId))
    .returning();

  await writeAudit(tx, {
    action: 'update', tableName: 'export_documents', recordId: documentId,
    summary: `${shipment.docNo}: ${doc.name} → ${updated!.status}`, before: doc, after: updated,
  }, ctx);
  return updated!;
}

/** Rejim başına gerekli belge sayısı / tamamlanan (sent|received|not_required) sayısı — ilerleme % için. */
export function docProgress(docs: Array<Pick<typeof exportDocuments.$inferSelect, 'status'>>): { done: number; total: number; pct: number } {
  const total = docs.length;
  const done = docs.filter((d) => d.status === 'sent' || d.status === 'received' || d.status === 'not_required').length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function requiredDocCodesForRegime(regime: 'standard' | 'etgb'): ExportDocCode[] {
  return REQUIRED_BY_REGIME[regime];
}

export function assertKnownDocCode(code: string): asserts code is ExportDocCode {
  if (!ALL_CODES.includes(code as ExportDocCode)) throw new ValidationError(`Bilinmeyen ihracat belge kodu: ${code}`);
}
