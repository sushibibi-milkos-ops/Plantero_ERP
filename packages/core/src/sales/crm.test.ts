import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { opportunityStages, opportunities, salesChannels, type Tx } from '@plantero/db';
import { createOpportunity, moveOpportunity, addActivity, convertToQuotation, getFunnel } from './crm.js';
import { withRollback, seedBase, ctx, d, type Base } from '../__tests__/helpers.js';

async function seedStages(tx: Tx, b: Base) {
  const rows = await tx
    .insert(opportunityStages)
    .values([
      { code: `lead-${b.s}`, name: 'Aday', probability: 10, sortOrder: 1 },
      { code: `qualified-${b.s}`, name: 'Nitelikli', probability: 30, sortOrder: 2 },
      { code: `won-${b.s}`, name: 'Kazanıldı', probability: 100, sortOrder: 3, isWon: true },
      { code: `lost-${b.s}`, name: 'Kaybedildi', probability: 0, sortOrder: 4, isLost: true },
    ])
    .returning();
  return { lead: rows[0]!, qualified: rows[1]!, won: rows[2]!, lost: rows[3]! };
}

describe('sales/crm', () => {
  it('fırsat oluştur → aşama taşı → aktivite ekle → teklife dönüştür', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const stages = await seedStages(tx, b);
      const [channel] = await tx.insert(salesChannels).values({ code: `CH-${b.s}`, name: `Kanal ${b.s}`, kind: 'wholesale' }).returning();

      const opp = await createOpportunity(tx, { title: 'Yeni market anlaşması', partnerId: b.customer.id, channelId: channel!.id, stageId: stages.lead.id, expectedAmount: d(50000) }, ctx);
      expect(opp.docNo).toMatch(/^OPP-/);
      expect(opp.probability).toBe(10);

      const moved = await moveOpportunity(tx, { id: opp.id, stageId: stages.qualified.id }, ctx);
      expect(moved.probability).toBe(30);
      expect(moved.closedAt).toBeNull();

      const activity = await addActivity(tx, { opportunityId: opp.id, kind: 'call', body: 'Fiyat görüşüldü' }, ctx);
      expect(activity.kind).toBe('call');

      const won = await moveOpportunity(tx, { id: opp.id, stageId: stages.won.id }, ctx);
      expect(won.closedAt).not.toBeNull();

      const converted = await convertToQuotation(tx, opp.id, ctx);
      expect(converted.quotationDocNo).toMatch(/^QT-/);
      await expect(convertToQuotation(tx, opp.id, ctx)).rejects.toMatchObject({ code: 'OPPORTUNITY_ALREADY_QUOTED' });

      const [reloaded] = await tx.select().from(opportunities).where(eq(opportunities.id, opp.id));
      expect(reloaded!.quotationId).toBeTruthy();
    });
  });

  it('getFunnel aşama başına adet/tutar ve kazanma oranı döner', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const stages = await seedStages(tx, b);
      await createOpportunity(tx, { title: 'A', stageId: stages.lead.id, expectedAmount: d(1000) }, ctx);
      await createOpportunity(tx, { title: 'B', stageId: stages.won.id, expectedAmount: d(2000) }, ctx);
      await createOpportunity(tx, { title: 'C', stageId: stages.lost.id, expectedAmount: d(500) }, ctx);

      const funnel = await getFunnel(tx);
      // Not: winRate tüm tablo genelinde hesaplanır (paylaşılan geliştirme veritabanında başka
      // kazanılmış/kaybedilmiş fırsatlar da olabilir); burada yalnızca bu testin oluşturduğu
      // kendi aşamasına özgü sayı/tutar doğrulanır — global winRate sıfırdan büyük olmalı yeterli.
      const leadRow = funnel.stages.find((s) => s.stage.id === stages.lead.id)!;
      expect(leadRow.count).toBe(1);
      expect(leadRow.amount.toFixed(2)).toBe('1000.00');
      const wonRow = funnel.stages.find((s) => s.stage.id === stages.won.id)!;
      const lostRow = funnel.stages.find((s) => s.stage.id === stages.lost.id)!;
      expect(wonRow.count).toBe(1);
      expect(lostRow.count).toBe(1);
      expect(funnel.winRate).not.toBeNull();
      expect(funnel.winRate!).toBeGreaterThan(0);
    });
  });
});
