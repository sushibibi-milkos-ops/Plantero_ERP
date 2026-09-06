import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@plantero/db';
import { rndBoardColumns, rndCards, rndCardComments, trialRecipeVersions } from '@plantero/db';
import { NotFoundError, ValidationError } from '../auth/errors.js';
import type { ActorCtx } from '../types.js';

/**
 * Trello mantığı board — kolon + kart CRUD, sürükle-bırak (kolon içi/arası) kalıcılığı, kontrol
 * listesi, yorumlar, ekler (docs/modules/arge.md §2). Pozisyonlar her mutasyonda etkilenen kolon(lar)
 * için 10'ar arayla yeniden numaralanır (10, 20, 30…) — dnd-kit'in tek bir `toIndex` vermesi yeterli,
 * kesirli pozisyon şeması gerekmiyor (board boyutu küçük: proje başına onlarca kart).
 */

const STEP = 10;

async function activeCardCount(tx: DbOrTx, columnId: string, excludeCardId?: string): Promise<number> {
  const conds = [eq(rndCards.columnId, columnId), eq(rndCards.isArchived, false)];
  if (excludeCardId) conds.push(ne(rndCards.id, excludeCardId));
  const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(rndCards).where(and(...conds));
  return row?.count ?? 0;
}

async function nextColumnPosition(tx: DbOrTx, projectId: string): Promise<number> {
  const [row] = await tx.select({ maxPos: sql<number>`coalesce(max(${rndBoardColumns.position}), 0)::int` }).from(rndBoardColumns).where(eq(rndBoardColumns.projectId, projectId));
  return (row?.maxPos ?? 0) + STEP;
}

async function nextCardPosition(tx: DbOrTx, columnId: string): Promise<number> {
  const [row] = await tx.select({ maxPos: sql<number>`coalesce(max(${rndCards.position}), 0)::int` }).from(rndCards).where(eq(rndCards.columnId, columnId));
  return (row?.maxPos ?? 0) + STEP;
}

/* ==================================================================== */
/* Kolonlar                                                              */
/* ==================================================================== */

export type ColumnRow = typeof rndBoardColumns.$inferSelect;

export async function createColumn(tx: DbOrTx, input: { projectId: string; name: string; wipLimit?: number | null; isDone?: boolean }, _ctx: ActorCtx): Promise<ColumnRow> {
  if (!input.name.trim()) throw new ValidationError('Kolon adı gerekli');
  if (input.wipLimit != null && input.wipLimit < 1) throw new ValidationError('WIP limiti en az 1 olmalı');
  const position = await nextColumnPosition(tx, input.projectId);
  const [col] = await tx
    .insert(rndBoardColumns)
    .values({ projectId: input.projectId, name: input.name.trim(), wipLimit: input.wipLimit ?? null, isDone: input.isDone ?? false, position })
    .returning();
  return col!;
}

export async function renameColumn(tx: DbOrTx, columnId: string, name: string, _ctx: ActorCtx): Promise<ColumnRow> {
  if (!name.trim()) throw new ValidationError('Kolon adı gerekli');
  const [row] = await tx.update(rndBoardColumns).set({ name: name.trim() }).where(eq(rndBoardColumns.id, columnId)).returning();
  if (!row) throw new NotFoundError('Kolon', columnId);
  return row;
}

export async function setColumnWipLimit(tx: DbOrTx, columnId: string, wipLimit: number | null, _ctx: ActorCtx): Promise<ColumnRow> {
  if (wipLimit != null && wipLimit < 1) throw new ValidationError('WIP limiti en az 1 olmalı');
  const [row] = await tx.update(rndBoardColumns).set({ wipLimit }).where(eq(rndBoardColumns.id, columnId)).returning();
  if (!row) throw new NotFoundError('Kolon', columnId);
  return row;
}

export async function setColumnDone(tx: DbOrTx, columnId: string, isDone: boolean, _ctx: ActorCtx): Promise<ColumnRow> {
  const [row] = await tx.update(rndBoardColumns).set({ isDone }).where(eq(rndBoardColumns.id, columnId)).returning();
  if (!row) throw new NotFoundError('Kolon', columnId);
  return row;
}

