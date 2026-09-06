import { describe, it, expect } from 'vitest';
import { db, maintenanceOrders } from '@plantero/db';
import { eq, sql } from 'drizzle-orm';
import { completeOrder, updateDiagnosis } from './orders.js';

const SYSTEM: any = { userId: null, actorType: 'system', actorLabel: 'veri-critic-probe' };

describe('veri-critic canlı egzersiz — I51 stale-cost gap', () => {
  it('updateDiagnosis, done bir iş emrinde muhasebe fişini bayatlatabiliyor mu', async () => {
    let captured: any = {};
    let caught: any = null;
    try {
      await db.transaction(async (tx) => {
        const [mo] = await tx.select().from(maintenanceOrders).where(eq(maintenanceOrders.status, 'in_progress')).limit(1);
        let order = mo;
        if (!order) {
          const [any] = await tx.select().from(maintenanceOrders).where(eq(maintenanceOrders.status, 'waiting_parts')).limit(1);
          order = any;
        }
        if (!order) {
          // Fresh seed'de zaten 'done' olan bir sipariş kullan — asıl test edilen şey zaten budur:
          // TAMAMLANMIŞ bir siparişin maliyetinin sonradan değiştirilip değiştirilemediği.
          const [doneOrder] = await tx.select().from(maintenanceOrders).where(eq(maintenanceOrders.status, 'done')).limit(1);
          if (!doneOrder) throw new Error('NO_ORDER_AT_ALL');
          order = doneOrder;
        } else {
          order = await completeOrder(tx, order.id, { laborCost: '450.0000', partsCost: '180.0000' }, SYSTEM);
        }
        captured.afterComplete = { status: order.status, partsCost: order.partsCost, laborCost: order.laborCost };

        const beforeJe: any = await tx.execute(sql.raw(`select jl.account_code, jl.debit, jl.credit, je.ledger from journal_entries je join journal_lines jl on jl.entry_id=je.id where je.ref_type='maintenance_order' and je.ref_id='${order.id}' order by je.ledger, jl.account_code`));
        captured.jeAfterComplete = beforeJe.rows ?? beforeJe;

        const mutated = await updateDiagnosis(tx, order.id, { partsCost: '99999.0000' }, SYSTEM);
        captured.afterMutate = { status: mutated.status, partsCost: mutated.partsCost, laborCost: mutated.laborCost };

        const afterJe: any = await tx.execute(sql.raw(`select jl.account_code, jl.debit, jl.credit, je.ledger from journal_entries je join journal_lines jl on jl.entry_id=je.id where je.ref_type='maintenance_order' and je.ref_id='${order.id}' order by je.ledger, jl.account_code`));
        captured.jeAfterMutate = afterJe.rows ?? afterJe;

        const i51: any = await tx.execute(sql.raw(`SELECT mo.id::text AS id, (mo.parts_cost + mo.labor_cost)::numeric(18,4) AS current_total
          FROM maintenance_orders mo
          WHERE mo.id = '${order.id}'
            AND mo.status='done' AND (mo.parts_cost+mo.labor_cost)>0
            AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.ref_type='maintenance_order' AND je.ref_id=mo.id AND je.status IN ('posted','reversed'))
            AND NOT EXISTS (SELECT 1 FROM document_links dl WHERE dl.source_type='maintenance_order' AND dl.source_id=mo.id AND dl.target_type='journal_entry')`));
        captured.i51FlagsIt = (i51.rows ?? i51).length > 0;

        throw new Error('ROLLBACK_ON_PURPOSE');
      });
    } catch (e: any) {
      caught = e;
    }
    console.log('CAUGHT', caught?.message, caught?.cause, caught?.query, caught?.stack?.slice(0, 2000));
    console.log('CAPTURED', JSON.stringify(captured, null, 2));
    // Assertion doesn't matter here, this is a probe — we just want the console output.
    expect(true).toBe(true);
  });
});
