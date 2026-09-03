import { eq, asc } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { opportunities, opportunityActivities, opportunityStages, partners, salesChannels, type DbOrTx } from '@plantero/db';
import { D, toDb, ZERO } from '../money.js';
import { businessDate } from '../dates.js';
import { nextDocNo } from '../sequences.js';
import { linkDocuments, indexDocument } from '../documents/chain.js';
import { NotFoundError, ValidationError, DomainError } from '../auth/errors.js';
import { createSalesDoc, resolveDefaultSalesWarehouse } from './orders.js';
import type { ActorCtx } from '../types.js';

/** CRM — fırsat hunisi (`opportunity_stages` → `opportunities` → `opportunity_activities`). */

export type CreateOpportunityInput = {
  title: string;
  partnerId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  stageId?: string | null;
  channelId?: string | null;
  ownerId?: string | null;
  expectedAmount?: Decimal | string | number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string | Date | null;
  source?: string | null;
  nextActivity?: string | null;
  nextActivityDate?: string | Date | null;
  note?: string | null;
};

export async function createOpportunity(tx: DbOrTx, input: CreateOpportunityInput, ctx: ActorCtx): Promise<typeof opportunities.$inferSelect> {
  if (!input.title.trim()) throw new ValidationError('Fırsat başlığı gerekli');
  let stage: typeof opportunityStages.$inferSelect | undefined;
  if (input.stageId) {
    [stage] = await tx.select().from(opportunityStages).where(eq(opportunityStages.id, input.stageId)).limit(1);
    if (!stage) throw new NotFoundError('Aşama', input.stageId);
  } else {
    [stage] = await tx.select().from(opportunityStages).orderBy(asc(opportunityStages.sortOrder)).limit(1);
    if (!stage) throw new DomainError('STAGES_MISSING', 'Fırsat aşamaları tanımlı değil — masterdata/sales seed çalıştırılmalı');
  }

  const docNo = await nextDocNo(tx, 'OPP');
  const [row] = await tx
    .insert(opportunities)
    .values({
      docNo, title: input.title.trim(), partnerId: input.partnerId ?? null, contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null, contactPhone: input.contactPhone ?? null, stageId: stage.id, channelId: input.channelId ?? null,
      ownerId: input.ownerId ?? ctx.userId, expectedAmount: toDb(D(input.expectedAmount ?? 0)), currency: input.currency ?? 'TRY',
      probability: input.probability ?? stage.probability, expectedCloseDate: input.expectedCloseDate ? businessDate(input.expectedCloseDate) : null,
      source: input.source ?? null, nextActivity: input.nextActivity ?? null, nextActivityDate: input.nextActivityDate ? businessDate(input.nextActivityDate) : null,
      note: input.note ?? null, createdBy: ctx.userId ?? null,
    })
    .returning();

  await indexDocument(tx, { type: 'opportunity', recordId: row!.id, docNo, partnerId: row!.partnerId, status: stage.code, origin: 'manual', title: `Fırsat ${docNo}: ${row!.title}`, amount: row!.expectedAmount, docDate: new Date() });
  return row!;
}

/** Kanban sürükle-bırak: aşama değişir, olasılık aşamanın varsayılanına döner; kazanma/kayıp aşamasında kapanış damgalanır. */
export async function moveOpportunity(tx: DbOrTx, input: { id: string; stageId: string; lostReason?: string | null }, ctx: ActorCtx): Promise<typeof opportunities.$inferSelect> {
  const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, input.id)).for('update');
  if (!opp) throw new NotFoundError('Fırsat', input.id);
  const [stage] = await tx.select().from(opportunityStages).where(eq(opportunityStages.id, input.stageId)).limit(1);
  if (!stage) throw new NotFoundError('Aşama', input.stageId);

  const closedAt = stage.isWon || stage.isLost ? new Date() : null;
  const [updated] = await tx
    .update(opportunities)
    .set({ stageId: stage.id, probability: stage.probability, closedAt, lostReason: stage.isLost ? (input.lostReason ?? opp.lostReason) : opp.lostReason, updatedBy: ctx.userId ?? null })
    .where(eq(opportunities.id, input.id))
    .returning();
  await indexDocument(tx, { type: 'opportunity', recordId: opp.id, docNo: opp.docNo, partnerId: opp.partnerId, status: stage.code, origin: 'manual', title: `Fırsat ${opp.docNo}: ${opp.title}`, amount: opp.expectedAmount });
  return updated!;
}