export async function deleteColumn(tx: DbOrTx, columnId: string, _ctx: ActorCtx): Promise<void> {
  const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.id, columnId)).limit(1);
  if (!col) throw new NotFoundError('Kolon', columnId);
  const count = await activeCardCount(tx, columnId);
  if (count > 0) throw new ValidationError('Kolonda kart varken silinemez — önce kartları başka bir kolona taşıyın veya arşivleyin');
  await tx.delete(rndBoardColumns).where(eq(rndBoardColumns.id, columnId));
}

/** Kolonların yeni sırası — dnd-kit kolon sürüklemesi sonrası tüm proje kolonlarının id listesi verilir. */
export async function reorderColumns(tx: DbOrTx, projectId: string, orderedColumnIds: string[], _ctx: ActorCtx): Promise<ColumnRow[]> {
  const existing = await tx.select({ id: rndBoardColumns.id }).from(rndBoardColumns).where(eq(rndBoardColumns.projectId, projectId));
  const existingIds = new Set(existing.map((r) => r.id));
  if (orderedColumnIds.length !== existing.length || orderedColumnIds.some((id) => !existingIds.has(id))) {
    throw new ValidationError('Kolon sırası projedeki kolonlarla eşleşmiyor');
  }
  for (let i = 0; i < orderedColumnIds.length; i++) {
    await tx.update(rndBoardColumns).set({ position: (i + 1) * STEP }).where(eq(rndBoardColumns.id, orderedColumnIds[i]!));
  }
  return tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, projectId)).orderBy(asc(rndBoardColumns.position));
}

/* ==================================================================== */
/* Kartlar                                                               */
/* ==================================================================== */

export type CardRow = typeof rndCards.$inferSelect;

export type CreateCardInput = {
  projectId: string;
  columnId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  labels?: string[];
};

export async function createCard(tx: DbOrTx, input: CreateCardInput, ctx: ActorCtx): Promise<CardRow> {
  if (!input.title.trim()) throw new ValidationError('Kart başlığı gerekli');
  const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.id, input.columnId)).limit(1);
  if (!col) throw new NotFoundError('Kolon', input.columnId);
  if (col.wipLimit != null) {
    const count = await activeCardCount(tx, input.columnId);
    if (count >= col.wipLimit) throw new ValidationError(`"${col.name}" kolonunun WIP limiti (${col.wipLimit}) doldu`);
  }
  const position = await nextCardPosition(tx, input.columnId);
  const [card] = await tx
    .insert(rndCards)
    .values({
      projectId: input.projectId,
      columnId: input.columnId,
      title: input.title.trim(),
      description: input.description ?? null,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      labels: input.labels ?? [],
      position,
      createdBy: ctx.userId ?? null,
      updatedBy: ctx.userId ?? null,
    })
    .returning();
  return card!;
}

export type UpdateCardInput = Partial<{
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  labels: string[];
}>;

export async function updateCard(tx: DbOrTx, cardId: string, input: UpdateCardInput, ctx: ActorCtx): Promise<CardRow> {
  const set: Partial<typeof rndCards.$inferInsert> = { updatedBy: ctx.userId ?? null };
  if (input.title !== undefined) {
    if (!input.title.trim()) throw new ValidationError('Kart başlığı gerekli');
    set.title = input.title.trim();
  }
  if (input.description !== undefined) set.description = input.description;
  if (input.assigneeId !== undefined) set.assigneeId = input.assigneeId;
  if (input.dueDate !== undefined) set.dueDate = input.dueDate;
  if (input.labels !== undefined) set.labels = input.labels;
  const [row] = await tx.update(rndCards).set(set).where(eq(rndCards.id, cardId)).returning();
  if (!row) throw new NotFoundError('Kart', cardId);
  return row;
}

