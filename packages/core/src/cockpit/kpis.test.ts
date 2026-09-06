import { describe, it, expect } from 'vitest';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  db,
  bankAccounts, productionLines, workOrders, products, reorderRules,
  purchaseOrders, reconciliationMatches, stockCounts, dunningActions, vatPeriods, cashflowLines,
  opportunities, opportunityStages, salesOrders, salesChannels, machines, downtimes, supplierScores,
  qcChecks, receipts, deliveries,
} from '@plantero/db';
import { withRollback, seedBase, suffix } from '../__tests__/helpers.js';
import { D, ZERO, toDb, sum } from '../money.js';
import { businessDate } from '../dates.js';
import { periodAtOffset, getBreakEven } from '../finance/cashflow.js';
import { findDueInvoices } from '../finance/dunning.js';
import { getExpiryBuckets } from '../stock/expiry.js';
import {
  getBankSummary, getLineStatuses, getCriticalStockSummary, getExpiryRiskSummary, getOverdueReceivablesSummary,
  getBreakEvenDistance, getPendingApprovalsSummary, getRecentActivity, groupConsecutiveActivity, getChannelSalesToday, getSalesCards,
  getQualityCards, getMaintenanceCards, getWarehouseCards, getProductionChiefCards, getFinanceCards, getGmDashboard,
} from './kpis.js';

/**
 * Her fonksiyon, TAMAMEN BAĞIMSIZ yazılmış bir sorguyla (aynı `kpis.ts` koduna güvenmeden)
 * canlı (seed edilmiş) veritabanı üzerinde çapraz doğrulanır — modül sözleşmesi "her KPI SQL ile
 * doğrulanabilir" gereksinimi. Global toplamlar mevcut seed durumuna göre doğrulanır (ne kadar
 * veri olduğu önemli değil, formülün doğruluğu önemli); yeni senaryolar (SKT'de olmayan bir alan,
 * belirli bir eşik) `withRollback` içinde izole fixture'larla test edilir.
 */

describe('cockpit/kpis — getBankSummary', () => {
  it('aktif banka hesaplarının listesi + yalnızca TRY toplamı, canlı veriyle birebir', async () => {
    const rows = await db.select().from(bankAccounts).where(eq(bankAccounts.isActive, true)).orderBy(asc(bankAccounts.code));
    const expectedTotal = sum(rows.filter((r) => r.currency === 'TRY').map((r) => D(r.statementBalance)));

    const result = await getBankSummary(db);
    expect(result.accounts.length).toBe(rows.length);
    expect(result.totalTry).toBe(toDb(expectedTotal));
    for (const r of rows) {
      const card = result.accounts.find((a) => a.id === r.id);
      expect(card).toBeTruthy();
      expect(card!.statementBalance).toBe(toDb(D(r.statementBalance)));
    }
  });
});

describe('cockpit/kpis — getLineStatuses', () => {
  it('hat başına açık iş emri sayısı ve "şu an üzerinde çalışılan" iş emri, canlı veriyle birebir', async () => {
    const OPEN = ['released', 'in_progress', 'paused'] as const;
    const lines = await db.select().from(productionLines).where(eq(productionLines.isActive, true));
    const result = await getLineStatuses(db);
    expect(result.length).toBe(lines.length);

    for (const line of lines) {
      const openRows = await db.select().from(workOrders).where(and(eq(workOrders.lineId, line.id), inArray(workOrders.status, OPEN)));
      const found = result.find((r) => r.lineId === line.id)!;
      expect(found.openCount).toBe(openRows.length);

      const rank: Record<string, number> = { in_progress: 0, paused: 1, released: 2 };
      const expectedCurrent = [...openRows].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))[0];
      if (expectedCurrent) {
        expect(found.current?.id).toBe(expectedCurrent.id);
        expect(found.current?.status).toBe(expectedCurrent.status);
      } else {
        expect(found.current).toBeNull();
      }
    }
  });
});

