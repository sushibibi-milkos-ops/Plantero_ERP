import { and, desc, eq } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import type { DbOrTx } from '@plantero/db';
import {
  trialRecipes, trialRecipeVersions, trialRecipeLines, rndProjects, products, purchaseOrders, purchaseOrderLines,
  approvals, boms,
} from '@plantero/db';
import { D, ZERO, toDb } from '../money.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { writeAudit } from '../audit/index.js';
import { createBomVersion, activateBom } from '../masterdata/boms.js';
import type { ActorCtx } from '../types.js';
import { computeTrialCost, type CostSource, type TrialCostComputation } from './costFormula.js';

export { computeTrialCost, type CostSource, type TrialCostComputation };

/**
 * Versiyonlu deneme reçetesi + canlı maliyet simülasyonu + onay + üretim BOM'una devir
 * (docs/modules/arge.md §3). Formül `packages/core/src/masterdata/boms.ts`'teki `rollupBomCost` ile
 * BİREBİR aynıdır (bilinçli tutarlılık: Ar-Ge simülasyonu BOM'a devrolduğunda maliyet aniden
 * değişmemeli) — Σ satır maliyeti (fire dahil) + genel gider (parti+birim) → verim düzeltmeli birim
 * maliyet.
 */

export type TrialLineInput = {
  productId: string;
  qty: string;
  uomId: string;
  costSource: CostSource;
  /** costSource='manual' iken zorunlu; diğerlerinde sunucu tarafında canlı çözülür (görmezden gelinir). */
  manualUnitCost?: string | null;
  scrapPct?: string;
  sequence?: number;
  note?: string | null;
};

/* ==================================================================== */
/* Canlı maliyet kaynağı çözümü                                          */
/* ==================================================================== */

export type ResolvedCost = { unitCost: Decimal; resolvedSource: 'average' | 'last_purchase' | 'manual' | 'standard_cost_fallback' | 'none' };

/** `costSource` seçicisine göre birim maliyeti çözer: ortalama = `products.averageCost`, son alış =
 *  en güncel `purchase_order_lines.unitPrice`, manuel = kullanıcı girdisi. Veri yoksa ortalamaya, o da
 *  yoksa standart maliyete düşer (asla sessizce 0'a düşmez — `resolvedSource` gerçek kaynağı taşır). */
export async function resolveLineUnitCost(tx: DbOrTx, productId: string, costSource: CostSource, manualUnitCost?: string | null): Promise<ResolvedCost> {
  if (costSource === 'manual') return { unitCost: D(manualUnitCost ?? '0'), resolvedSource: 'manual' };

  if (costSource === 'last_purchase') {
    const rows = await tx
      .select({ unitPrice: purchaseOrderLines.unitPrice })
      .from(purchaseOrderLines)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.orderId))
      .where(eq(purchaseOrderLines.productId, productId))
      .orderBy(desc(purchaseOrders.orderDate))
      .limit(1);
    if (rows[0]) return { unitCost: D(rows[0].unitPrice), resolvedSource: 'last_purchase' };
    // Alış geçmişi yok — ortalamaya düş (aşağıda devam)
  }

  const [p] = await tx.select({ averageCost: products.averageCost, standardCost: products.standardCost }).from(products).where(eq(products.id, productId)).limit(1);
  if (!p) throw new NotFoundError('Ürün', productId);
  if (!D(p.averageCost).isZero()) return { unitCost: D(p.averageCost), resolvedSource: 'average' };
  if (!D(p.standardCost).isZero()) return { unitCost: D(p.standardCost), resolvedSource: 'standard_cost_fallback' };
  return { unitCost: ZERO, resolvedSource: 'none' };
}

/* ==================================================================== */
/* Versiyon CRUD                                                        */
/* ==================================================================== */

export type VersionRow = typeof trialRecipeVersions.$inferSelect;
export type LineRow = typeof trialRecipeLines.$inferSelect;

export type VersionRollup = {
  version: VersionRow;
  lines: Array<LineRow & { sku: string; name: string; lineCost: string }>;
  materialCost: string;
  unitCost: string;
  effectiveOutputQty: string;
};

