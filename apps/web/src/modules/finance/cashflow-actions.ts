'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db, cashflowAssumptions } from '@plantero/db';
import { eq } from 'drizzle-orm';
import { projectCashflow, applyOverride, SCENARIOS } from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

const scenarioSchema = z.enum(SCENARIOS as unknown as [string, ...string[]]);

function revalidateFinance() {
  revalidatePath('/finans/nakit-akisi');
  revalidatePath('/finans/break-even');
  revalidatePath('/finans/butce');
  revalidatePath('/finans/tahmin');
}

const recomputeSchema = z.object({ scenario: scenarioSchema });

/** "Yeniden hesapla" — projeksiyonu geçerli varsayımlarla yeniden üretip 36 satırı kalıcı hale getirir */
export const recomputeCashflowAction = withAudit('finance.recomputeCashflow', async (raw: z.infer<typeof recomputeSchema>) => {
  await requirePermission('finance.manage');
  const input = recomputeSchema.parse(raw);
  const lines = await db.transaction((tx) => projectCashflow(tx, input.scenario as (typeof SCENARIOS)[number], { persist: true }));
  revalidateFinance();
  return { data: { count: lines.length }, audit: { action: 'other' as const, tableName: 'cashflow_lines', summary: `${input.scenario} senaryosu yeniden hesaplandı (${lines.length} ay)` } };
});

const overrideSchema = z.object({
  scenario: scenarioSchema,
  period: z.string().regex(/^\d{4}-\d{2}$/),
  field: z.enum(['revenue', 'otherInflows', 'investments']),
  channelCode: z.string().optional(),
  value: z.string().nullable(),
});

/** Excel'deki "mavi hücre" düzenlemesi: bir dönem/senaryo için kanal cirosu, diğer giriş veya yatırım override'ı */
export const applyCashflowOverrideAction = withAudit('finance.applyCashflowOverride', async (raw: z.infer<typeof overrideSchema>) => {
  await requirePermission('finance.manage');
  const input = overrideSchema.parse(raw);
  await db.transaction((tx) =>
    applyOverride(tx, { scenario: input.scenario as (typeof SCENARIOS)[number], period: input.period, field: input.field, channelCode: input.channelCode, value: input.value }, { months: 36 }),
  );
  revalidateFinance();
  const label = input.field === 'revenue' ? `${input.channelCode} cirosu` : input.field === 'otherInflows' ? 'diğer girişler' : 'yatırım';
  return {
    data: undefined,
    audit: { action: 'update' as const, tableName: 'cashflow_lines', summary: `${input.period} (${input.scenario}): ${label} ${input.value ? `${input.value} olarak elle girildi` : 'formüle geri döndürüldü'}` },
  };
});

const updateAssumptionSchema = z.object({ key: z.string().min(1), value: z.string().min(1) });

/** Varsayımlar drawer'ı: tek bir anahtar/değer günceller — projeksiyon her okumada canlı hesaplanır */
export const updateAssumptionAction = withAudit('finance.updateAssumption', async (raw: z.infer<typeof updateAssumptionSchema>) => {
  await requirePermission('finance.manage');
  const input = updateAssumptionSchema.parse(raw);
  // `weighted_margin_pct` artık motorda KULLANILMAZ (kanal tablosundan türetilir — bkz.
  // `deriveWeightedMarginPct`, P0 kök neden düzeltmesi); yazılmasına izin vermek sonuçsuz bir
  // değişikliğe izin verip kullanıcıyı yanıltır.
  if (input.key === 'weighted_margin_pct') throw new Error('Ağırlıklı marj artık kanal tablosundan otomatik hesaplanır — bu alan elle düzenlenemez');
  const [before] = await db.select().from(cashflowAssumptions).where(eq(cashflowAssumptions.key, input.key)).limit(1);
  if (!before) throw new Error(`Bilinmeyen varsayım: ${input.key}`);
  await db.update(cashflowAssumptions).set({ value: input.value, updatedAt: new Date() }).where(eq(cashflowAssumptions.key, input.key));
  revalidateFinance();
  return {
    data: undefined,
    audit: { action: 'update' as const, tableName: 'cashflow_assumptions', recordId: input.key, summary: `${before.label}: ${before.value} → ${input.value}`, before: { value: before.value }, after: { value: input.value } },
  };
});