export async function setNextActivity(tx: DbOrTx, input: { id: string; nextActivity: string | null; nextActivityDate: string | Date | null }, ctx: ActorCtx): Promise<typeof opportunities.$inferSelect> {
  const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, input.id)).limit(1);
  if (!opp) throw new NotFoundError('Fırsat', input.id);
  const [updated] = await tx
    .update(opportunities)
    .set({ nextActivity: input.nextActivity, nextActivityDate: input.nextActivityDate ? businessDate(input.nextActivityDate) : null, updatedBy: ctx.userId ?? null })
    .where(eq(opportunities.id, input.id))
    .returning();
  return updated!;
}

export type AddActivityInput = { opportunityId: string; kind: 'call' | 'email' | 'meeting' | 'note' | 'whatsapp'; body: string; at?: Date };

export async function addActivity(tx: DbOrTx, input: AddActivityInput, ctx: ActorCtx): Promise<typeof opportunityActivities.$inferSelect> {
  if (!input.body.trim()) throw new ValidationError('Aktivite metni gerekli');
  const [opp] = await tx.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, input.opportunityId)).limit(1);
  if (!opp) throw new NotFoundError('Fırsat', input.opportunityId);
  const [row] = await tx
    .insert(opportunityActivities)
    .values({ opportunityId: input.opportunityId, kind: input.kind, body: input.body.trim(), at: input.at ?? new Date(), userId: ctx.userId })
    .returning();
  return row!;
}

/** Fırsatı boş bir teklife (draft, satırsız — kullanıcı teklif ekranında doldurur) dönüştürür. */
export async function convertToQuotation(tx: DbOrTx, opportunityId: string, ctx: ActorCtx): Promise<typeof opportunities.$inferSelect & { quotationDocNo: string }> {
  const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, opportunityId)).for('update');
  if (!opp) throw new NotFoundError('Fırsat', opportunityId);
  if (opp.quotationId) throw new DomainError('OPPORTUNITY_ALREADY_QUOTED', `${opp.docNo} zaten bir teklife dönüştürülmüş`);
  if (!opp.partnerId) throw new ValidationError('Fırsatın carisi tanımlı değil — önce cari seçin');

  const [partner] = await tx.select().from(partners).where(eq(partners.id, opp.partnerId)).limit(1);
  if (!partner) throw new NotFoundError('Cari', opp.partnerId);
  const channelId = opp.channelId ?? partner.defaultChannelId;
  if (!channelId) throw new ValidationError('Kanal tanımlı değil — cari ya da fırsatta kanal seçin');
  const [channel] = await tx.select().from(salesChannels).where(eq(salesChannels.id, channelId)).limit(1);
  if (!channel) throw new NotFoundError('Satış kanalı', channelId);
  const warehouse = await resolveDefaultSalesWarehouse(tx);

  const { order: quotation } = await createSalesDoc(tx, {
    docType: 'quotation', partnerId: partner.id, channelId: channel.id, warehouseId: warehouse.id,
    priceListId: partner.priceListId ?? channel.defaultPriceListId ?? null, opportunityId: opp.id,
    orderDate: businessDate(new Date()), currency: opp.currency, origin: 'chain', lines: [],
  }, ctx);

  await tx.update(opportunities).set({ quotationId: quotation.id, updatedBy: ctx.userId ?? null }).where(eq(opportunities.id, opportunityId));
  await linkDocuments(tx, { sourceType: 'opportunity', sourceId: opportunityId, targetType: 'quotation', targetId: quotation.id }, ctx);
  return { ...opp, quotationId: quotation.id, quotationDocNo: quotation.docNo };
}

export type FunnelStage = { stage: typeof opportunityStages.$inferSelect; count: number; amount: Decimal };
export type Funnel = { stages: FunnelStage[]; winRate: number | null };

/** Aşama başına adet/tutar özeti + kazanma oranı (kazanılan / (kazanılan+kaybedilen), kapanmış fırsatlar). */
export async function getFunnel(tx: DbOrTx): Promise<Funnel> {
  const stages = await tx.select().from(opportunityStages).orderBy(asc(opportunityStages.sortOrder));
  const opps = await tx.select({ stageId: opportunities.stageId, expectedAmount: opportunities.expectedAmount }).from(opportunities);
  const byStage = new Map<string, { count: number; amount: Decimal }>();
  for (const o of opps) {
    const acc = byStage.get(o.stageId) ?? { count: 0, amount: ZERO };
    acc.count += 1;
    acc.amount = acc.amount.plus(D(o.expectedAmount));
    byStage.set(o.stageId, acc);
  }
  const funnelStages = stages.map((s) => ({ stage: s, count: byStage.get(s.id)?.count ?? 0, amount: byStage.get(s.id)?.amount ?? ZERO }));
  const won = funnelStages.filter((s) => s.stage.isWon).reduce((a, s) => a + s.count, 0);
  const lost = funnelStages.filter((s) => s.stage.isLost).reduce((a, s) => a + s.count, 0);
  const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : null;
  return { stages: funnelStages, winRate };
}