export async function setCardArchived(tx: DbOrTx, cardId: string, isArchived: boolean, ctx: ActorCtx): Promise<CardRow> {
  const [row] = await tx.update(rndCards).set({ isArchived, updatedBy: ctx.userId ?? null }).where(eq(rndCards.id, cardId)).returning();
  if (!row) throw new NotFoundError('Kart', cardId);
  return row;
}

export async function updateChecklist(tx: DbOrTx, cardId: string, checklist: Array<{ text: string; done: boolean }>, ctx: ActorCtx): Promise<CardRow> {
  const cleaned = checklist.filter((i) => i.text.trim().length > 0).map((i) => ({ text: i.text.trim(), done: Boolean(i.done) }));
  const [row] = await tx.update(rndCards).set({ checklist: cleaned, updatedBy: ctx.userId ?? null }).where(eq(rndCards.id, cardId)).returning();
  if (!row) throw new NotFoundError('Kart', cardId);
  return row;
}

export async function linkTrialVersion(tx: DbOrTx, cardId: string, trialVersionId: string | null, ctx: ActorCtx): Promise<CardRow> {
  if (trialVersionId) {
    const [v] = await tx.select({ id: trialRecipeVersions.id }).from(trialRecipeVersions).where(eq(trialRecipeVersions.id, trialVersionId)).limit(1);
    if (!v) throw new NotFoundError('Deneme reçetesi versiyonu', trialVersionId);
  }
  const [row] = await tx.update(rndCards).set({ trialVersionId, updatedBy: ctx.userId ?? null }).where(eq(rndCards.id, cardId)).returning();
  if (!row) throw new NotFoundError('Kart', cardId);
  return row;
}

/**
 * Kartı hedef kolonda `toIndex` konumuna taşır (aynı kolon içinde de kullanılır — yalnızca sıralama
 * değişir). WIP limiti YALNIZCA farklı bir kolona giriş anında kontrol edilir (kolon içi yeniden
 * sıralama zaten mevcut sayıyı değiştirmez).
 */
export async function moveCard(tx: DbOrTx, input: { cardId: string; toColumnId: string; toIndex: number }, ctx: ActorCtx): Promise<CardRow> {
  const [card] = await tx.select().from(rndCards).where(eq(rndCards.id, input.cardId)).limit(1);
  if (!card) throw new NotFoundError('Kart', input.cardId);
  const [destCol] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.id, input.toColumnId)).limit(1);
  if (!destCol) throw new NotFoundError('Kolon', input.toColumnId);

  const changingColumn = card.columnId !== input.toColumnId;
  if (changingColumn && destCol.wipLimit != null) {
    const count = await activeCardCount(tx, destCol.id);
    if (count >= destCol.wipLimit) throw new ValidationError(`"${destCol.name}" kolonunun WIP limiti (${destCol.wipLimit}) doldu`);
  }

  const destCards = await tx
    .select({ id: rndCards.id })
    .from(rndCards)
    .where(and(eq(rndCards.columnId, destCol.id), eq(rndCards.isArchived, false), ne(rndCards.id, card.id)))
    .orderBy(asc(rndCards.position));

  const clampedIndex = Math.max(0, Math.min(input.toIndex, destCards.length));
  const newOrder = [...destCards.slice(0, clampedIndex).map((c) => c.id), card.id, ...destCards.slice(clampedIndex).map((c) => c.id)];

  for (let i = 0; i < newOrder.length; i++) {
    const id = newOrder[i]!;
    const position = (i + 1) * STEP;
    if (id === card.id) {
      await tx.update(rndCards).set({ columnId: destCol.id, position, updatedBy: ctx.userId ?? null }).where(eq(rndCards.id, id));
    } else {
      await tx.update(rndCards).set({ position }).where(eq(rndCards.id, id));
    }
  }

  if (changingColumn) {
    const sourceCards = await tx
      .select({ id: rndCards.id })
      .from(rndCards)
      .where(and(eq(rndCards.columnId, card.columnId), eq(rndCards.isArchived, false), ne(rndCards.id, card.id)))
      .orderBy(asc(rndCards.position));
    for (let i = 0; i < sourceCards.length; i++) {
      await tx.update(rndCards).set({ position: (i + 1) * STEP }).where(eq(rndCards.id, sourceCards[i]!.id));
    }
  }

  const [updated] = await tx.select().from(rndCards).where(eq(rndCards.id, card.id)).limit(1);
  return updated!;
}

