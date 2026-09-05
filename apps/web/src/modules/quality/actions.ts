'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@plantero/db';
import { D } from '@plantero/core';
import { recordResults, decide } from '@plantero/core/quality/checks';
import { createTemplate, updateTemplate, setTemplateActive } from '@plantero/core/quality/templates';
import { computeSupplierScores } from '@plantero/core/quality/supplierScore';
import { simulate, initiate, recordRecallAction, closeRecall } from '@plantero/core/quality/recall';
import { email } from '@plantero/integrations/messaging/email';
import { whatsapp } from '@plantero/integrations/messaging/whatsapp';
import { requirePermission } from '@/lib/auth';
import { withAudit, type AuditInfo } from '@/lib/actions';
import { searchTraceEntities, listLotsForPartner, getTraceForLot } from './queries';

const { notifications, partners } = schema;

/* ==================================================================== */
/* İzlenebilirlik — arama (yalnızca okuma, izin gerekir ama audit yazmaz) */
/* ==================================================================== */

const traceSearchSchema = z.object({ q: z.string() });

export const searchTraceEntitiesAction = withAudit('quality.searchTrace', async (raw: z.infer<typeof traceSearchSchema>) => {
  await requirePermission('quality.view');
  const input = traceSearchSchema.parse(raw);
  return { data: await searchTraceEntities(input.q) };
});

const partnerLotsSchema = z.object({ partnerId: z.string().uuid(), kind: z.enum(['customer', 'supplier']) });

export const listPartnerLotsAction = withAudit('quality.listPartnerLots', async (raw: z.infer<typeof partnerLotsSchema>) => {
  await requirePermission('quality.view');
  const input = partnerLotsSchema.parse(raw);
  return { data: await listLotsForPartner(input.partnerId, input.kind) };
});

// Tur 1 P1 kalite-izlenebilirlik-02: `?lot=` derin bağlantısı kullanıcının elindeki TEK görünür kimlik
// olan lot NUMARASIyla gelir, UUID ile değil — `.uuid()` doğrulaması bunu zod aşamasında sessizce
// reddediyordu (ZodError → jenerik "Form alanlarında hata var." — bileşen boş duruma düşüyordu, hiçbir
// hata görünmüyordu). Artık serbest metin kabul edilir; çözüm (uuid mi lot no mu) `getTraceForLot`de
// yapılır (queries.ts) — bulunamazsa oradan fırlatılan 'Lot bulunamadı' mesajı burada görünür kalır.
const traceForLotSchema = z.object({ lotId: z.string().min(1) });

export const getTraceForLotAction = withAudit('quality.getTraceForLot', async (raw: z.infer<typeof traceForLotSchema>) => {
  await requirePermission('quality.view');
  const input = traceForLotSchema.parse(raw);
  const view = await getTraceForLot(input.lotId);
  if (!view) throw new Error('Lot bulunamadı');
  return { data: view };
});

/* ==================================================================== */
/* Kalite kontrolü — sonuç girişi + karar                                */
/* ==================================================================== */

const resultItemSchema = z.object({
  templateItemId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  kind: z.enum(['numeric', 'boolean', 'text', 'document']).optional(),
  valueNumeric: z.string().optional().nullable(),
  valueBool: z.boolean().optional().nullable(),
  valueText: z.string().optional().nullable(),
  sequence: z.number().optional(),
});

const recordResultsSchema = z.object({ checkId: z.string().uuid(), sampledQty: z.string().optional().nullable(), items: z.array(resultItemSchema).min(1) });

export const recordResultsAction = withAudit('quality.recordResults', async (raw: z.infer<typeof recordResultsSchema>) => {
  const user = await requirePermission('quality.inspect');
  const input = recordResultsSchema.parse(raw);
  const { check, allPassed, anyCritical } = await db.transaction((tx) =>
    recordResults(
      tx, input.checkId,
      input.items.map((i) => ({ ...i, valueNumeric: i.valueNumeric ? D(i.valueNumeric) : null })),
      user.actor, { sampledQty: input.sampledQty ? D(input.sampledQty) : null },
    ),
  );
  revalidatePath(`/kalite/kontroller/${input.checkId}`);
  return {
    data: { id: check.id, allPassed, anyCritical },
    audit: { action: 'update', tableName: 'qc_checks', recordId: check.id, summary: `${check.docNo}: sonuçlar girildi (${allPassed ? 'tümü uygun' : 'uygunsuzluk var'})` },
  };
});

const decideSchema = z.object({
  checkId: z.string().uuid(),
  decision: z.enum(['released', 'rejected']),
  releaseToLocationId: z.string().uuid().optional().nullable(),
  rejectToLocationId: z.string().uuid().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  returnToSupplier: z.boolean().optional(),
});

