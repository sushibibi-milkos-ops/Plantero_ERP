'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import {
  createColumn, renameColumn, setColumnWipLimit, setColumnDone, deleteColumn, reorderColumns,
  createCard, updateCard, setCardArchived, updateChecklist, addComment, addAttachment, linkTrialVersion, moveCard,
} from '@plantero/core/rnd/board';
import { createProject, updateProject, linkProductToProject } from '@plantero/core/rnd/projects';
import {
  createTrialRecipe, createNewVersion, updateVersionDraft, submitForApproval, releaseToBom, NoProductLinkedError,
  resolveLineUnitCost, type TrialLineInput,
} from '@plantero/core/rnd/trials';
import { NotFoundError } from '@plantero/core/auth/errors';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';
import { getCardDetail, getVersionDetail } from './queries';

function revalidateProject(projectId: string) {
  revalidatePath('/arge/projeler');
  revalidatePath(`/arge/projeler/${projectId}/board`);
  revalidatePath(`/arge/projeler/${projectId}/receteler`);
  revalidatePath('/arge/receteler');
}

/* ==================================================================== */
/* Projeler                                                              */
/* ==================================================================== */

const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Proje adı gerekli'),
  productId: z.string().uuid().optional().nullable(),
  targetSku: z.string().trim().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  goal: z.string().trim().optional().nullable(),
  targetUnitCost: z.string().optional().nullable(),
  targetLaunchDate: z.string().optional().nullable(),
  columns: z.array(z.object({ name: z.string().trim().min(1), wipLimit: z.number().int().min(1).optional().nullable() })).optional(),
});

export const createProjectAction = withAudit('rnd.createProject', async (raw: z.infer<typeof createProjectSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = createProjectSchema.parse(raw);
  const project = await db.transaction((tx) => createProject(tx, input, user.actor));
  revalidatePath('/arge/projeler');
  return { data: { id: project.id, code: project.code }, audit: { action: 'create', tableName: 'rnd_projects', recordId: project.id, summary: `Ar-Ge projesi oluşturuldu: ${project.code} — ${project.name}` } };
});

const updateProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).optional(),
  status: z.enum(['idea', 'active', 'on_hold', 'completed', 'cancelled']).optional(),
  productId: z.string().uuid().optional().nullable(),
  targetSku: z.string().trim().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  goal: z.string().trim().optional().nullable(),
  targetUnitCost: z.string().optional().nullable(),
  targetLaunchDate: z.string().optional().nullable(),
});

export const updateProjectAction = withAudit('rnd.updateProject', async (raw: z.infer<typeof updateProjectSchema>) => {
  const user = await requirePermission('rnd.manage');
  const { id, ...patch } = updateProjectSchema.parse(raw);
  const project = await db.transaction((tx) => updateProject(tx, id, patch, user.actor));
  revalidateProject(id);
  return { data: { id: project.id }, audit: { action: 'update', tableName: 'rnd_projects', recordId: id, summary: `Proje güncellendi: ${project.name}` } };
});

const linkProductSchema = z.object({ projectId: z.string().uuid(), productId: z.string().uuid() });

export const linkProductToProjectAction = withAudit('rnd.linkProduct', async (raw: z.infer<typeof linkProductSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = linkProductSchema.parse(raw);
  await db.transaction((tx) => linkProductToProject(tx, input.projectId, input.productId, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: 'update', tableName: 'rnd_projects', recordId: input.projectId, summary: 'Proje bir ürüne bağlandı' } };
});

/* ==================================================================== */
/* Board — kolonlar                                                      */
/* ==================================================================== */

const createColumnSchema = z.object({ projectId: z.string().uuid(), name: z.string().trim().min(1, 'Kolon adı gerekli'), wipLimit: z.number().int().min(1).optional().nullable() });

export const createColumnAction = withAudit('rnd.createColumn', async (raw: z.infer<typeof createColumnSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = createColumnSchema.parse(raw);
  const col = await db.transaction((tx) => createColumn(tx, input, user.actor));
  revalidateProject(input.projectId);
  return { data: { id: col.id }, audit: { action: 'create', tableName: 'rnd_board_columns', recordId: col.id, summary: `Kolon eklendi: ${col.name}` } };
});

const renameColumnSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), name: z.string().trim().min(1, 'Kolon adı gerekli') });

export const renameColumnAction = withAudit('rnd.renameColumn', async (raw: z.infer<typeof renameColumnSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = renameColumnSchema.parse(raw);
  const col = await db.transaction((tx) => renameColumn(tx, input.id, input.name, user.actor));
  revalidateProject(input.projectId);
  return { data: { id: col.id }, audit: { action: 'update', tableName: 'rnd_board_columns', recordId: col.id, summary: `Kolon yeniden adlandırıldı: ${col.name}` } };
});

const wipLimitSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), wipLimit: z.number().int().min(1).nullable() });

export const setColumnWipLimitAction = withAudit('rnd.setColumnWipLimit', async (raw: z.infer<typeof wipLimitSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = wipLimitSchema.parse(raw);
  const col = await db.transaction((tx) => setColumnWipLimit(tx, input.id, input.wipLimit, user.actor));
  revalidateProject(input.projectId);
  return { data: { id: col.id }, audit: { action: 'update', tableName: 'rnd_board_columns', recordId: col.id, summary: `WIP limiti değişti: ${col.name} → ${col.wipLimit ?? 'yok'}` } };
});

const columnDoneSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), isDone: z.boolean() });

export const setColumnDoneAction = withAudit('rnd.setColumnDone', async (raw: z.infer<typeof columnDoneSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = columnDoneSchema.parse(raw);
  const col = await db.transaction((tx) => setColumnDone(tx, input.id, input.isDone, user.actor));
  revalidateProject(input.projectId);
  return { data: { id: col.id }, audit: { action: 'update', tableName: 'rnd_board_columns', recordId: col.id, summary: `"Tamamlandı" işareti: ${col.name} → ${col.isDone}` } };
});

const deleteColumnSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid() });

export const deleteColumnAction = withAudit('rnd.deleteColumn', async (raw: z.infer<typeof deleteColumnSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = deleteColumnSchema.parse(raw);
  await db.transaction((tx) => deleteColumn(tx, input.id, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: 'delete', tableName: 'rnd_board_columns', recordId: input.id, summary: 'Kolon silindi' } };
});

const reorderColumnsSchema = z.object({ projectId: z.string().uuid(), orderedColumnIds: z.array(z.string().uuid()).min(1) });

export const reorderColumnsAction = withAudit('rnd.reorderColumns', async (raw: z.infer<typeof reorderColumnsSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = reorderColumnsSchema.parse(raw);
  await db.transaction((tx) => reorderColumns(tx, input.projectId, input.orderedColumnIds, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: 'update', tableName: 'rnd_board_columns', summary: 'Kolon sırası değişti' } };
});

/* ==================================================================== */
/* Board — kartlar                                                       */
/* ==================================================================== */

const createCardSchema = z.object({
  projectId: z.string().uuid(), columnId: z.string().uuid(), title: z.string().trim().min(1, 'Başlık gerekli'),
  description: z.string().trim().optional().nullable(), assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(), labels: z.array(z.string()).optional(),
});

export const createCardAction = withAudit('rnd.createCard', async (raw: z.infer<typeof createCardSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = createCardSchema.parse(raw);
  const card = await db.transaction((tx) => createCard(tx, input, user.actor));
  revalidateProject(input.projectId);
  return { data: { id: card.id }, audit: { action: 'create', tableName: 'rnd_cards', recordId: card.id, summary: `Kart oluşturuldu: ${card.title}` } };
});

const updateCardSchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(), assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(), labels: z.array(z.string()).optional(),
});

export const updateCardAction = withAudit('rnd.updateCard', async (raw: z.infer<typeof updateCardSchema>) => {
  const user = await requirePermission('rnd.manage');
  const { id, projectId, ...patch } = updateCardSchema.parse(raw);
  const card = await db.transaction((tx) => updateCard(tx, id, patch, user.actor));
  revalidateProject(projectId);
  return { data: { id: card.id }, audit: { action: 'update', tableName: 'rnd_cards', recordId: id, summary: `Kart güncellendi: ${card.title}` } };
});

const archiveCardSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), isArchived: z.boolean() });

export const setCardArchivedAction = withAudit('rnd.setCardArchived', async (raw: z.infer<typeof archiveCardSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = archiveCardSchema.parse(raw);
  await db.transaction((tx) => setCardArchived(tx, input.id, input.isArchived, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: input.isArchived ? 'delete' : 'update', tableName: 'rnd_cards', recordId: input.id, summary: input.isArchived ? 'Kart arşivlendi' : 'Kart arşivden çıkarıldı' } };
});

const moveCardSchema = z.object({ cardId: z.string().uuid(), projectId: z.string().uuid(), toColumnId: z.string().uuid(), toIndex: z.number().int().min(0) });

export const moveCardAction = withAudit('rnd.moveCard', async (raw: z.infer<typeof moveCardSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = moveCardSchema.parse(raw);
  const card = await db.transaction((tx) => moveCard(tx, input, user.actor));
  revalidatePath(`/arge/projeler/${input.projectId}/board`);
  return { data: { id: card.id, columnId: card.columnId, position: card.position }, audit: { action: 'update', tableName: 'rnd_cards', recordId: card.id, summary: `Kart taşındı: ${card.title}` } };
});

const checklistSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid(), checklist: z.array(z.object({ text: z.string(), done: z.boolean() })) });

export const updateChecklistAction = withAudit('rnd.updateChecklist', async (raw: z.infer<typeof checklistSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = checklistSchema.parse(raw);
  await db.transaction((tx) => updateChecklist(tx, input.id, input.checklist, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: 'update', tableName: 'rnd_cards', recordId: input.id, summary: 'Kontrol listesi güncellendi' } };
});

const addCommentSchema = z.object({ cardId: z.string().uuid(), projectId: z.string().uuid(), body: z.string().trim().min(1, 'Yorum boş olamaz') });

export const addCommentAction = withAudit('rnd.addComment', async (raw: z.infer<typeof addCommentSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = addCommentSchema.parse(raw);
  await db.transaction((tx) => addComment(tx, { cardId: input.cardId, body: input.body }, user.actor));
  revalidatePath(`/arge/projeler/${input.projectId}/board`);
  return { data: { ok: true }, audit: { action: 'create', tableName: 'rnd_card_comments', recordId: input.cardId, summary: 'Yorum eklendi' } };
});

const addAttachmentSchema = z.object({
  cardId: z.string().uuid(), projectId: z.string().uuid(), fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1), dataUrl: z.string().startsWith('data:'),
});

export const addAttachmentAction = withAudit('rnd.addAttachment', async (raw: z.infer<typeof addAttachmentSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = addAttachmentSchema.parse(raw);
  await db.transaction((tx) => addAttachment(tx, input, user.actor));
  revalidatePath(`/arge/projeler/${input.projectId}/board`);
  return { data: { ok: true }, audit: { action: 'create', tableName: 'rnd_card_comments', recordId: input.cardId, summary: `Ek eklendi: ${input.fileName}` } };
});

const linkTrialVersionSchema = z.object({ cardId: z.string().uuid(), projectId: z.string().uuid(), trialVersionId: z.string().uuid().nullable() });

export const linkTrialVersionAction = withAudit('rnd.linkTrialVersion', async (raw: z.infer<typeof linkTrialVersionSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = linkTrialVersionSchema.parse(raw);
  await db.transaction((tx) => linkTrialVersion(tx, input.cardId, input.trialVersionId, user.actor));
  revalidateProject(input.projectId);
  return { data: { ok: true }, audit: { action: 'update', tableName: 'rnd_cards', recordId: input.cardId, summary: 'Kart deneme reçetesine bağlandı' } };
});

const cardIdSchema = z.object({ id: z.string().uuid() });

export const getCardDetailAction = withAudit('rnd.getCardDetail', async (raw: z.infer<typeof cardIdSchema>) => {
  await requirePermission('rnd.view');
  const input = cardIdSchema.parse(raw);
  const detail = await getCardDetail(input.id);
  if (!detail) throw new NotFoundError('Kart', input.id);
  return { data: detail };
});

/* ==================================================================== */
/* Deneme reçeteleri + canlı maliyet simülasyonu                        */
/* ==================================================================== */

const costSourceEnum = z.enum(['average', 'last_purchase', 'manual']);

const resolveLineCostSchema = z.object({ productId: z.string().uuid(), costSource: costSourceEnum, manualUnitCost: z.string().optional().nullable() });

/** Satıra ürün seçildiğinde/maliyet kaynağı değiştirildiğinde tek satırlık canlı çözüm — client tarafı
 *  daha sonra miktar/fire değiştikçe bu değeri sunucuya gitmeden `computeTrialCost` ile çarpar. */
export const resolveLineCostAction = withAudit('rnd.resolveLineCost', async (raw: z.infer<typeof resolveLineCostSchema>) => {
  await requirePermission('rnd.view');
  const input = resolveLineCostSchema.parse(raw);
  const resolved = await resolveLineUnitCost(db, input.productId, input.costSource, input.manualUnitCost);
  return { data: { unitCost: resolved.unitCost.toFixed(4), resolvedSource: resolved.resolvedSource } };
});

const lineInputSchema = z.object({
  productId: z.string().uuid(), qty: z.string().min(1), uomId: z.string().uuid(), costSource: costSourceEnum,
  manualUnitCost: z.string().optional().nullable(), scrapPct: z.string().optional(), sequence: z.number().int().optional(), note: z.string().optional().nullable(),
}) satisfies z.ZodType<TrialLineInput>;

const createRecipeSchema = z.object({
  projectId: z.string().uuid(), name: z.string().trim().min(1, 'Reçete adı gerekli'), lines: z.array(lineInputSchema).min(1, 'En az bir satır gerekli'),
  batchQty: z.string().optional(), batchUomId: z.string().uuid().optional().nullable(), expectedYieldPct: z.string().optional(),
  overheadPerBatch: z.string().optional(), overheadPerUnit: z.string().optional(), changeNote: z.string().optional().nullable(),
});

