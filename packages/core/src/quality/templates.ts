import { eq } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { qcTemplates, qcTemplateItems, type DbOrTx } from '@plantero/db';
import { D, toDb } from '../money.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/** QC şablon yönetimi — `/kalite/sablonlar`. Kalemler her güncellemede tamamen değiştirilir (idempotent). */

export type TemplateItemInput = {
  name: string;
  kind?: 'numeric' | 'boolean' | 'text' | 'document';
  minValue?: Decimal | string | null;
  maxValue?: Decimal | string | null;
  unit?: string | null;
  isCritical?: boolean;
  sequence?: number;
};

export type UpsertTemplateInput = {
  code: string;
  name: string;
  productId?: string | null;
  productType?: string | null;
  isActive?: boolean;
  items: TemplateItemInput[];
};

export async function createTemplate(tx: DbOrTx, input: UpsertTemplateInput, ctx: ActorCtx): Promise<typeof qcTemplates.$inferSelect> {
  if (!input.items.length) throw new ValidationError('Şablon en az bir kalem içermeli');
  const [row] = await tx
    .insert(qcTemplates)
    .values({ code: input.code.trim(), name: input.name.trim(), productId: input.productId ?? null, productType: input.productType ?? null, isActive: input.isActive ?? true, createdBy: ctx.userId ?? null })
    .returning();
  if (!row) throw new ValidationError('Şablon oluşturulamadı');
  await insertItems(tx, row.id, input.items);
  await writeAudit(tx, { action: 'create', tableName: 'qc_templates', recordId: row.id, summary: `Kalite şablonu ${row.name} (${row.code}) oluşturuldu — ${input.items.length} kalem`, after: row }, ctx);
  return row;
}

export async function updateTemplate(tx: DbOrTx, id: string, input: UpsertTemplateInput, ctx: ActorCtx): Promise<typeof qcTemplates.$inferSelect> {
  const [existing] = await tx.select().from(qcTemplates).where(eq(qcTemplates.id, id)).limit(1);
  if (!existing) throw new NotFoundError('Kalite şablonu', id);
  if (!input.items.length) throw new ValidationError('Şablon en az bir kalem içermeli');
  const [row] = await tx
    .update(qcTemplates)
    .set({ code: input.code.trim(), name: input.name.trim(), productId: input.productId ?? null, productType: input.productType ?? null, isActive: input.isActive ?? existing.isActive, updatedBy: ctx.userId ?? null })
    .where(eq(qcTemplates.id, id))
    .returning();
  await tx.delete(qcTemplateItems).where(eq(qcTemplateItems.templateId, id));
  await insertItems(tx, id, input.items);
  await writeAudit(tx, { action: 'update', tableName: 'qc_templates', recordId: id, summary: `Kalite şablonu ${row!.name} güncellendi — ${input.items.length} kalem`, after: row }, ctx);
  return row!;
}

export async function setTemplateActive(tx: DbOrTx, id: string, isActive: boolean, ctx: ActorCtx): Promise<typeof qcTemplates.$inferSelect> {
  const [row] = await tx.update(qcTemplates).set({ isActive, updatedBy: ctx.userId ?? null }).where(eq(qcTemplates.id, id)).returning();
  if (!row) throw new NotFoundError('Kalite şablonu', id);
  await writeAudit(tx, { action: 'update', tableName: 'qc_templates', recordId: id, summary: `Kalite şablonu ${row.name} ${isActive ? 'aktif edildi' : 'pasif edildi'}` }, ctx);
  return row;
}

async function insertItems(tx: DbOrTx, templateId: string, items: TemplateItemInput[]): Promise<void> {
  let seq = 10;
  for (const item of items) {
    await tx.insert(qcTemplateItems).values({
      templateId,
      name: item.name.trim(),
      kind: item.kind ?? 'numeric',
      minValue: item.minValue !== undefined && item.minValue !== null && item.minValue !== '' ? toDb(D(item.minValue)) : null,
      maxValue: item.maxValue !== undefined && item.maxValue !== null && item.maxValue !== '' ? toDb(D(item.maxValue)) : null,
      unit: item.unit ?? null,
      isCritical: item.isCritical ?? false,
      sequence: item.sequence ?? seq,
    });
    seq += 10;
  }
}