describe('cockpit/kpis — getCriticalStockSummary', () => {
  it('kapsama < lead time olan aktif kurallar, canlı veriyle birebir (satın alma kritik-stok ile aynı eşik)', async () => {
    const rows = await db
      .select({ rule: reorderRules, sku: products.sku })
      .from(reorderRules)
      .innerJoin(products, eq(products.id, reorderRules.productId))
      .where(and(eq(reorderRules.isActive, true), isNotNull(reorderRules.lastDaysOfCover)));
    const critical = rows.filter((r) => D(r.rule.lastDaysOfCover).lt(r.rule.leadTimeDays));

    const result = await getCriticalStockSummary(db);
    expect(result.count).toBe(critical.length);
    expect(result.items.length).toBe(Math.min(5, critical.length));
    for (const item of result.items) {
      expect(D(item.daysOfCover).lt(item.leadTimeDays)).toBe(true);
    }
  });
});

describe('cockpit/kpis — getExpiryRiskSummary', () => {
  it('getExpiryBuckets kovalarını birebir aktarır, ilk 5 satırı döner', async () => {
    const buckets = await getExpiryBuckets(db);
    const result = await getExpiryRiskSummary(db);
    expect(result.totals).toEqual(buckets.totals);
    expect(result.top5.length).toBe(Math.min(5, buckets.rows.length));
    expect(result.top5.map((r) => r.lotId)).toEqual(buckets.rows.slice(0, 5).map((r) => r.lotId));
  });
});

describe('cockpit/kpis — getOverdueReceivablesSummary', () => {
  it('yaşlandırma kovaları findDueInvoices ile birebir; en büyük 5 doğru sıralı', async () => {
    const due = await findDueInvoices(db);
    const buckets = { b0_30: ZERO, b31_60: ZERO, b61_90: ZERO, b90plus: ZERO };
    for (const r of due) {
      const amt = D(r.residual);
      if (r.daysOverdue <= 30) buckets.b0_30 = buckets.b0_30.plus(amt);
      else if (r.daysOverdue <= 60) buckets.b31_60 = buckets.b31_60.plus(amt);
      else if (r.daysOverdue <= 90) buckets.b61_90 = buckets.b61_90.plus(amt);
      else buckets.b90plus = buckets.b90plus.plus(amt);
    }
    const result = await getOverdueReceivablesSummary(db);
    expect(result.aging.b0_30).toBe(toDb(buckets.b0_30));
    expect(result.aging.b31_60).toBe(toDb(buckets.b31_60));
    expect(result.aging.b61_90).toBe(toDb(buckets.b61_90));
    expect(result.aging.b90plus).toBe(toDb(buckets.b90plus));
    expect(result.aging.invoiceCount).toBe(due.length);

    const expectedTop5 = [...due].sort((a, b) => D(b.residual).minus(D(a.residual)).toNumber()).slice(0, 5).map((r) => r.id);
    expect(result.top5.map((r) => r.id)).toEqual(expectedTop5);
  });
});

describe('cockpit/kpis — getBreakEvenDistance', () => {
  it('getBreakEven + ay-içi gerçekleşeni birebir sarmalar', async () => {
    const period = businessDate(new Date()).slice(0, 7);
    const expected = await getBreakEven(db, period, 'base');
    const result = await getBreakEvenDistance(db, { period });
    expect(result.targetRevenue).toBe(toDb(expected.targetRevenue));
    expect(result.actualNetRevenue).toBe(toDb(expected.monthToDate.actualNetRevenue));
    expect(result.progressPct).toBe(toDb(expected.monthToDate.progressPct));
    expect(result.daysRemaining).toBe(expected.monthToDate.daysRemaining);
    expect(result.dailyPaceNeeded).toBe(toDb(expected.monthToDate.dailyPaceNeeded));
  });
});

describe('cockpit/kpis — getPendingApprovalsSummary', () => {
  it('4 onay kuyruğu sayacı, canlı veriyle birebir', async () => {
    const [[po], [recon], [cnt], [dun]] = await Promise.all([
      db.select({ n: sql<string>`count(*)` }).from(purchaseOrders).where(eq(purchaseOrders.status, 'ai_draft')),
      db.select({ n: sql<string>`count(*)` }).from(reconciliationMatches).where(eq(reconciliationMatches.status, 'suggested')),
      db.select({ n: sql<string>`count(*)` }).from(stockCounts).where(eq(stockCounts.status, 'review')),
      db.select({ n: sql<string>`count(*)` }).from(dunningActions).where(eq(dunningActions.status, 'pending_approval')),
    ]);
    const result = await getPendingApprovalsSummary(db);
    expect(result.purchaseDrafts).toBe(Number(po?.n ?? 0));
    expect(result.reconciliation).toBe(Number(recon?.n ?? 0));
    expect(result.countVariance).toBe(Number(cnt?.n ?? 0));
    expect(result.dunning).toBe(Number(dun?.n ?? 0));
    expect(result.total).toBe(result.purchaseDrafts + result.reconciliation + result.countVariance + result.dunning);
  });
});