async function loadLinesWithProduct(tx: DbOrTx, versionId: string) {
  return tx
    .select({ line: trialRecipeLines, sku: products.sku, name: products.name })
    .from(trialRecipeLines)
    .innerJoin(products, eq(products.id, trialRecipeLines.productId))
    .where(eq(trialRecipeLines.versionId, versionId))
    .orderBy(trialRecipeLines.sequence);
}

/** Satır maliyetlerini (canlı) çözüp version.materialCost/unitCost'u günceller; tam döküm döner. */
export async function simulateVersionCost(tx: DbOrTx, versionId: string): Promise<VersionRollup> {
  const [version] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError('Deneme reçetesi versiyonu', versionId);
  const rows = await loadLinesWithProduct(tx, versionId);

  const resolvedLines: Array<{ row: (typeof rows)[number]; unitCost: Decimal }> = [];
  for (const r of rows) {
    const resolved = await resolveLineUnitCost(tx, r.line.productId, r.line.costSource as CostSource, r.line.unitCost);
    resolvedLines.push({ row: r, unitCost: resolved.unitCost });
    if (r.line.costSource !== 'manual') {
      await tx.update(trialRecipeLines).set({ unitCost: toDb(resolved.unitCost) }).where(eq(trialRecipeLines.id, r.line.id));
    }
  }

  const computation = computeTrialCost({
    batchQty: D(version.batchQty),
    expectedYieldPct: D(version.expectedYieldPct),
    overheadPerBatch: D(version.overheadPerBatch),
    overheadPerUnit: D(version.overheadPerUnit),
    lines: resolvedLines.map((r) => ({ qty: D(r.row.line.qty), unitCost: r.unitCost, scrapPct: D(r.row.line.scrapPct) })),
  });

  await tx.update(trialRecipeVersions).set({ materialCost: toDb(computation.materialCost), unitCost: toDb(computation.unitCost) }).where(eq(trialRecipeVersions.id, versionId));

  const lines = resolvedLines.map((r, i) => ({ ...r.row.line, sku: r.row.sku, name: r.row.name, unitCost: toDb(r.unitCost), lineCost: toDb(computation.lineCosts[i]!) }));
  return { version: { ...version, materialCost: toDb(computation.materialCost), unitCost: toDb(computation.unitCost) }, lines, materialCost: toDb(computation.materialCost), unitCost: toDb(computation.unitCost), effectiveOutputQty: toDb(computation.effectiveOutputQty) };
}

async function insertLines(tx: DbOrTx, versionId: string, lines: TrialLineInput[]): Promise<void> {
  if (lines.length === 0) throw new ValidationError('Reçetede en az bir satır olmalı');
  await tx.insert(trialRecipeLines).values(
    lines.map((l, i) => ({
      versionId,
      productId: l.productId,
      qty: l.qty,
      uomId: l.uomId,
      unitCost: l.costSource === 'manual' ? (l.manualUnitCost ?? '0') : '0', // simulateVersionCost hemen sonra canlı çözer
      costSource: l.costSource,
      scrapPct: l.scrapPct ?? '0',
      sequence: l.sequence ?? (i + 1) * 10,
      note: l.note ?? null,
    })),
  );
}

export type CreateRecipeInput = { projectId: string; name: string; lines: TrialLineInput[]; batchQty?: string; batchUomId?: string | null; expectedYieldPct?: string; overheadPerBatch?: string; overheadPerUnit?: string; changeNote?: string | null };

/** Yeni deneme reçetesi + v1 (draft). */
export async function createTrialRecipe(tx: DbOrTx, input: CreateRecipeInput, ctx: ActorCtx): Promise<{ recipe: typeof trialRecipes.$inferSelect; rollup: VersionRollup }> {
  if (!input.name.trim()) throw new ValidationError('Reçete adı gerekli');
  const [project] = await tx.select({ id: rndProjects.id }).from(rndProjects).where(eq(rndProjects.id, input.projectId)).limit(1);
  if (!project) throw new NotFoundError('Proje', input.projectId);

  const [recipe] = await tx.insert(trialRecipes).values({ projectId: input.projectId, name: input.name.trim(), createdBy: ctx.userId ?? null, updatedBy: ctx.userId ?? null }).returning();

  const [version] = await tx
    .insert(trialRecipeVersions)
    .values({
      recipeId: recipe!.id,
      version: 1,
      status: 'draft',
      batchQty: input.batchQty ?? '1',
      batchUomId: input.batchUomId ?? null,
      expectedYieldPct: input.expectedYieldPct ?? '100',
      overheadPerBatch: input.overheadPerBatch ?? '0',
      overheadPerUnit: input.overheadPerUnit ?? '0',
      changeNote: input.changeNote ?? 'İlk versiyon',
      createdBy: ctx.userId ?? null,
      updatedBy: ctx.userId ?? null,
    })
    .returning();

  await insertLines(tx, version!.id, input.lines);
  await tx.update(trialRecipes).set({ currentVersionId: version!.id }).where(eq(trialRecipes.id, recipe!.id));

  const rollup = await simulateVersionCost(tx, version!.id);
  return { recipe: recipe!, rollup };
}

