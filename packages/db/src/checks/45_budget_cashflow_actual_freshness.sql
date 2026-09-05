-- I45 — Bütçe/nakit akışı "gerçekleşen" alanlarının muhasebeyle tazeliği (veri-critic Tur 6, YENİ
-- kural, P1, KIRMIZI, kök neden, CANLI OLARAK KANITLANDI).
--
-- `packages/core/src/finance/budget.ts::refreshActuals` (`/finans/butce`, "Yenile" düğmesi,
-- `apps/web/src/modules/finance/budget-actions.ts::refreshBudgetActualsAction`) `budget_lines.actual`
-- / `.variance` ve `cashflow_lines.actual_revenue`/`actual_collections`/`actual_fixed_expenses`/
-- `actual_net_cashflow` kolonlarını posted/reversed yevmiye satırlarından TEK SEFERLİK hesaplayıp
-- yazar (upsert). Bu bir CANLI/hesaplanan sütun DEĞİL, kullanıcı butonuna basmadıkça hiç
-- güncellenmeyen bir ÖNBELLEK — `postJournalEntry`/`postStockMove` çağrılarının HİÇBİRİ bu fonksiyonu
-- tetiklemez (`grep -rn "refreshActuals" packages/core/src/accounting/journal.ts
-- packages/core/src/stock/ledger.ts` → 0 sonuç) ve `apps/worker/src/jobs/cashflowRecompute.ts`
-- (`0 3 * * *` nightly cron) da tetiklemez — o iş yalnızca `cashflow_lines.actual_net_cashflow`yu
-- OKUYUP AI nakit tahmini üretir, hiç YAZMAZ. Yani muhasebeye YENİ bir satış/tahsilat/gider fişi
-- posted olur olmaz `/finans/butce` ekranındaki "gerçekleşen"/"sapma" sütunları ve nightly nakit
-- tahmini sessizce ESKİ veriye göre kalır — hiçbir uyarı/"son güncelleme" rozeti yok.
--
-- **Canlı egzersizle kanıtlandı**: fresh seed sonrası `postJournalEntry(ledger:'both',
-- origin:'manual', refType:'manual_test_budget_staleness', entryDate:'2026-09-05',
-- lines:[{accountCode:'770.02',debit:5000},{accountCode:'100',credit:5000}])` doğrudan
-- `packages/core`'dan çağrıldı (VUK id `0c95ac57-...`, UFRS id `77ef55b2-...`, ikisi de
-- `status='posted'`) → `pnpm db:check`in mevcut I1-I44 kurallarının **HİÇBİRİ** bunu yakalamadı
-- (44/44 GEÇTİ kaldı — bu satırların hiçbiri budget_lines/cashflow_lines'a bakmıyor), AMA
-- `budget_lines` (id=`2376bcd0-...`, period='2026-09', account_code='770.02') `actual=0,0000`
-- göstermeye devam etti (gerçek muhasebe hareketi 5.000,00 TL) ve aynı periyodun `cashflow_lines`
-- satırı `actual_fixed_expenses=0,0000` (gerçek 5.000,00 TL) + `actual_net_cashflow` 5.000,00 TL
-- YANLIŞ (iyimser) kaldı. Test verisi (2 journal_entries + journal_lines + audit_log) temizlenip
-- `pnpm db:reset` ile taze seed'e dönüldü — reset sonrası (refreshActuals seed'in son adımında
-- tekrar çalıştığı için) I45 0 ihlale döner; bu kural yalnızca CANLI kullanımda (kullanıcı "Yenile"ye
-- basmadan yeni muhasebe kaydı oluştuğunda) kırmızıya döner.
--
-- **Kök neden dosyası**: `packages/core/src/finance/budget.ts::refreshActuals` — tetikleyicisi yok
-- (manuel eylem). **Düzeltme önerisi**: (a) `postJournalEntry` içinde etkilenen hesap kodu
-- 600/601/610/620/770.*/120/100/102 önekleriyle eşleşiyorsa, ilgili `period`/`account_code` (veya
-- `channel_id`) için nokta-atışı (tüm bütçeyi değil yalnızca dokunulan satırı) `budget_lines`/
-- `cashflow_lines` güncellemesi tetikle; ya da (b) `/finans/butce` ve `/finans/nakit-akisi`
-- ekranlarına `cashflow_lines`/`budget_lines`'ın en son ne zaman `refreshActuals` ile hesaplandığını
-- gösteren bir "Son güncelleme: …" rozeti + nightly `cashflowRecompute` işine (03:00) her koşuda
-- ÖNCE `refreshActuals`'ı çağırma adımı ekle (en azından günlük tazeliği garantile).
--
-- Not: `channelRevenueActual`/`getAccountBalance`'ın SQL karşılığı burada elle tekrarlanır (core
-- katmanı SQL'e derlenemeyen bir kütüphane değil — bu formül `packages/core/src/finance/budget.ts`
-- ile birebir senkron tutulmalı, orası değişirse burası da güncellenmeli).