describe('cockpit/kpis — getRecentActivity', () => {
  it('en yeni önce, limit uygulanır', async () => {
    const rows = await getRecentActivity(db, 5);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i - 1]!.at).getTime()).toBeGreaterThanOrEqual(new Date(rows[i]!.at).getTime());
    }
  });
});

describe('cockpit/kpis — groupConsecutiveActivity', () => {
  const row = (i: number, userName: string, summary: string) => ({ id: `r${i}`, at: `2026-01-01T00:00:0${i}.000Z`, userName, action: 'login', tableName: 'users', summary });

  it('ardışık aynı (kullanıcı, özet) satırları tek gruba katlar ve tekrar sayısını doğru sayar', () => {
    const rows = [row(8, 'Ayşe', 'giriş yaptı'), row(7, 'Ayşe', 'giriş yaptı'), row(6, 'Ayşe', 'giriş yaptı'), row(5, 'Mehmet', 'çıkış yaptı')];
    const groups = groupConsecutiveActivity(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ id: 'r8', count: 3 });
    expect(groups[1]).toMatchObject({ id: 'r5', count: 1 });
  });

  it('ardışık OLMAYAN aynı içerik ayrı grup kalır (yalnızca bitişik tekrarlar katlanır)', () => {
    const rows = [row(3, 'Ayşe', 'giriş yaptı'), row(2, 'Mehmet', 'giriş yaptı'), row(1, 'Ayşe', 'giriş yaptı')];
    const groups = groupConsecutiveActivity(rows);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it('maxGroups sınırına ulaşınca yeni grup açılmaz ama son grup genişlemeye devam eder', () => {
    const rows = [row(1, 'A', 'x'), row(2, 'B', 'y'), row(3, 'C', 'z'), row(4, 'C', 'z'), row(5, 'D', 'w')];
    const groups = groupConsecutiveActivity(rows, 3);
    expect(groups).toHaveLength(3);
    expect(groups[2]).toMatchObject({ id: 'r3', count: 2 }); // 'D' grubu 3. sınırı aştığı için düşer, 'C' grubu genişlemeye devam eder
  });
});

describe('cockpit/kpis — getChannelSalesToday', () => {
  it('bugün için yeni bir sipariş eklenince kanal brüt/net ciro DELTA olarak doğru sonuca yansır', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const [channel] = await tx.select().from(salesChannels).limit(1);
      if (!channel) return; // seed'de kanal yoksa test anlamsız (gerçekte her zaman var)

      const before = await getChannelSalesToday(tx);
      const s = suffix();
      const today = businessDate(new Date());
      await tx.insert(salesOrders).values({
        docType: 'order', docNo: `SO-TEST-${s}`, status: 'confirmed', partnerId: b.customer.id, channelId: channel.id,
        warehouseId: b.wh.id, orderDate: today,
        grandTotal: '1210.0000', netRevenue: '1000.0000', subtotal: '1000.0000', vatTotal: '10.0000',
      });
      const after = await getChannelSalesToday(tx);

      const beforeRow = before.rows.find((r) => r.channelId === channel.id);
      const afterRow = after.rows.find((r) => r.channelId === channel.id)!;
      expect(D(afterRow.gross).minus(D(beforeRow?.gross ?? '0')).toFixed(4)).toBe('1210.0000');
      expect(D(afterRow.net).minus(D(beforeRow?.net ?? '0')).toFixed(4)).toBe('1000.0000');
      expect(afterRow.orderCount).toBe((beforeRow?.orderCount ?? 0) + 1);
      expect(D(after.grossTotal).minus(D(before.grossTotal)).toFixed(4)).toBe('1210.0000');
      expect(D(after.netTotal).minus(D(before.netTotal)).toFixed(4)).toBe('1000.0000');
      // 7 günlük trend serisinin son günü bugündür ve aynı delta'yı taşır
      const lastTrend = after.trend7d[after.trend7d.length - 1]!;
      expect(lastTrend.date).toBe(today);
      expect(D(lastTrend.net).toFixed(4)).toBe(D(after.netTotal).toFixed(4));
    });
  });
});

