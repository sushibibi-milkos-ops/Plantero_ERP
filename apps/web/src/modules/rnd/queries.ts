import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { getVersionRollup, type CostSource } from '@plantero/core/rnd/trials';
import { listCardActivity, ATTACHMENT_MARKER } from '@plantero/core/rnd/board';
import { D, toDb } from '@plantero/core/money';

const {
  rndProjects, rndBoardColumns, rndCards, trialRecipes, trialRecipeVersions, trialRecipeLines,
  products, uoms, users, approvals, boms,
} = schema;

/* ==================================================================== */
/* Ortak seçim listeleri                                                */
/* ==================================================================== */

export async function listUomOptions() {
  return db.select({ id: uoms.id, code: uoms.code, name: uoms.name }).from(uoms).orderBy(asc(uoms.code));
}

export async function listUserOptions() {
  return db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.fullName));
}

export type ProductOption = { id: string; sku: string; name: string; uomId: string; uomCode: string; type: string; averageCost: string };

export async function listProductOptions(): Promise<ProductOption[]> {
  const rows = await db
    .select({ id: products.id, sku: products.sku, name: products.name, uomId: products.uomId, uomCode: uoms.code, type: products.type, averageCost: products.averageCost })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .where(eq(products.status, 'active'))
    .orderBy(asc(products.name));
  return rows;
}

/** Manufactured (üretilebilir) ürünler — proje SKU bağlama seçicisi. */
export async function listManufacturableProductOptions(): Promise<ProductOption[]> {
  const rows = await listProductOptions();
  return rows.filter((r) => r.type === 'finished' || r.type === 'semi_finished');
}

/* ==================================================================== */
/* /arge/projeler                                                        */
/* ==================================================================== */

export type ProjectRow = {
  id: string; code: string; name: string; status: string; targetSku: string | null; productId: string | null; productSku: string | null; productName: string | null;
  ownerName: string | null; targetUnitCost: string | null; targetLaunchDate: string | null; currentUnitCost: string | null; goal: string | null;
  cardCount: number; columnCount: number; createdAt: Date;
};

export async function listProjects(): Promise<ProjectRow[]> {
  const rows = await db
    .select({
      p: rndProjects,
      productSku: products.sku,
      productName: products.name,
      ownerName: users.fullName,
      currentUnitCost: trialRecipeVersions.unitCost,
    })
    .from(rndProjects)
    .leftJoin(products, eq(products.id, rndProjects.productId))
    .leftJoin(users, eq(users.id, rndProjects.ownerId))
    .leftJoin(trialRecipes, eq(trialRecipes.projectId, rndProjects.id))
    .leftJoin(trialRecipeVersions, eq(trialRecipeVersions.id, trialRecipes.currentVersionId))
    .orderBy(desc(rndProjects.createdAt));

  // Proje başına birden fazla reçete olabilir — en güncel (updatedAt) reçetenin mevcut versiyon maliyeti gösterilir.
  const byProject = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const existing = byProject.get(r.p.id);
    if (!existing || (r.currentUnitCost != null && existing.currentUnitCost == null)) byProject.set(r.p.id, r);
  }

  const projectIds = [...byProject.keys()];
  const cardCounts = projectIds.length
    ? await db.select({ projectId: rndCards.projectId, count: sql<number>`count(*)::int` }).from(rndCards).where(and(inArray(rndCards.projectId, projectIds), eq(rndCards.isArchived, false))).groupBy(rndCards.projectId)
    : [];
  const columnCounts = projectIds.length
    ? await db.select({ projectId: rndBoardColumns.projectId, count: sql<number>`count(*)::int` }).from(rndBoardColumns).where(inArray(rndBoardColumns.projectId, projectIds)).groupBy(rndBoardColumns.projectId)
    : [];
  const cardByProject = new Map(cardCounts.map((c) => [c.projectId, c.count]));
  const colByProject = new Map(columnCounts.map((c) => [c.projectId, c.count]));

  return [...byProject.values()].map((r) => ({
    id: r.p.id, code: r.p.code, name: r.p.name, status: r.p.status, targetSku: r.p.targetSku,
    productId: r.p.productId, productSku: r.productSku, productName: r.productName, ownerName: r.ownerName,
    targetUnitCost: r.p.targetUnitCost, targetLaunchDate: r.p.targetLaunchDate, currentUnitCost: r.currentUnitCost,
    goal: r.p.goal, cardCount: cardByProject.get(r.p.id) ?? 0, columnCount: colByProject.get(r.p.id) ?? 0, createdAt: r.p.createdAt,
  }));
}