export const decideCheckAction = withAudit('quality.decideCheck', async (raw: z.infer<typeof decideSchema>) => {
  const user = await requirePermission('quality.release');
  const input = decideSchema.parse(raw);
  const result = await db.transaction((tx) =>
    decide(tx, input.checkId, {
      decision: input.decision, releaseToLocationId: input.releaseToLocationId, rejectToLocationId: input.rejectToLocationId,
      note: input.note, returnToSupplier: input.returnToSupplier,
    }, user.actor),
  );
  revalidatePath('/kalite/kontroller');
  revalidatePath(`/kalite/kontroller/${input.checkId}`);
  revalidatePath('/depo/lotlar');
  revalidatePath('/depo/stok');
  return {
    data: { id: result.check.id, lotStatus: result.lot.status },
    audit: {
      action: input.decision === 'released' ? 'approve' : 'reject', tableName: 'qc_checks', recordId: result.check.id,
      summary: `${result.check.docNo}: ${input.decision === 'released' ? 'serbest bırakıldı' : 'reddedildi'} (lot ${result.lot.lotNo})`,
    },
  };
});

/* ==================================================================== */
/* QC şablon yönetimi                                                    */
/* ==================================================================== */

const templateItemSchema = z.object({
  name: z.string().min(1, 'Kalem adı gerekli'),
  kind: z.enum(['numeric', 'boolean', 'text', 'document']),
  minValue: z.string().optional().nullable(),
  maxValue: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  isCritical: z.boolean().optional(),
});

const templateSchema = z.object({
  code: z.string().min(2, 'Kod gerekli'),
  name: z.string().min(2, 'Ad gerekli'),
  productId: z.string().uuid().optional().nullable(),
  productType: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  items: z.array(templateItemSchema).min(1, 'En az bir kalem ekleyin'),
});

export const createTemplateAction = withAudit('quality.createTemplate', async (raw: z.infer<typeof templateSchema>) => {
  const user = await requirePermission('quality.inspect');
  const input = templateSchema.parse(raw);
  const row = await db.transaction((tx) => createTemplate(tx, { ...input, productId: input.productId || null, productType: input.productType || null }, user.actor));
  revalidatePath('/kalite/sablonlar');
  return { data: { id: row.id }, audit: { action: 'create', tableName: 'qc_templates', recordId: row.id, summary: `Kalite şablonu ${row.name} oluşturuldu` } };
});

export const updateTemplateAction = withAudit('quality.updateTemplate', async (raw: { id: string } & z.infer<typeof templateSchema>) => {
  const user = await requirePermission('quality.inspect');
  const { id, ...rest } = raw;
  const input = templateSchema.parse(rest);
  const row = await db.transaction((tx) => updateTemplate(tx, id, { ...input, productId: input.productId || null, productType: input.productType || null }, user.actor));
  revalidatePath('/kalite/sablonlar');
  revalidatePath(`/kalite/sablonlar/${id}`);
  return { data: { id: row.id }, audit: { action: 'update', tableName: 'qc_templates', recordId: row.id, summary: `Kalite şablonu ${row.name} güncellendi` } };
});

const toggleTemplateSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const setTemplateActiveAction = withAudit('quality.setTemplateActive', async (raw: z.infer<typeof toggleTemplateSchema>) => {
  const user = await requirePermission('quality.inspect');
  const input = toggleTemplateSchema.parse(raw);
  const row = await db.transaction((tx) => setTemplateActive(tx, input.id, input.isActive, user.actor));
  revalidatePath('/kalite/sablonlar');
  return { data: { id: row.id, isActive: row.isActive }, audit: { action: 'update', tableName: 'qc_templates', recordId: row.id, summary: `Kalite şablonu ${row.name} ${input.isActive ? 'aktif edildi' : 'pasif edildi'}` } };
});

/* ==================================================================== */
/* Tedarikçi kalite skoru                                                */
/* ==================================================================== */

const periodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM bekleniyor') });

export const computeSupplierScoresAction = withAudit('quality.computeSupplierScores', async (raw: z.infer<typeof periodSchema>) => {
  const user = await requirePermission('quality.inspect');
  const input = periodSchema.parse(raw);
  const rows = await db.transaction((tx) => computeSupplierScores(tx, input.period, user.actor));
  revalidatePath('/kalite/tedarikci-skoru');
  return { data: { count: rows.length }, audit: { action: 'other', tableName: 'supplier_scores', summary: `Tedarikçi kalite skoru hesaplandı — ${input.period} (${rows.length} tedarikçi)` } };
});

/* ==================================================================== */
/* Geri çağırma                                                          */
/* ==================================================================== */

const simulateSchema = z.object({ rootLotId: z.string().uuid(), direction: z.enum(['forward', 'backward', 'both']).default('both'), reason: z.string().trim().min(3, 'Gerekçe gerekli') });