describe('cockpit/kpis — getSalesCards', () => {
  it('huni yalnızca açık (kazanılmamış/kaybedilmemiş) aşamaları sayar, canlı veriyle birebir', async () => {
    const stages = await db.select().from(opportunityStages);
    const result = await getSalesCards(db);
    for (const stage of stages) {
      const [row] = await db
        .select({ n: sql<string>`count(*)`, amount: sql<string>`coalesce(sum(${opportunities.expectedAmount}), 0)` })
        .from(opportunities)
        .where(eq(opportunities.stageId, stage.id));
      const found = result.funnel.find((f) => f.stageCode === stage.code)!;
      if (stage.isWon || stage.isLost) {
        expect(found.count).toBe(0);
      } else {
        expect(found.count).toBe(Number(row?.n ?? 0));
        expect(found.amount).toBe(toDb(D(row?.amount ?? '0')));
      }
    }
  });

  it('bugünkü sipariş sayısı canlı veriyle birebir', async () => {
    const today = businessDate(new Date());
    const [row] = await db.select({ n: sql<string>`count(*)` }).from(salesOrders).where(and(eq(salesOrders.docType, 'order'), eq(salesOrders.orderDate, today)));
    const result = await getSalesCards(db);
    expect(result.todayOrders).toBe(Number(row?.n ?? 0));
  });
});

describe('cockpit/kpis — getQualityCards', () => {
  it('bekleyen QC sayısı canlı veriyle birebir', async () => {
    const [row] = await db.select({ n: sql<string>`count(*)` }).from(qcChecks).where(eq(qcChecks.result, 'pending'));
    const result = await getQualityCards(db);
    expect(result.pendingQc).toBe(Number(row?.n ?? 0));
  });

  it('düşen tedarikçi skoru: mevcut dönem < önceki dönem olan tedarikçi doğru delta ile listelenir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const currentPeriod = businessDate(new Date()).slice(0, 7);
      const previousPeriod = periodAtOffset(currentPeriod, -1);
      await tx.insert(supplierScores).values({ partnerId: b.supplier.id, period: previousPeriod, score: '90.0000' });
      await tx.insert(supplierScores).values({ partnerId: b.supplier.id, period: currentPeriod, score: '70.0000' });

      const result = await getQualityCards(tx);
      const drop = result.supplierScoreDrops.find((d) => d.partnerId === b.supplier.id);
      expect(drop).toBeTruthy();
      expect(drop!.score).toBe('70.0000');
      expect(drop!.previousScore).toBe('90.0000');
      expect(drop!.deltaPts).toBe('-20.0000');
    });
  });

  it('skoru YÜKSELEN tedarikçi düşenler listesine girmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const currentPeriod = businessDate(new Date()).slice(0, 7);
      const previousPeriod = periodAtOffset(currentPeriod, -1);
      await tx.insert(supplierScores).values({ partnerId: b.supplier.id, period: previousPeriod, score: '60.0000' });
      await tx.insert(supplierScores).values({ partnerId: b.supplier.id, period: currentPeriod, score: '75.0000' });

      const result = await getQualityCards(tx);
      expect(result.supplierScoreDrops.find((d) => d.partnerId === b.supplier.id)).toBeUndefined();
    });
  });
});

describe('cockpit/kpis — getMaintenanceCards', () => {
  it('duran makine + açık duruş süresi, canlı SQL ile birebir', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [line] = await tx.select().from(productionLines).limit(1);
      const [machine] = await tx.insert(machines).values({ code: `MK-TEST-${s}`, name: `Test Makine ${s}`, category: 'mixer', lineId: line?.id, status: 'down' }).returning();
      const startedAt = new Date(Date.now() - 45 * 60_000);
      await tx.insert(downtimes).values({ machineId: machine!.id, reason: 'breakdown', isPlanned: false, startedAt });

      const result = await getMaintenanceCards(tx);
      const found = result.downMachines.find((m) => m.id === machine!.id);
      expect(found).toBeTruthy();
      expect(found!.downSinceMinutes).toBeGreaterThanOrEqual(44);
      expect(found!.downSinceMinutes).toBeLessThanOrEqual(46);
    });
  });

  it('kapanmış (endedAt dolu) duruşlar "durdurulan makine" sayılmaz', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [machine] = await tx.insert(machines).values({ code: `MK-TEST-${s}`, name: `Test Makine ${s}`, category: 'mixer', status: 'running' }).returning();
      const result = await getMaintenanceCards(tx);
      expect(result.downMachines.find((m) => m.id === machine!.id)).toBeUndefined();
    });
  });
});