export async function getProject(id: string) {
  const [row] = await db
    .select({ p: rndProjects, productSku: products.sku, productName: products.name, ownerName: users.fullName })
    .from(rndProjects)
    .leftJoin(products, eq(products.id, rndProjects.productId))
    .leftJoin(users, eq(users.id, rndProjects.ownerId))
    .where(eq(rndProjects.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.p, productSku: row.productSku, productName: row.productName, ownerName: row.ownerName };
}

/* ==================================================================== */
/* /arge/projeler/[id]/board — Kanban                                    */
/* ==================================================================== */

export type BoardCardRow = {
  id: string; columnId: string; title: string; description: string | null; position: number;
  assigneeId: string | null; assigneeName: string | null; dueDate: string | null; labels: string[];
  checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number;
  trialVersionId: string | null; trialVersionLabel: string | null; isArchived: boolean;
};

export type BoardColumnRow = typeof rndBoardColumns.$inferSelect;

export async function getBoard(projectId: string): Promise<{ columns: BoardColumnRow[]; cards: BoardCardRow[] }> {
  const columns = await db.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, projectId)).orderBy(asc(rndBoardColumns.position));
  const cardRows = await db
    .select({ c: rndCards, assigneeName: users.fullName, recipeName: trialRecipes.name, version: trialRecipeVersions.version })
    .from(rndCards)
    .leftJoin(users, eq(users.id, rndCards.assigneeId))
    .leftJoin(trialRecipeVersions, eq(trialRecipeVersions.id, rndCards.trialVersionId))
    .leftJoin(trialRecipes, eq(trialRecipes.id, trialRecipeVersions.recipeId))
    .where(and(eq(rndCards.projectId, projectId), eq(rndCards.isArchived, false)))
    .orderBy(asc(rndCards.position));

  const cardIds = cardRows.map((r) => r.c.id);
  const commentCounts = cardIds.length
    ? await db
        .select({ cardId: schema.rndCardComments.cardId, count: sql<number>`count(*)::int`, attachCount: sql<number>`count(*) filter (where ${schema.rndCardComments.body} like ${`${ATTACHMENT_MARKER}%`})::int` })
        .from(schema.rndCardComments)
        .where(inArray(schema.rndCardComments.cardId, cardIds))
        .groupBy(schema.rndCardComments.cardId)
    : [];
  const commentByCard = new Map(commentCounts.map((c) => [c.cardId, c]));

  const cards: BoardCardRow[] = cardRows.map((r) => {
    const checklist = (r.c.checklist ?? []) as Array<{ text: string; done: boolean }>;
    const counts = commentByCard.get(r.c.id);
    const total = counts?.count ?? 0;
    const attach = counts?.attachCount ?? 0;
    return {
      id: r.c.id, columnId: r.c.columnId, title: r.c.title, description: r.c.description, position: r.c.position,
      assigneeId: r.c.assigneeId, assigneeName: r.assigneeName, dueDate: r.c.dueDate, labels: r.c.labels ?? [],
      checklistDone: checklist.filter((i) => i.done).length, checklistTotal: checklist.length,
      commentCount: total - attach, attachmentCount: attach,
      trialVersionId: r.c.trialVersionId, trialVersionLabel: r.recipeName ? `${r.recipeName} v${r.version}` : null,
      isArchived: r.c.isArchived,
    };
  });

  return { columns, cards };
}

export type CardActivityItem =
  | { kind: 'comment'; id: string; userName: string | null; body: string; createdAt: Date }
  | { kind: 'attachment'; id: string; userName: string | null; fileName: string; mimeType: string; dataUrl: string; size: number; createdAt: Date };

export type CardDetail = {
  card: typeof rndCards.$inferSelect;
  assigneeName: string | null;
  trialVersionLabel: string | null;
  activity: CardActivityItem[];
};

