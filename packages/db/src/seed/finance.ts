import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { dunningRules, budgets, budgetLines, channelAssumptions, fixedExpenses, salesChannels } from '../schema/index.js';
import { parseNakitAkisi, importNakitAkisi } from '../import/nakitakisi.js';
import { log, readImportFile, type SeedSummary } from './_helpers.js';

const DUNNING_RULES: Array<{ level: number; name: string; daysOffset: number; channels: string[]; tone: string; requiresApproval: boolean; templateHint: string }> = [
  { level: 1, name: 'Nazik Hatırlatma (vade öncesi)', daysOffset: -3, channels: ['email'], tone: 'friendly', requiresApproval: false, templateHint: 'Faturanın vadesi yaklaşıyor, dostane hatırlatma' },
  { level: 2, name: 'Vade Sonrası Hatırlatma', daysOffset: 3, channels: ['email', 'whatsapp'], tone: 'friendly', requiresApproval: true, templateHint: 'Vade geçti, ödeme rica ediliyor' },
  { level: 3, name: 'Sert Hatırlatma', daysOffset: 15, channels: ['email', 'whatsapp'], tone: 'firm', requiresApproval: true, templateHint: 'Gecikme belirgin, netleşme talep ediliyor' },
  { level: 4, name: 'İhtar', daysOffset: 30, channels: ['email'], tone: 'legal', requiresApproval: true, templateHint: 'Hukuki süreç uyarısı içeren resmi ihtar' },
];

const BUDGET_YEAR = 2026;
const BUDGET_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const pad2 = (n: number) => String(n).padStart(2, '0');

export async function seedFinance(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('finance', "Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx okunuyor...");
  const buffer = await readImportFile('Bigetas_Nakit_Akisi_Ciro_Hedefi.xlsx');
  const parsed = await parseNakitAkisi(buffer);
  if (parsed.warnings.length) {
    log('finance', `${parsed.warnings.length} uyarı:`);
    for (const w of parsed.warnings) log('finance', `  - ${w}`);
  }
  const imported = await importNakitAkisi(db, parsed);
  summary.add('loans', imported.loans);
  summary.add('loan_installments', imported.installments);
  summary.add('fixed_expenses', imported.fixedExpenses);
  summary.add('cashflow_assumptions', imported.assumptions);
  summary.add('channel_assumptions', imported.channelAssumptions);

  log('finance', 'tahsilat hatırlatma kuralları...');
  for (const r of DUNNING_RULES) {
    await db
      .insert(dunningRules)
      .values({ level: r.level, name: r.name, daysOffset: r.daysOffset, channels: r.channels, tone: r.tone, requiresApproval: r.requiresApproval, templateHint: r.templateHint })
      .onConflictDoUpdate({ target: dunningRules.level, set: { name: r.name, daysOffset: r.daysOffset, channels: r.channels, tone: r.tone, requiresApproval: r.requiresApproval, templateHint: r.templateHint } });
  }
  summary.add('dunning_rules', DUNNING_RULES.length);

  log('finance', '2026 bütçesi (kanal varsayımları + sabit giderlerden aylık plan)...');
  await db
    .insert(budgets)
    .values({ year: BUDGET_YEAR, name: `${BUDGET_YEAR} Bütçesi`, status: 'draft' })
    .onConflictDoNothing({ target: [budgets.year, budgets.name] });
  const [budget] = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.year, BUDGET_YEAR)).limit(1);
  if (!budget) throw new Error('2026 bütçesi oluşturulamadı');

  const channelRows = await db
    .select({ channelId: channelAssumptions.channelId, monthlyRevenue: channelAssumptions.monthlyRevenue, code: salesChannels.code, name: salesChannels.name })
    .from(channelAssumptions)
    .innerJoin(salesChannels, eq(salesChannels.id, channelAssumptions.channelId));
  const feRows = await db.select().from(fixedExpenses);

  // budget_lines'ın doğal (natural) anahtarı yok — idempotentlik için bu bütçeye ait satırlar
  // önce silinir, sonra güncel kaynak verilerden yeniden üretilir (iki kez çalışınca aynı sonuç).
  await db.delete(budgetLines).where(eq(budgetLines.budgetId, budget.id));

  const newLines: Array<typeof budgetLines.$inferInsert> = [];
  for (const month of BUDGET_MONTHS) {
    const period = `${BUDGET_YEAR}-${pad2(month)}`;
    for (const c of channelRows) {
      newLines.push({ budgetId: budget.id, period, kind: 'revenue', channelId: c.channelId, label: `${c.name} — Ciro`, planned: c.monthlyRevenue });
    }
    for (const fe of feRows) {
      newLines.push({ budgetId: budget.id, period, kind: 'fixed_expense', accountCode: fe.accountCode, label: fe.name, planned: fe.monthlyAmount });
    }
  }
  if (newLines.length) await db.insert(budgetLines).values(newLines);
  summary.add('budget_lines', newLines.length);
}