WITH bl AS (
  SELECT
    id, period, kind, account_code, channel_id, planned, actual,
    (period || '-01')::date AS period_start,
    (date_trunc('month', (period || '-01')::date) + interval '1 month - 1 day')::date AS period_end
  FROM budget_lines
),
bl_computed AS (
  SELECT
    bl.id, bl.period, bl.account_code, bl.actual,
    CASE
      WHEN bl.kind = 'revenue' AND bl.channel_id IS NOT NULL THEN (
        SELECT coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0)
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.channel_id = bl.channel_id AND jl.ledger = 'VUK'
          AND je.status IN ('posted', 'reversed')
          AND je.entry_date >= bl.period_start AND je.entry_date <= bl.period_end
          AND jl.account_code IN ('600', '601')
      )
      WHEN bl.account_code IS NOT NULL THEN (
        SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.entry_id
        WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed')
          AND je.entry_date >= bl.period_start AND je.entry_date <= bl.period_end
          AND (jl.account_code = bl.account_code OR jl.account_code LIKE bl.account_code || '.%')
      )
      ELSE 0
    END AS computed_actual
  FROM bl
),
cf_periods AS (SELECT DISTINCT period FROM budget_lines),
cf_bounds AS (
  SELECT period,
    (period || '-01')::date AS period_start,
    (date_trunc('month', (period || '-01')::date) + interval '1 month - 1 day')::date AS period_end
  FROM cf_periods
),
cf_bal AS (
  SELECT
    b.period,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '600' OR jl.account_code LIKE '600.%')) AS bal600,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '601' OR jl.account_code LIKE '601.%')) AS bal601,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '610' OR jl.account_code LIKE '610.%')) AS bal610,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '120' OR jl.account_code LIKE '120.%')) AS bal120,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '770' OR jl.account_code LIKE '770.%')) AS bal770,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '100' OR jl.account_code LIKE '100.%')) AS bal100,
    (SELECT coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.ledger = 'VUK' AND je.status IN ('posted', 'reversed') AND je.entry_date BETWEEN b.period_start AND b.period_end
        AND (jl.account_code = '102' OR jl.account_code LIKE '102.%')) AS bal102
  FROM cf_bounds b
),
cf_computed AS (
  SELECT
    cl.id, cl.period,
    cl.actual_revenue, (-(bal.bal600 + bal.bal601 + bal.bal610)) AS computed_revenue,
    cl.actual_collections, (-bal.bal120) AS computed_collections,
    cl.actual_fixed_expenses, bal.bal770 AS computed_fixed_expenses,
    cl.actual_net_cashflow, (bal.bal100 + bal.bal102) AS computed_net_cashflow
  FROM cashflow_lines cl
  JOIN cf_bal bal ON bal.period = cl.period
  WHERE cl.scenario = 'base'
)

SELECT 'I45' AS rule, 'budget_line_actual_stale' AS entity, id::text AS id,
  computed_actual AS expected, actual AS actual, (actual - computed_actual) AS diff
FROM bl_computed
WHERE abs(actual - computed_actual) > 0

UNION ALL
SELECT 'I45', 'cashflow_actual_revenue_stale', id::text, computed_revenue, coalesce(actual_revenue, 0), (coalesce(actual_revenue, 0) - computed_revenue)
FROM cf_computed WHERE abs(coalesce(actual_revenue, 0) - computed_revenue) > 0

UNION ALL
SELECT 'I45', 'cashflow_actual_collections_stale', id::text, computed_collections, coalesce(actual_collections, 0), (coalesce(actual_collections, 0) - computed_collections)
FROM cf_computed WHERE abs(coalesce(actual_collections, 0) - computed_collections) > 0

UNION ALL
SELECT 'I45', 'cashflow_actual_fixed_expenses_stale', id::text, computed_fixed_expenses, coalesce(actual_fixed_expenses, 0), (coalesce(actual_fixed_expenses, 0) - computed_fixed_expenses)
FROM cf_computed WHERE abs(coalesce(actual_fixed_expenses, 0) - computed_fixed_expenses) > 0

UNION ALL
SELECT 'I45', 'cashflow_actual_net_cashflow_stale', id::text, computed_net_cashflow, coalesce(actual_net_cashflow, 0), (coalesce(actual_net_cashflow, 0) - computed_net_cashflow)
FROM cf_computed WHERE abs(coalesce(actual_net_cashflow, 0) - computed_net_cashflow) > 0

ORDER BY id;
