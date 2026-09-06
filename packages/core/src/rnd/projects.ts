import { desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@plantero/db';
import { rndProjects, rndBoardColumns, products } from '@plantero/db';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import { nextDocNo } from '../sequences.js';
import type { ActorCtx } from '../types.js';
import { createColumn } from './board.js';

/**
 * Ar-Ge projeleri (docs/modules/arge.md §1). Proje oluşturulurken varsayılan Trello şablonu
 * (Fikir / Formülasyon / Pilot Üretim / Duyusal Test / Raf Ömrü / Onay) uygulanır — `columns`
 * verilirse kullanıcı bunu özelleştirmiş demektir (proje kurulurken de özelleştirilebilir; board
 * ekranında sonradan da değişir, bkz. `board.ts`). Son kolon (`Onay`) `isDone=true` işaretlenir.
 */
export const DEFAULT_BOARD_COLUMNS = ['Fikir', 'Formülasyon', 'Pilot Üretim', 'Duyusal Test', 'Raf Ömrü', 'Onay'] as const;

export type CreateProjectInput = {
  name: string;
  status?: 'idea' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  productId?: string | null;
  targetSku?: string | null;
  ownerId?: string | null;
  goal?: string | null;
  targetUnitCost?: string | null;
  targetLaunchDate?: string | null;
  note?: string | null;
  columns?: Array<{ name: string; wipLimit?: number | null }>;
};

export async function createProject(tx: DbOrTx, input: CreateProjectInput, ctx: ActorCtx): Promise<typeof rndProjects.$inferSelect> {
  if (!input.name.trim()) throw new ValidationError('Proje adı gerekli');
  if (input.productId) {
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, input.productId)).limit(1);
    if (!p) throw new NotFoundError('Ürün', input.productId);
  }

  const code = await nextDocNo(tx, 'RD');
  const [project] = await tx
    .insert(rndProjects)
    .values({
      code,
      name: input.name.trim(),
      status: input.status ?? 'active',
      productId: input.productId ?? null,
      targetSku: input.targetSku ?? null,
      ownerId: input.ownerId ?? null,
      goal: input.goal ?? null,
      targetUnitCost: input.targetUnitCost ?? null,
      targetLaunchDate: input.targetLaunchDate ?? null,
      note: input.note ?? null,
      createdBy: ctx.userId ?? null,
      updatedBy: ctx.userId ?? null,
    })
    .returning();

  const columnDefs = input.columns && input.columns.length > 0 ? input.columns : DEFAULT_BOARD_COLUMNS.map((name) => ({ name, wipLimit: null as number | null }));
  for (let i = 0; i < columnDefs.length; i++) {
    const def = columnDefs[i]!;
    const col = await createColumn(tx, { projectId: project!.id, name: def.name, wipLimit: def.wipLimit ?? null }, ctx);
    if (i === columnDefs.length - 1) {
      await tx.update(rndBoardColumns).set({ isDone: true }).where(eq(rndBoardColumns.id, col.id));
    }
  }

  return project!;
}

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, 'columns'>>;

export async function updateProject(tx: DbOrTx, projectId: string, input: UpdateProjectInput, ctx: ActorCtx): Promise<typeof rndProjects.$inferSelect> {
  const [project] = await tx.select().from(rndProjects).where(eq(rndProjects.id, projectId)).limit(1);
  if (!project) throw new NotFoundError('Proje', projectId);

  if (input.productId) {
    const [p] = await tx.select({ id: products.id }).from(products).where(eq(products.id, input.productId)).limit(1);
    if (!p) throw new NotFoundError('Ürün', input.productId);
  }

  const set: Partial<typeof rndProjects.$inferInsert> = { updatedBy: ctx.userId ?? null };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new ValidationError('Proje adı gerekli');
    set.name = input.name.trim();
  }
  if (input.status !== undefined) set.status = input.status;
  if (input.productId !== undefined) set.productId = input.productId;
  if (input.targetSku !== undefined) set.targetSku = input.targetSku;
  if (input.ownerId !== undefined) set.ownerId = input.ownerId;
  if (input.goal !== undefined) set.goal = input.goal;
  if (input.targetUnitCost !== undefined) set.targetUnitCost = input.targetUnitCost;
  if (input.targetLaunchDate !== undefined) set.targetLaunchDate = input.targetLaunchDate;
  if (input.note !== undefined) set.note = input.note;

  const [row] = await tx.update(rndProjects).set(set).where(eq(rndProjects.id, projectId)).returning();
  return row!;
}

/** Ürünü projeye bağlar — "Ana Veri sihirbazı"nda oluşturulan SKU'yu geri bağlamak için (§3, releaseToBom ürün şartı). */
export async function linkProductToProject(tx: DbOrTx, projectId: string, productId: string, ctx: ActorCtx): Promise<typeof rndProjects.$inferSelect> {
  return updateProject(tx, projectId, { productId }, ctx);
}

export async function getProject(tx: DbOrTx, projectId: string): Promise<typeof rndProjects.$inferSelect> {
  const [row] = await tx.select().from(rndProjects).where(eq(rndProjects.id, projectId)).limit(1);
  if (!row) throw new NotFoundError('Proje', projectId);
  return row;
}

export async function listProjects(tx: DbOrTx): Promise<Array<typeof rndProjects.$inferSelect>> {
  return tx.select().from(rndProjects).orderBy(desc(rndProjects.createdAt));
}