export const createTrialRecipeAction = withAudit('rnd.createTrialRecipe', async (raw: z.infer<typeof createRecipeSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = createRecipeSchema.parse(raw);
  const { recipe, rollup } = await db.transaction((tx) => createTrialRecipe(tx, input, user.actor));
  revalidateProject(input.projectId);
  return { data: { recipeId: recipe.id, versionId: rollup.version.id }, audit: { action: 'create', tableName: 'trial_recipes', recordId: recipe.id, summary: `Deneme reçetesi oluşturuldu: ${recipe.name}` } };
});

const createVersionSchema = z.object({ projectId: z.string().uuid(), recipeId: z.string().uuid(), copyFromVersionId: z.string().uuid().optional(), changeNote: z.string().optional().nullable() });

export const createNewVersionAction = withAudit('rnd.createNewVersion', async (raw: z.infer<typeof createVersionSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = createVersionSchema.parse(raw);
  const rollup = await db.transaction((tx) => createNewVersion(tx, input, user.actor));
  revalidateProject(input.projectId);
  return { data: { versionId: rollup.version.id, version: rollup.version.version }, audit: { action: 'create', tableName: 'trial_recipe_versions', recordId: rollup.version.id, summary: `Yeni versiyon oluşturuldu: v${rollup.version.version}` } };
});

const updateVersionSchema = z.object({
  versionId: z.string().uuid(), projectId: z.string().uuid(), batchQty: z.string().optional(), batchUomId: z.string().uuid().optional().nullable(),
  expectedYieldPct: z.string().optional(), overheadPerBatch: z.string().optional(), overheadPerUnit: z.string().optional(),
  changeNote: z.string().optional().nullable(), results: z.record(z.string(), z.unknown()).optional(), lines: z.array(lineInputSchema).optional(),
});

export const updateVersionDraftAction = withAudit('rnd.updateVersionDraft', async (raw: z.infer<typeof updateVersionSchema>) => {
  const user = await requirePermission('rnd.manage');
  const { versionId, projectId, ...patch } = updateVersionSchema.parse(raw);
  const rollup = await db.transaction((tx) => updateVersionDraft(tx, versionId, patch, user.actor));
  revalidateProject(projectId);
  return { data: { unitCost: rollup.unitCost, materialCost: rollup.materialCost, lines: rollup.lines }, audit: { action: 'update', tableName: 'trial_recipe_versions', recordId: versionId, summary: 'Versiyon güncellendi (maliyet yeniden hesaplandı)' } };
});

const versionIdSchema = z.object({ versionId: z.string().uuid(), projectId: z.string().uuid() });

export const getVersionDetailAction = withAudit('rnd.getVersionDetail', async (raw: { versionId: string }) => {
  await requirePermission('rnd.view');
  const input = z.object({ versionId: z.string().uuid() }).parse(raw);
  const detail = await getVersionDetail(input.versionId);
  if (!detail) throw new NotFoundError('Deneme reçetesi versiyonu', input.versionId);
  return { data: detail };
});

export const submitForApprovalAction = withAudit('rnd.submitForApproval', async (raw: z.infer<typeof versionIdSchema>) => {
  const user = await requirePermission('rnd.manage');
  const input = versionIdSchema.parse(raw);
  const { version } = await db.transaction((tx) => submitForApproval(tx, input.versionId, user.actor));
  revalidateProject(input.projectId);
  revalidatePath('/onaylar');
  return { data: { status: version.status }, audit: { action: 'other', tableName: 'trial_recipe_versions', recordId: input.versionId, summary: `Versiyon onaya gönderildi: v${version.version}` } };
});

export type ReleaseToBomResult = { released: true; bomId: string; bomCode: string } | { released: false; reason: 'no_product' };

export const releaseToBomAction = withAudit('rnd.releaseToBom', async (raw: z.infer<typeof versionIdSchema>): Promise<{ data: ReleaseToBomResult; audit?: { action: 'other'; tableName: string; recordId: string; summary: string } }> => {
  const user = await requirePermission('rnd.release');
  const input = versionIdSchema.parse(raw);
  try {
    const result = await db.transaction((tx) => releaseToBom(tx, input.versionId, { activate: true }, user.actor));
    revalidateProject(input.projectId);
    revalidatePath('/uretim/is-emirleri');
    return { data: { released: true, bomId: result.bomId, bomCode: result.bomCode }, audit: { action: 'other', tableName: 'boms', recordId: result.bomId, summary: `Ar-Ge reçetesi üretim BOM'una devredildi: ${result.bomCode}` } };
  } catch (err) {
    if (err instanceof NoProductLinkedError) {
      return { data: { released: false, reason: 'no_product' } };
    }
    throw err;
  }
});
