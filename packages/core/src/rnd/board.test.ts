import { describe, it, expect } from 'vitest';
import { rndBoardColumns, rndCards } from '@plantero/db';
import { asc, eq } from 'drizzle-orm';
import { withRollback, ctx } from '../__tests__/helpers.js';
import { createProject } from './projects.js';
import { createCard, moveCard, deleteColumn, updateChecklist, addComment, addAttachment, listCardActivity } from './board.js';

describe('rnd/board', () => {
  it('createProject varsayılan 6 kolon şablonunu oluşturur, son kolon isDone', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Fıstık Bazı' }, ctx);
      const cols = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id)).orderBy(asc(rndBoardColumns.position));
      expect(cols.map((c) => c.name)).toEqual(['Fikir', 'Formülasyon', 'Pilot Üretim', 'Duyusal Test', 'Raf Ömrü', 'Onay']);
      expect(cols[cols.length - 1]!.isDone).toBe(true);
      expect(cols[0]!.isDone).toBe(false);
    });
  });

  it('createCard: WIP limiti dolu kolona kart eklenemez', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Test', columns: [{ name: 'Yapılıyor', wipLimit: 1 }] }, ctx);
      const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id));
      await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'Kart 1' }, ctx);
      await expect(createCard(tx, { projectId: project.id, columnId: col!.id, title: 'Kart 2' }, ctx)).rejects.toThrow(/WIP limiti/);
    });
  });

  it('moveCard: kolon içi sıralama kalıcı olur', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Test', columns: [{ name: 'Kolon' }] }, ctx);
      const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id));
      const c1 = await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'A' }, ctx);
      const c2 = await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'B' }, ctx);
      const c3 = await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'C' }, ctx);

      // A, B, C sırasında iken A'yı sona taşı → B, C, A
      await moveCard(tx, { cardId: c1.id, toColumnId: col!.id, toIndex: 2 }, ctx);
      const rows = await tx.select().from(rndCards).where(eq(rndCards.columnId, col!.id)).orderBy(asc(rndCards.position));
      expect(rows.map((r) => r.title)).toEqual(['B', 'C', 'A']);
      void c2; void c3;
    });
  });

  it('moveCard: farklı kolona taşımada WIP limiti kontrol edilir, kolon içi sıralamada edilmez', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Test', columns: [{ name: 'Kaynak' }, { name: 'Hedef', wipLimit: 1 }] }, ctx);
      const cols = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id)).orderBy(asc(rndBoardColumns.position));
      const [src, dst] = cols;
      const a = await createCard(tx, { projectId: project.id, columnId: src!.id, title: 'A' }, ctx);
      await createCard(tx, { projectId: project.id, columnId: dst!.id, title: 'Zaten var' }, ctx);

      await expect(moveCard(tx, { cardId: a.id, toColumnId: dst!.id, toIndex: 0 }, ctx)).rejects.toThrow(/WIP limiti/);
    });
  });

  it('deleteColumn: içinde aktif kart varken silinemez', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Test', columns: [{ name: 'Kolon' }] }, ctx);
      const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id));
      await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'A' }, ctx);
      await expect(deleteColumn(tx, col!.id, ctx)).rejects.toThrow(/kart varken silinemez/);
    });
  });

  it('checklist/yorum/ek: kart aktivite akışı doğru ayrıştırılır', async () => {
    await withRollback(async (tx) => {
      const project = await createProject(tx, { name: 'Test', columns: [{ name: 'Kolon' }] }, ctx);
      const [col] = await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, project.id));
      const card = await createCard(tx, { projectId: project.id, columnId: col!.id, title: 'A' }, ctx);

      const updated = await updateChecklist(tx, card.id, [{ text: 'Adım 1', done: true }, { text: '  ', done: false }, { text: 'Adım 2', done: false }], ctx);
      expect(updated.checklist).toEqual([{ text: 'Adım 1', done: true }, { text: 'Adım 2', done: false }]);

      await addComment(tx, { cardId: card.id, body: 'Bir yorum' }, ctx);
      await addAttachment(tx, { cardId: card.id, fileName: 'test.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }, ctx);

      const activity = await listCardActivity(tx, card.id);
      expect(activity).toHaveLength(2);
      expect(activity[0]).toMatchObject({ kind: 'comment', body: 'Bir yorum' });
      expect(activity[1]).toMatchObject({ kind: 'attachment', attachment: { fileName: 'test.png', mimeType: 'image/png' } });
    });
  });
});