/* ==================================================================== */
/* Yorumlar + ekler                                                      */
/* Şema `rnd_cards`e/`rnd_card_comments`e ayrı bir "attachments" alanı/tablosu tanımlamıyor (dondurulmuş
 * şema — bkz. rapor "Şema talepleri"). Ekler, aynı yorum tablosunda özel bir JSON imzasıyla (`ATTACHMENT_
 * MARKER`) taşınan satırlar olarak modellenir — Trello'da da ekler zaten kart aktivite akışının bir
 * parçasıdır; ayrıştırma tek yerden (`parseComment`) yapılır, UI yorumları ve ekleri ayrı listeler.  */
/* ==================================================================== */

/** Web katmanı (sorgu tarafı) yorum/ek sayımını SQL `LIKE` ile ayırt etmek için bu sabiti aynen kullanır. */
export const ATTACHMENT_MARKER = 'RND_ATTACH_V1::';

export type AttachmentMeta = { fileName: string; mimeType: string; dataUrl: string; size: number };

export function serializeAttachment(meta: AttachmentMeta): string {
  return ATTACHMENT_MARKER + JSON.stringify(meta);
}

export type ParsedComment =
  | { kind: 'comment'; id: string; userId: string | null; body: string; createdAt: Date }
  | { kind: 'attachment'; id: string; userId: string | null; createdAt: Date; attachment: AttachmentMeta };

export function parseComment(row: typeof rndCardComments.$inferSelect): ParsedComment {
  if (row.body.startsWith(ATTACHMENT_MARKER)) {
    try {
      const attachment = JSON.parse(row.body.slice(ATTACHMENT_MARKER.length)) as AttachmentMeta;
      return { kind: 'attachment', id: row.id, userId: row.userId, createdAt: row.createdAt, attachment };
    } catch {
      // Bozuk JSON — düz yorum gibi göster (asla sessizce kaybolmasın)
    }
  }
  return { kind: 'comment', id: row.id, userId: row.userId, body: row.body, createdAt: row.createdAt };
}

export async function addComment(tx: DbOrTx, input: { cardId: string; body: string }, ctx: ActorCtx): Promise<typeof rndCardComments.$inferSelect> {
  const body = input.body.trim();
  if (!body) throw new ValidationError('Yorum boş olamaz');
  if (body.startsWith(ATTACHMENT_MARKER)) throw new ValidationError('Geçersiz yorum içeriği');
  const [row] = await tx.insert(rndCardComments).values({ cardId: input.cardId, userId: ctx.userId ?? null, body }).returning();
  return row!;
}

const MAX_ATTACHMENT_BYTES = 4_000_000; // ~4MB base64 dataURL — DB jsonb/text kolonuna makul üst sınır

export async function addAttachment(tx: DbOrTx, input: { cardId: string; fileName: string; mimeType: string; dataUrl: string }, ctx: ActorCtx): Promise<typeof rndCardComments.$inferSelect> {
  if (!input.dataUrl.startsWith('data:')) throw new ValidationError('Geçersiz dosya verisi');
  if (input.dataUrl.length > MAX_ATTACHMENT_BYTES) throw new ValidationError('Dosya çok büyük (üst sınır ~3MB)');
  const meta: AttachmentMeta = { fileName: input.fileName, mimeType: input.mimeType, dataUrl: input.dataUrl, size: input.dataUrl.length };
  const [row] = await tx.insert(rndCardComments).values({ cardId: input.cardId, userId: ctx.userId ?? null, body: serializeAttachment(meta) }).returning();
  return row!;
}

export async function listCardActivity(tx: DbOrTx, cardId: string): Promise<ParsedComment[]> {
  const rows = await tx.select().from(rndCardComments).where(eq(rndCardComments.cardId, cardId)).orderBy(asc(rndCardComments.createdAt));
  return rows.map(parseComment);
}