/** "Yeni versiyon" (kopya) — kaynak versiyon (varsayılan: en son) satır/parametrelerini kopyalar. */
export async function createNewVersion(tx: DbOrTx, input: { recipeId: string; copyFromVersionId?: string; changeNote?: string | null }, ctx: ActorCtx): Promise<VersionRollup> {
  const [recipe] = await tx.select().from(trialRecipes).where(eq(trialRecipes.id, input.recipeId)).limit(1);
  if (!recipe) throw new NotFoundError('Deneme reçetesi', input.recipeId);

  const [latest] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.recipeId, input.recipeId)).orderBy(desc(trialRecipeVersions.version)).limit(1);
  const sourceId = input.copyFromVersionId ?? latest?.id;
  if (!sourceId) throw new ValidationError('Kopyalanacak kaynak versiyon bulunamadı');
  const [source] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, sourceId)).limit(1);
  if (!source) throw new NotFoundError('Kaynak versiyon', sourceId);
  const sourceLines = await tx.select().from(trialRecipeLines).where(eq(trialRecipeLines.versionId, sourceId)).orderBy(trialRecipeLines.sequence);

  const nextVersionNo = (latest?.version ?? 0) + 1;
  const [version] = await tx
    .insert(trialRecipeVersions)
    .values({
      recipeId: input.recipeId,
      version: nextVersionNo,
      status: 'draft',
      batchQty: source.batchQty,
      batchUomId: source.batchUomId,
      expectedYieldPct: source.expectedYieldPct,
      overheadPerBatch: source.overheadPerBatch,
      overheadPerUnit: source.overheadPerUnit,
      changeNote: input.changeNote ?? `v${source.version}'den kopyalandı`,
      createdBy: ctx.userId ?? null,
      updatedBy: ctx.userId ?? null,
    })
    .returning();

  await insertLines(
    tx,
    version!.id,
    sourceLines.map((l) => ({ productId: l.productId, qty: l.qty, uomId: l.uomId, costSource: l.costSource as CostSource, manualUnitCost: l.unitCost, scrapPct: l.scrapPct, sequence: l.sequence, note: l.note })),
  );
  await tx.update(trialRecipes).set({ currentVersionId: version!.id }).where(eq(trialRecipes.id, input.recipeId));

  return simulateVersionCost(tx, version!.id);
}

export type UpdateVersionInput = {
  batchQty?: string;
  batchUomId?: string | null;
  expectedYieldPct?: string;
  overheadPerBatch?: string;
  overheadPerUnit?: string;
  changeNote?: string | null;
  results?: Record<string, unknown>;
  lines?: TrialLineInput[];
};

const EDITABLE_STATUSES = new Set(['draft', 'testing']);

/** Taslak/test aşamasındaki versiyonu düzenler (satır ekle/çıkar/miktar dahil) ve maliyeti canlı yeniden hesaplar. */
export async function updateVersionDraft(tx: DbOrTx, versionId: string, input: UpdateVersionInput, ctx: ActorCtx): Promise<VersionRollup> {
  const [version] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError('Deneme reçetesi versiyonu', versionId);
  if (!EDITABLE_STATUSES.has(version.status)) throw new ValidationError('Bu versiyon düzenlenemez (onaylanmış/reddedilmiş/devrolmuş) — yeni versiyon oluşturun');

  const set: Partial<typeof trialRecipeVersions.$inferInsert> = { updatedBy: ctx.userId ?? null };
  if (input.batchQty !== undefined) set.batchQty = input.batchQty;
  if (input.batchUomId !== undefined) set.batchUomId = input.batchUomId;
  if (input.expectedYieldPct !== undefined) set.expectedYieldPct = input.expectedYieldPct;
  if (input.overheadPerBatch !== undefined) set.overheadPerBatch = input.overheadPerBatch;
  if (input.overheadPerUnit !== undefined) set.overheadPerUnit = input.overheadPerUnit;
  if (input.changeNote !== undefined) set.changeNote = input.changeNote;
  if (input.results !== undefined) set.results = input.results;
  if (Object.keys(set).length > 1) await tx.update(trialRecipeVersions).set(set).where(eq(trialRecipeVersions.id, versionId));

  if (input.lines) {
    await tx.delete(trialRecipeLines).where(eq(trialRecipeLines.versionId, versionId));
    await insertLines(tx, versionId, input.lines);
  }

  return simulateVersionCost(tx, versionId);
}