export const simulateRecallAction = withAudit('quality.simulateRecall', async (raw: z.infer<typeof simulateSchema>) => {
  const user = await requirePermission('quality.recall');
  const input = simulateSchema.parse(raw);
  const result = await db.transaction((tx) => simulate(tx, input, user.actor));
  revalidatePath('/kalite/geri-cagirma');
  return { data: { id: result.recall.id, docNo: result.recall.docNo }, audit: { action: 'create', tableName: 'recalls', recordId: result.recall.id, summary: `Geri çağırma simülasyonu ${result.recall.docNo} oluşturuldu` } };
});

const idSchema = z.object({ id: z.string().uuid() });

export const initiateRecallAction = withAudit('quality.initiateRecall', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('quality.recall');
  const input = idSchema.parse(raw);

  const { result, pendingNotifications } = await db.transaction(async (tx) => {
    const r = await initiate(tx, input.id, user.actor);
    const rows = r.pendingNotificationIds.length
      ? await tx
          .select({ n: notifications, partnerEmail: partners.email, partnerWhatsapp: partners.whatsapp })
          .from(notifications)
          .leftJoin(partners, eq(partners.id, notifications.partnerId))
          .where(inArray(notifications.id, r.pendingNotificationIds))
      : [];
    return { result: r, pendingNotifications: rows };
  });

  // Gerçek dış gönderim (e-posta/WhatsApp, sandbox) — katman kuralı gereği transaction DIŞINDA,
  // `purchasing/actions.ts` `runReplenishmentAction` ile aynı örüntü.
  for (const row of pendingNotifications) {
    const n = row.n;
    const to = n.channel === 'whatsapp' ? row.partnerWhatsapp : row.partnerEmail;
    const sendResult = !to
      ? { ok: false, error: 'Cari için iletişim bilgisi tanımlı değil', sandbox: true as const }
      : n.channel === 'whatsapp'
        ? await whatsapp.sendWhatsApp({ to, body: n.body })
        : await email.sendEmail({ to, subject: n.title, body: n.body });
    await db.update(notifications).set({ status: sendResult.ok ? 'sent' : 'failed', sentAt: sendResult.ok ? new Date() : null, error: sendResult.ok ? null : (sendResult.error ?? null) }).where(eq(notifications.id, n.id));
  }

  revalidatePath('/kalite/geri-cagirma');
  revalidatePath(`/kalite/geri-cagirma/${input.id}`);
  revalidatePath('/depo/lotlar');
  revalidatePath('/depo/sevkiyat');
  revalidatePath('/bildirimler');
  const auditEntries: AuditInfo[] = [
    {
      action: 'other', tableName: 'recalls', recordId: result.recall.id,
      summary: `Geri çağırma ${result.recall.docNo} başlatıldı — ${result.blockedLots} lot bloklandı, ${result.notifiedCustomers} müşteri bilgilendirildi${result.cancelledDeliveries ? `, ${result.cancelledDeliveries} açık irsaliye iptal edildi` : ''}`,
    },
  ];
  return {
    data: { blockedLots: result.blockedLots, notifiedCustomers: result.notifiedCustomers, cancelledDeliveries: result.cancelledDeliveries, cancelledDeliveryDocNos: result.cancelledDeliveryDocNos },
    audit: auditEntries,
  };
});

const recallActionSchema = z.object({ itemId: z.string().uuid(), action: z.enum(['block', 'notify', 'return', 'destroy']), note: z.string().trim().optional().nullable() });

export const recordRecallActionAction = withAudit('quality.recordRecallAction', async (raw: z.infer<typeof recallActionSchema>) => {
  const user = await requirePermission('quality.recall');
  const input = recallActionSchema.parse(raw);
  const row = await db.transaction((tx) => recordRecallAction(tx, input.itemId, input.action, input.note || null, user.actor));
  revalidatePath(`/kalite/geri-cagirma/${row.recallId}`);
  return { data: { id: row.id, actionStatus: row.actionStatus }, audit: { action: 'update', tableName: 'recall_items', recordId: row.id, summary: `Geri çağırma aksiyonu kaydedildi (${input.action})` } };
});

export const closeRecallAction = withAudit('quality.closeRecall', async (raw: z.infer<typeof idSchema>) => {
  const user = await requirePermission('quality.recall');
  const input = idSchema.parse(raw);
  const row = await db.transaction((tx) => closeRecall(tx, input.id, user.actor));
  revalidatePath('/kalite/geri-cagirma');
  revalidatePath(`/kalite/geri-cagirma/${input.id}`);
  return { data: { id: row.id, status: row.status }, audit: { action: 'update', tableName: 'recalls', recordId: row.id, summary: `Geri çağırma ${row.docNo} kapatıldı` } };
});