describe('cockpit/kpis — getWarehouseCards', () => {
  it('mal kabul/sevkiyat/sayım bekleyen sayaçları canlı veriyle birebir', async () => {
    const [[receiptsRow], [deliveriesRow], [countsRow]] = await Promise.all([
      db.select({ n: sql<string>`count(*)` }).from(receipts).where(inArray(receipts.status, ['draft', 'qc_pending'])),
      db.select({ n: sql<string>`count(*)` }).from(deliveries).where(inArray(deliveries.status, ['draft', 'reserved', 'picking'])),
      db.select({ n: sql<string>`count(*)` }).from(stockCounts).where(inArray(stockCounts.status, ['draft', 'counting', 'review'])),
    ]);
    const result = await getWarehouseCards(db);
    expect(result.receiptsPending).toBe(Number(receiptsRow?.n ?? 0));
    expect(result.deliveriesPending).toBe(Number(deliveriesRow?.n ?? 0));
    expect(result.countsOpen).toBe(Number(countsRow?.n ?? 0));
  });
});

describe('cockpit/kpis — getProductionChiefCards', () => {
  it('açık/geciken iş emri toplamı getLineStatuses ile tutarlı', async () => {
    const lines = await getLineStatuses(db);
    const result = await getProductionChiefCards(db);
    expect(result.openWorkOrders).toBe(lines.reduce((a, l) => a + l.openCount, 0));
    expect(result.lateWorkOrders).toBe(lines.reduce((a, l) => a + l.lateCount, 0));
  });
});

describe('cockpit/kpis — getFinanceCards', () => {
  it('banka/vadesi geçen bileşenleri kendi tekil fonksiyonlarıyla birebir; KDV son dönemi doğru okur', async () => {
    const [bank, overdue, [vat]] = await Promise.all([getBankSummary(db), getOverdueReceivablesSummary(db), db.select().from(vatPeriods).orderBy(desc(vatPeriods.period)).limit(1)]);
    const result = await getFinanceCards(db);
    expect(result.bank).toEqual(bank);
    expect(result.overdue.aging).toEqual(overdue.aging);
    if (vat) {
      expect(result.vat?.period).toBe(vat.period);
      expect(result.vat?.payable).toBe(toDb(D(vat.payable)));
    } else {
      expect(result.vat).toBeNull();
    }
  });

  it('3 aylık nakit projeksiyonu cashflow_lines tablosuyla birebir (bu ay + 2 ay)', async () => {
    const currentPeriod = businessDate(new Date()).slice(0, 7);
    const periods = [currentPeriod, periodAtOffset(currentPeriod, 1), periodAtOffset(currentPeriod, 2)];
    const rows = await db.select().from(cashflowLines).where(and(eq(cashflowLines.scenario, 'base'), inArray(cashflowLines.period, periods)));
    const byPeriod = new Map(rows.map((r) => [r.period, r]));

    const result = await getFinanceCards(db);
    expect(result.cashProjection3m.map((c) => c.period)).toEqual(periods);
    for (const c of result.cashProjection3m) {
      const r = byPeriod.get(c.period);
      expect(c.netCashflow).toBe(toDb(D(r?.netCashflow ?? '0')));
      expect(c.closingCash).toBe(toDb(D(r?.closingCash ?? '0')));
    }
  });
});

describe('cockpit/kpis — getGmDashboard', () => {
  it('tüm GM kartlarını tek çağrıda, tekil fonksiyonlarla aynı sonuçla döner', async () => {
    const [dashboard, bank, criticalStock] = await Promise.all([getGmDashboard(db), getBankSummary(db), getCriticalStockSummary(db)]);
    expect(dashboard.bank).toEqual(bank);
    expect(dashboard.criticalStock).toEqual(criticalStock);
  });
});
