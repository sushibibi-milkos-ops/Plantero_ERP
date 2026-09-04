'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@plantero/db';
import { refreshActuals } from '@plantero/core';
import { requirePermission } from '@/lib/auth';
import { withAudit } from '@/lib/actions';

const refreshSchema = z.object({ year: z.number().int().min(2020).max(2100) });

/** "Gerçekleşenleri yenile" — muhasebeden (posted yevmiye satırları) actual/variance'ı yeniden okur */
export const refreshBudgetActualsAction = withAudit('finance.refreshBudgetActuals', async (raw: z.infer<typeof refreshSchema>) => {
  const user = await requirePermission('finance.manage');
  const input = refreshSchema.parse(raw);
  const result = await db.transaction((tx) => refreshActuals(tx, user.actor, { year: input.year }));
  revalidatePath('/finans/butce');
  revalidatePath('/finans/nakit-akisi');
  return {
    data: result,
    audit: { action: 'other' as const, tableName: 'budget_lines', summary: `${input.year} bütçesi gerçekleşenleri yenilendi (${result.budgetLinesUpdated} bütçe satırı, ${result.cashflowLinesUpdated} nakit akışı ayı)` },
  };
});