export async function getCardDetail(cardId: string): Promise<CardDetail | null> {
  const [row] = await db
    .select({ c: rndCards, assigneeName: users.fullName, recipeName: trialRecipes.name, version: trialRecipeVersions.version })
    .from(rndCards)
    .leftJoin(users, eq(users.id, rndCards.assigneeId))
    .leftJoin(trialRecipeVersions, eq(trialRecipeVersions.id, rndCards.trialVersionId))
    .leftJoin(trialRecipes, eq(trialRecipes.id, trialRecipeVersions.recipeId))
    .where(eq(rndCards.id, cardId))
    .limit(1);
  if (!row) return null;

  const parsed = await listCardActivity(db, cardId);
  const userIds = [...new Set(parsed.map((p) => p.userId).filter((v): v is string => Boolean(v)))];
  const userRows = userIds.length ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds)) : [];
  const nameById = new Map(userRows.map((u) => [u.id, u.fullName]));

  const activity: CardActivityItem[] = parsed.map((p) =>
    p.kind === 'comment'
      ? { kind: 'comment', id: p.id, userName: p.userId ? (nameById.get(p.userId) ?? null) : null, body: p.body, createdAt: p.createdAt }
      : { kind: 'attachment', id: p.id, userName: p.userId ? (nameById.get(p.userId) ?? null) : null, fileName: p.attachment.fileName, mimeType: p.attachment.mimeType, dataUrl: p.attachment.dataUrl, size: p.attachment.size, createdAt: p.createdAt },
  );

  return {
    card: row.c, assigneeName: row.assigneeName,
    trialVersionLabel: row.recipeName ? `${row.recipeName} v${row.version}` : null,
    activity,
  };
}

/* ==================================================================== */
/* /arge/projeler/[id]/receteler + /arge/receteler                       */
/* ==================================================================== */

export type RecipeSummaryRow = {
  id: string; name: string; projectId: string; projectName: string; currentVersionId: string | null;
  versionCount: number; latestVersion: number | null; latestStatus: string | null; latestUnitCost: string | null;
  releasedBomCode: string | null;
};

export async function listRecipesForProject(projectId: string): Promise<RecipeSummaryRow[]> {
  const rows = await db
    .select({ r: trialRecipes, projectName: rndProjects.name, projectId2: rndProjects.id })
    .from(trialRecipes)
    .innerJoin(rndProjects, eq(rndProjects.id, trialRecipes.projectId))
    .where(eq(trialRecipes.projectId, projectId))
    .orderBy(desc(trialRecipes.updatedAt));
  return assembleRecipeSummaries(rows);
}

export async function listAllRecipes(): Promise<RecipeSummaryRow[]> {
  const rows = await db
    .select({ r: trialRecipes, projectName: rndProjects.name, projectId2: rndProjects.id })
    .from(trialRecipes)
    .innerJoin(rndProjects, eq(rndProjects.id, trialRecipes.projectId))
    .orderBy(desc(trialRecipes.updatedAt));
  return assembleRecipeSummaries(rows);
}

async function assembleRecipeSummaries(recipes: Array<{ r: typeof trialRecipes.$inferSelect; projectName: string; projectId2: string }>): Promise<RecipeSummaryRow[]> {
  if (recipes.length === 0) return [];

  const recipeIds = recipes.map((r) => r.r.id);
  const versions = await db.select().from(trialRecipeVersions).where(inArray(trialRecipeVersions.recipeId, recipeIds)).orderBy(desc(trialRecipeVersions.version));
  const versionsByRecipe = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = versionsByRecipe.get(v.recipeId) ?? [];
    list.push(v);
    versionsByRecipe.set(v.recipeId, list);
  }

  const bomIds = versions.map((v) => v.releasedBomId).filter((v): v is string => Boolean(v));
  const bomRows = bomIds.length ? await db.select({ id: boms.id, code: boms.code }).from(boms).where(inArray(boms.id, bomIds)) : [];
  const bomCodeById = new Map(bomRows.map((b) => [b.id, b.code]));

  return recipes.map((r) => {
    const vs = versionsByRecipe.get(r.r.id) ?? [];
    const current = vs.find((v) => v.id === r.r.currentVersionId) ?? vs[0] ?? null;
    const released = vs.find((v) => v.releasedBomId);
    return {
      id: r.r.id, name: r.r.name, projectId: r.projectId2, projectName: r.projectName, currentVersionId: r.r.currentVersionId,
      versionCount: vs.length, latestVersion: current?.version ?? null, latestStatus: current?.status ?? null, latestUnitCost: current?.unitCost ?? null,
      releasedBomCode: released?.releasedBomId ? (bomCodeById.get(released.releasedBomId) ?? null) : null,
    };
  });
}

