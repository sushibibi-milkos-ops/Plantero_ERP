import { eq, inArray } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { qcTemplates, qcTemplateItems, qcCheckResults, type DbOrTx } from '@plantero/db';
import { D, toDb } from '../money.js';
import { writeAudit } from '../audit/index.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
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

  /**
   * I62 kök neden düzeltmesi (Tur 12, P2, veri-critic): kalemler her güncellemede TAMAMEN silinip
   * yeni id'lerle yeniden yazılıyordu (`insertItems`). `qc_check_results.template_item_id` şeması
   * (dondurulmuş) `qc_template_items.id`ye ON DELETE tanımı OLMADAN (NO ACTION) referans veriyor —
   * CANLI OLARAK KANITLANDI (`_probe.test.ts`, rollback'li, egzersiz sonrası silindi): daha önce en
   * az bir `qc_check_results` kaydı almış bir kaleme sahip şablon güncellenmeye çalışıldığında,
   * `tx.delete(qcTemplateItems)` HAM bir Postgres FK ihlali hatasıyla (kullanıcıya sızan ham SQL
   * metniyle) ÇÖKÜYORDU. Bu kaza eseri davranış, I62'nin tarif ettiği "min/max sessizce değişir,
   * eski kayıtlı sonuç eski değere göre donuk kalır" senaryosunun `updateTemplate` üzerinden ASLA
   * gerçekleşemeyeceği anlamına geliyordu — ama KASITSIZ ve kullanıcıya anlaşılmaz bir çöküş
   * biçiminde. Burada aynı korumayı KASITLI, anlaşılır bir iş kuralına çeviriyoruz: kayıtlı sonucu
   * olan kalemler silinip değiştirilemez (tarihsel doğruluk korunur — asıl "doğru" çözüm şablon
   * versiyonlama, şema değişikliği gerektirir, `schemaRequests`e yazıldı); henüz hiç sonuç
   * kaydedilmemiş kalemler öncekiyle aynı şekilde serbestçe silinip yeniden yazılabilir.
   */
  const existingItems = await tx.select({ id: qcTemplateItems.id, name: qcTemplateItems.name }).from(qcTemplateItems).where(eq(qcTemplateItems.templateId, id));
  if (existingItems.length) {
    const usedRows = await tx
      .select({ templateItemId: qcCheckResults.templateItemId })
      .from(qcCheckResults)
      .where(inArray(qcCheckResults.templateItemId, existingItems.map((i) => i.id)));
    const usedItemIds = new Set(usedRows.map((r) => r.templateItemId).filter((x): x is string => x !== null));
    if (usedItemIds.size) {
      const usedNames = existingItems.filter((i) => usedItemIds.has(i.id)).map((i) => i.name);
      throw new DomainError(
        'QC_TEMPLATE_ITEM_IN_USE',
        `"${existing.name}" şablonundaki şu kalemlere zaten kayıtlı kalite sonucu var, bu yüzden düzenlenemez/silinemez (tarihsel doğruluk korunur): ${usedNames.join(', ')}. Değişiklik gerekiyorsa yeni bir kod ile ayrı bir şablon oluşturun.`,
        { templateId: id, usedItemNames: usedNames },
      );
    }
  }

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