export async function getVersionRollup(tx: DbOrTx, versionId: string): Promise<VersionRollup> {
  const [version] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError('Deneme reçetesi versiyonu', versionId);
  const rows = await loadLinesWithProduct(tx, versionId);
  const computation = computeTrialCost({
    batchQty: D(version.batchQty),
    expectedYieldPct: D(version.expectedYieldPct),
    overheadPerBatch: D(version.overheadPerBatch),
    overheadPerUnit: D(version.overheadPerUnit),
    lines: rows.map((r) => ({ qty: D(r.line.qty), unitCost: D(r.line.unitCost), scrapPct: D(r.line.scrapPct) })),
  });
  const lines = rows.map((r, i) => ({ ...r.line, sku: r.sku, name: r.name, lineCost: toDb(computation.lineCosts[i]!) }));
  return { version, lines, materialCost: toDb(computation.materialCost), unitCost: toDb(computation.unitCost), effectiveOutputQty: toDb(computation.effectiveOutputQty) };
}

/* ==================================================================== */
/* Onay + üretim BOM'una devir                                          */
/* ==================================================================== */

export async function submitForApproval(tx: DbOrTx, versionId: string, ctx: ActorCtx): Promise<{ version: VersionRow; approvalId: string }> {
  const [version] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError('Deneme reçetesi versiyonu', versionId);
  if (!EDITABLE_STATUSES.has(version.status)) throw new ValidationError('Yalnızca taslak/test aşamasındaki versiyonlar onaya gönderilebilir');

  const [existingPending] = await tx.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.refTable, 'trial_recipe_versions'), eq(approvals.refId, versionId), eq(approvals.status, 'pending'))).limit(1);
  if (existingPending) throw new ValidationError('Bu versiyon için zaten bekleyen bir onay var');

  const [recipe] = await tx.select({ name: trialRecipes.name }).from(trialRecipes).where(eq(trialRecipes.id, version.recipeId)).limit(1);

  const [approval] = await tx
    .insert(approvals)
    .values({
      kind: 'recipe_release',
      refTable: 'trial_recipe_versions',
      refId: versionId,
      title: `Reçete devri onayı — ${recipe?.name ?? 'Deneme reçetesi'} v${version.version}`,
      summary: `Birim maliyet ${version.unitCost} ₺ — parti ${version.batchQty}, verim %${version.expectedYieldPct}`,
      payload: { recipeId: version.recipeId, versionId, unitCost: version.unitCost, version: version.version },
      requestedBy: ctx.userId,
    })
    .returning();

  const [updated] = await tx.update(trialRecipeVersions).set({ status: 'testing', approvalId: approval!.id, updatedBy: ctx.userId ?? null }).where(eq(trialRecipeVersions.id, versionId)).returning();
  await writeAudit(tx, { action: 'other', tableName: 'trial_recipe_versions', recordId: versionId, summary: `Reçete versiyonu onaya gönderildi: v${version.version}` }, ctx);
  return { version: updated!, approvalId: approval!.id };
}

/** Onay merkezi (`packages/core/src/notifications/approvals/dispatch.ts`, kind='recipe_release') buradan çağırır. */
export async function approveRecipeRelease(tx: DbOrTx, approvalId: string, ctx: ActorCtx): Promise<void> {
  const [approval] = await tx.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!approval) throw new NotFoundError('Onay kaydı', approvalId);
  await tx.update(trialRecipeVersions).set({ status: 'approved', updatedBy: ctx.userId ?? null }).where(eq(trialRecipeVersions.id, approval.refId));
  await tx.update(approvals).set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(approvals.id, approvalId));
  await writeAudit(tx, { action: 'approve', tableName: 'trial_recipe_versions', recordId: approval.refId, summary: 'Reçete devri onaylandı — üretim BOM\'una devredilebilir' }, ctx);
}