export type VersionListItem = { id: string; version: number; status: string; unitCost: string; materialCost: string; changeNote: string | null; createdAt: Date; hasPendingApproval: boolean; releasedBomCode: string | null };

export async function listVersionsForRecipe(recipeId: string): Promise<VersionListItem[]> {
  const versions = await db.select().from(trialRecipeVersions).where(eq(trialRecipeVersions.recipeId, recipeId)).orderBy(desc(trialRecipeVersions.version));
  if (versions.length === 0) return [];
  const versionIds = versions.map((v) => v.id);
  const pending = await db.select({ refId: approvals.refId }).from(approvals).where(and(eq(approvals.refTable, 'trial_recipe_versions'), inArray(approvals.refId, versionIds), eq(approvals.status, 'pending')));
  const pendingSet = new Set(pending.map((p) => p.refId));
  const bomIds = versions.map((v) => v.releasedBomId).filter((v): v is string => Boolean(v));
  const bomRows = bomIds.length ? await db.select({ id: boms.id, code: boms.code }).from(boms).where(inArray(boms.id, bomIds)) : [];
  const bomCodeById = new Map(bomRows.map((b) => [b.id, b.code]));
  return versions.map((v) => ({
    id: v.id, version: v.version, status: v.status, unitCost: v.unitCost, materialCost: v.materialCost, changeNote: v.changeNote,
    createdAt: v.createdAt, hasPendingApproval: pendingSet.has(v.id), releasedBomCode: v.releasedBomId ? (bomCodeById.get(v.releasedBomId) ?? null) : null,
  }));
}

export type VersionDetail = {
  version: typeof trialRecipeVersions.$inferSelect;
  recipeName: string;
  projectId: string;
  projectName: string;
  targetUnitCost: string | null;
  lines: Array<typeof trialRecipeLines.$inferSelect & { sku: string; name: string; uomCode: string; lineCost: string }>;
  materialCost: string;
  unitCost: string;
  effectiveOutputQty: string;
  hasPendingApproval: boolean;
  previousVersion: { version: number; unitCost: string } | null;
};

export async function getVersionDetail(versionId: string): Promise<VersionDetail | null> {
  const rollup = await getVersionRollup(db, versionId);
  const [meta] = await db
    .select({ recipeName: trialRecipes.name, projectId: rndProjects.id, projectName: rndProjects.name, targetUnitCost: rndProjects.targetUnitCost })
    .from(trialRecipeVersions)
    .innerJoin(trialRecipes, eq(trialRecipes.id, trialRecipeVersions.recipeId))
    .innerJoin(rndProjects, eq(rndProjects.id, trialRecipes.projectId))
    .where(eq(trialRecipeVersions.id, versionId))
    .limit(1);
  if (!meta) return null;

  const uomRows = await db.select({ id: uoms.id, code: uoms.code }).from(uoms);
  const uomCodeById = new Map(uomRows.map((u) => [u.id, u.code]));

  const [pending] = await db.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.refTable, 'trial_recipe_versions'), eq(approvals.refId, versionId), eq(approvals.status, 'pending'))).limit(1);

  const [prev] = await db.select({ version: trialRecipeVersions.version, unitCost: trialRecipeVersions.unitCost }).from(trialRecipeVersions).where(and(eq(trialRecipeVersions.recipeId, rollup.version.recipeId), sql`${trialRecipeVersions.version} < ${rollup.version.version}`)).orderBy(desc(trialRecipeVersions.version)).limit(1);

  return {
    version: rollup.version, recipeName: meta.recipeName, projectId: meta.projectId, projectName: meta.projectName, targetUnitCost: meta.targetUnitCost,
    lines: rollup.lines.map((l) => ({ ...l, uomCode: uomCodeById.get(l.uomId) ?? '' })),
    materialCost: rollup.materialCost, unitCost: rollup.unitCost, effectiveOutputQty: rollup.effectiveOutputQty,
    hasPendingApproval: Boolean(pending), previousVersion: prev ?? null,
  };
}

export { D, toDb };
export type { CostSource };
