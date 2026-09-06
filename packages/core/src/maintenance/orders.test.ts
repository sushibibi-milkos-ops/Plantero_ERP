import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { machines, downtimes, attachments, journalEntries, journalLines } from '@plantero/db';
import { reportBreakdown, startOrder, completeOrder, cancelOrder, markWaitingParts, updateDiagnosis } from './orders.js';
import { createPlan, generateOrderNow } from './plans.js';
import { seedMaintenanceBase } from './__test-utils__.js';
import { withRollback, ctx } from '../__tests__/helpers.js';

describe('maintenance/orders', () => {
  it('reportBreakdown: makine down olur, downtime açılır, fotoğraf attachments\'a yazılır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, {
        machineId: b.machine.id, title: 'Dolum başlığı sızdırıyor', priority: 'high',
        photos: [{ fileName: 'ariza1.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }],
      }, ctx);

      expect(order.docNo).toMatch(/^MO-\d{4}-\d{6}$/);
      expect(order.kind).toBe('corrective');
      expect(order.status).toBe('reported');
      expect(order.photoCount).toBe(1);

      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('down');

      const dts = await tx.select().from(downtimes).where(eq(downtimes.maintenanceOrderId, order.id));
      expect(dts).toHaveLength(1);
      expect(dts[0]!.reason).toBe('breakdown');
      expect(dts[0]!.endedAt).toBeNull();

      const atts = await tx.select().from(attachments).where(eq(attachments.recordId, order.id));
      expect(atts).toHaveLength(1);
      expect(atts[0]!.tableName).toBe('maintenance_orders');
      expect(atts[0]!.sizeBytes).toBeGreaterThan(0);
    });
  });

  it('start → complete: downtime kapanır, makine idle döner, downtimeMinutes hesaplanır', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const reportedAt = new Date(Date.now() - 90 * 60_000);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Arıza', workOrderId: null }, ctx);
      // reportedAt/downtime.startedAt `now()` ile yazıldı; tamamlama 90 dk sonrasına simüle edilir.
      await startOrder(tx, order.id, ctx, { asOf: new Date(reportedAt.getTime() + 5 * 60_000) });
      const completed = await completeOrder(tx, order.id, { rootCause: 'Conta aşınmış', resolution: 'Conta değiştirildi' }, ctx);

      expect(completed.status).toBe('done');
      expect(completed.finishedAt).not.toBeNull();

      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('idle');

      const [dt] = await tx.select().from(downtimes).where(eq(downtimes.maintenanceOrderId, order.id));
      expect(dt!.endedAt).not.toBeNull();
      expect(dt!.minutes).toBeGreaterThanOrEqual(0);
      expect(completed.downtimeMinutes).toBe(dt!.minutes);
    });
  });

  it('I51: tamamlanan işçilik+parça maliyeti tek bir muhasebe fişine (VUK+UFRS, 730/100) dönüşür', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Pompa arızası' }, ctx);
      await startOrder(tx, order.id, ctx);
      const completed = await completeOrder(tx, order.id, { laborCost: '450', partsCost: '180' }, ctx);
      expect(completed.status).toBe('done');

      const entries = await tx.select().from(journalEntries).where(and(eq(journalEntries.refType, 'maintenance_order'), eq(journalEntries.refId, order.id)));
      // ledger:'both' → VUK + UFRS, twinEntryId ile çapraz bağlı
      expect(entries).toHaveLength(2);
      expect(new Set(entries.map((e) => e.ledger))).toEqual(new Set(['VUK', 'UFRS']));
      for (const e of entries) {
        expect(e.totalDebit).toBe('630.0000');
        expect(e.totalCredit).toBe('630.0000');
      }

      const vuk = entries.find((e) => e.ledger === 'VUK')!;
      const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, vuk.id));
      const byAccount = new Map(lines.map((l) => [l.accountCode, l]));
      expect(byAccount.get('730')?.debit).toBe('630.0000');
      expect(byAccount.get('100')?.credit).toBe('630.0000');
    });
  });

  it('maliyeti sıfır olan iş emri tamamlanınca fiş üretilmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Kontrol', intervalValue: 7, intervalUnit: 'day' }, ctx);
      const { order } = await generateOrderNow(tx, plan.id, ctx);
      await startOrder(tx, order.id, ctx);
      await completeOrder(tx, order.id, {}, ctx);

      const entries = await tx.select().from(journalEntries).where(and(eq(journalEntries.refType, 'maintenance_order'), eq(journalEntries.refId, order.id)));
      expect(entries).toHaveLength(0);
    });
  });

  it('planlı iş emri tamamlanınca plan lastDoneAt/nextDueAt ilerler', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const plan = await createPlan(tx, { machineId: b.machine.id, name: 'Haftalık yağlama', intervalValue: 7, intervalUnit: 'day' }, ctx);
      const { order } = await generateOrderNow(tx, plan.id, ctx);
      await startOrder(tx, order.id, ctx);
      await completeOrder(tx, order.id, {}, ctx);

      const { maintenancePlans } = await import('@plantero/db');
      const [updatedPlan] = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.id, plan.id)).limit(1);
      // Plan bugün oluşturulup bugün tamamlandığı için nextDueAt (bugün+7) değişmez — ilerleyen alan
      // `lastDoneAt`'tır (yaratılışta null, tamamlanınca bugüne yazılır).
      expect(plan.lastDoneAt).toBeNull();
      expect(updatedPlan!.lastDoneAt).not.toBeNull();
      expect(updatedPlan!.nextDueAt).toBe(plan.nextDueAt);
    });
  });

  it('waiting_parts akışı ve iptal: reported iş emri doğrudan iptal edilebilir, makine idle döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Sensör arızası' }, ctx);
      await startOrder(tx, order.id, ctx);
      const waiting = await markWaitingParts(tx, order.id, { note: 'Yedek parça bekleniyor' }, ctx);
      expect(waiting.status).toBe('waiting_parts');

      const cancelled = await cancelOrder(tx, order.id, { reason: 'Yanlış bildirim' }, ctx);
      expect(cancelled.status).toBe('cancelled');
      const [machine] = await tx.select().from(machines).where(eq(machines.id, b.machine.id)).limit(1);
      expect(machine!.status).toBe('idle');
    });
  });

  it('zaten kapalı iş emri tekrar tamamlanamaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Arıza' }, ctx);
      await completeOrder(tx, order.id, {}, ctx);
      await expect(completeOrder(tx, order.id, {}, ctx)).rejects.toThrow(/zaten kapalı/);
    });
  });

  it('P0 (Tur 2 regresyonu): kapalı (done) bir iş emrinde updateDiagnosis maliyeti sessizce güncelleyemez — 730/100 fişi zaten atıldı, muhasebe sapmasın', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Pompa arızası' }, ctx);
      await startOrder(tx, order.id, ctx);
      const completed = await completeOrder(tx, order.id, { laborCost: '450', partsCost: '180' }, ctx);
      expect(completed.status).toBe('done');

      await expect(updateDiagnosis(tx, order.id, { partsCost: '99999.0000' }, ctx)).rejects.toThrow(/zaten kapalı/);

      // Fiş atılırken kullanılan toplam (630,00 TL) hâlâ maintenance_orders üzerinde — sessiz üzerine yazma yok.
      const entries = await tx.select().from(journalEntries).where(and(eq(journalEntries.refType, 'maintenance_order'), eq(journalEntries.refId, order.id)));
      expect(entries).toHaveLength(2);
      for (const e of entries) expect(e.totalDebit).toBe('630.0000');
    });
  });

  it('P0: iptal edilmiş (cancelled) bir iş emrinde de updateDiagnosis reddedilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedMaintenanceBase(tx);
      const order = await reportBreakdown(tx, { machineId: b.machine.id, title: 'Sensör arızası' }, ctx);
      await cancelOrder(tx, order.id, { reason: 'Yanlış bildirim' }, ctx);
      await expect(updateDiagnosis(tx, order.id, { partsCost: '500' }, ctx)).rejects.toThrow(/zaten kapalı/);
    });
  });
});