export async function rejectRecipeRelease(tx: DbOrTx, approvalId: string, reason: string | null, ctx: ActorCtx): Promise<void> {
  const [approval] = await tx.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
  if (!approval) throw new NotFoundError('Onay kaydı', approvalId);
  await tx.update(trialRecipeVersions).set({ status: 'rejected', updatedBy: ctx.userId ?? null }).where(eq(trialRecipeVersions.id, approval.refId));
  await tx.update(approvals).set({ status: 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: reason }).where(eq(approvals.id, approvalId));
  await writeAudit(tx, { action: 'reject', tableName: 'trial_recipe_versions', recordId: approval.refId, summary: `Reçete devri reddedildi${reason ? `: ${reason}` : ''}` }, ctx);
}

export class NoProductLinkedError extends DomainError {
  constructor(projectId: string) {
    super('RND_NO_PRODUCT', 'Proje bir ürüne bağlı değil — önce Ana Veri sihirbazından SKU oluşturun ya da mevcut bir ürünü projeye bağlayın.', { projectId });
  }
}

/** "Üretim BOM'una devret" — tek tık: yeni BOM versiyonu (satırlar kopya) + `sourceTrialVersionId` + aktifleştirme. */
export async function releaseToBom(tx: DbOrTx, versionId: string, opts: { activate?: boolean } = {}, ctx: ActorCtx): Promise<{ bomId: string; bomCode: string }> {
  const [version] = await tx.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.id, versionId)).limit(1);
  if (!version) throw new NotFoundError('Deneme reçetesi versiyonu', versionId);
  if (version.status !== 'approved') throw new ValidationError('Yalnızca onaylanmış versiyonlar üretim BOM\'una devredilebilir');

  const [recipe] = await tx.select().from(trialRecipes).where(eq(trialRecipes.id, version.recipeId)).limit(1);
  if (!recipe) throw new NotFoundError('Deneme reçetesi', version.recipeId);
  const [project] = await tx.select().from(rndProjects).where(eq(rndProjects.id, recipe.projectId)).limit(1);
  if (!project) throw new NotFoundError('Proje', recipe.projectId);
  if (!project.productId) throw new NoProductLinkedError(project.id);

  const lines = await tx.select().from(trialRecipeLines).where(eq(trialRecipeLines.versionId, versionId)).orderBy(trialRecipeLines.sequence);
  if (lines.length === 0) throw new ValidationError('Reçetede satır yok');

  const bom = await createBomVersion(tx, {
    productId: project.productId,
    name: `${recipe.name} (Ar-Ge v${version.version})`,
    outputQty: version.batchQty,
    outputUomId: version.batchUomId ?? undefined,
    expectedYieldPct: version.expectedYieldPct,
    overheadPerBatch: version.overheadPerBatch,
    overheadPerUnit: version.overheadPerUnit,
    note: version.changeNote ? `Ar-Ge devri: ${recipe.name} v${version.version} — ${version.changeNote}` : `Ar-Ge devri: ${recipe.name} v${version.version}`,
    lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, uomId: l.uomId, scrapPct: l.scrapPct, sequence: l.sequence, note: l.note })),
  });

  await tx.update(boms).set({ sourceTrialVersionId: version.id }).where(eq(boms.id, bom.id));
  if (opts.activate !== false) await activateBom(tx, bom.id);

  await tx
    .update(trialRecipeVersions)
    .set({ status: 'released', releasedBomId: bom.id, releasedAt: new Date(), releasedBy: ctx.userId, updatedBy: ctx.userId ?? null })
    .where(eq(trialRecipeVersions.id, versionId));

  await writeAudit(tx, { action: 'other', tableName: 'boms', recordId: bom.id, summary: `Ar-Ge reçetesi üretim BOM'una devredildi: ${bom.code} (kaynak: ${recipe.name} v${version.version})` }, ctx);

  return { bomId: bom.id, bomCode: bom.code };
}
