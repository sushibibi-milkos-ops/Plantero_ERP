-- I65 — Kanal siparişi (channel_orders, pazaryeri'nin GERÇEK raporladığı tutarlar) ↔ dönüştüğü
-- sales_orders (sistemin channel.commissionPct/shippingDeductionPerOrder/otherDeductionPct ile
-- YENİDEN HESAPLADIĞI tutarlar) — Veri bütünlüğü turu 14 (Aşama-4 tur-14, veri-critic), YENİ kural,
-- CANLI OLARAK KANITLANDI.
--
-- Kök neden: `packages/core/src/sales/channels.ts::convertChannelOrder` bir pazaryeri siparişini
-- `createSalesDoc`'a yalnızca SATIRLARI (barkod eşleşmiş ürün+miktar+birim fiyat) ile aktarır —
-- `channel_orders.commission_amount`/`shipping_amount`/`net_amount` (pazaryerinin KENDİ API'sinden
-- gelen GERÇEK, o siparişe özel kesinti rakamları; bkz. `packages/integrations/src/marketplace/
-- trendyol.ts` ve `hepsiburada.ts`: `const commission = Number(raw.commissionAmount ?? 0)`) HİÇBİR
-- ZAMAN `sales_orders`a taşınmaz. Bunun yerine `packages/core/src/sales/orders.ts::createSalesDoc`
-- (satır ~206-216) `computeChannelDeductions(subtotal, channel)`
-- (`packages/core/src/sales/pricing.ts`) çağırarak komisyonu/kargoyu/net ciroyu SIFIRDAN, o ANDAKİ
-- statik `sales_channels.commission_pct`/`shipping_deduction_per_order`/`other_deduction_pct`
-- ayarlarıyla YENİDEN hesaplar — pazaryerinin bildirdiği gerçek rakamı tamamen YOK SAYAR.
--
-- Bugün (sandbox modu) `packages/integrations/src/marketplace/shared.ts::sandboxFetchOrders` sahte
-- siparişi ÜRETİRKEN de AYNI `channel.commissionPct`'i okuyup kullandığından (satır 40, 69) iki taraf
-- tesadüfen HER ZAMAN örtüşür — bu kural bugün (fresh seed) 0 ihlal verir. Ama CANLI modda (gerçek
-- Trendyol/Hepsiburada API'si — kategoriye/kampanyaya göre değişen, sistemdeki TEK statik oranla
-- ASLA birebir aynı olmayacak gerçek komisyon rakamları döndürür) bu her siparişte GARANTİ bir sapma
-- üretir: `/satis/net-ciro` KPI'sı (docs/modules/satis.md §6, "Veri kaynağı: sales_orders + channel_
-- settlements") ve muhasebeye giden net ciro rakamı, pazaryerinin GERÇEKTE ödeyeceği tutarla asla
-- eşleşmeyecek şekilde SİSTEMATİK OLARAK yanlış olur — bu, kullanıcı `/satis/kanallar`'dan
-- `commissionPct`'i değiştirdiği anda geçmiş `channel_orders`ın da artık kendi orijinal (doğru)
-- rakamıyla eşleşmediği anlamına gelir (channel_orders bir kez daha ASLA yeniden okunmaz —
-- `ingestChannelOrders`: `if (existing?.syncStatus === 'converted') continue;`).
--
-- CANLI DOĞRULAMA (rollback'li vitest transaction'ı, `packages/core/src/sales/
-- _critic_probe_i65.test.ts`, `pnpm --filter @plantero/core exec vitest run
-- src/sales/_critic_probe_i65.test.ts` ile çalıştırıldı, egzersiz sonrası dosya SİLİNDİ — repoda iz
-- bırakmadı): kanal komisyonu `commissionPct='20'` iken, pazaryerinin GERÇEKTE %35 komisyon
-- uyguladığı bir sipariş (subtotal=200, gerçek komisyon=70, gerçek net=130) `ingestChannelOrders`
-- ile işlendi → `channel_orders.commission_amount=70.0000` (gerçek, marketplace raporu, değişmeden
-- saklanıyor) AMA `sales_orders.commission_amount=40.0000` (sistemin %20 ile YENİDEN hesapladığı,
-- 70.0000 DEĞİL) — `sales_orders.net_revenue=160.0000` (sistem) vs `channel_orders.net_amount=130.0000`
-- (marketplace'in gerçekte ödeyeceği). Aşağıdaki SQL bu anlık görüntüde anında 1 satır (commission_
-- amount sapması) + 1 satır (net_revenue sapması) ihlal verdi.
--
-- Düzeltme önerisi: `convertChannelOrder`, `computeChannelDeductions` ile YENİDEN hesaplamak yerine
-- `channel_orders.commission_amount`/`shipping_amount`/`net_amount`'ı DOĞRUDAN `createSalesDoc`a
-- (ya da confirmOrder sonrası bir `UPDATE sales_orders SET commission_amount=..., net_revenue=...`
-- adımına) aktarmalı — kanal ayarlarındaki statik oran yalnızca ELLE oluşturulan (pazaryeri
-- senkronundan gelmeyen) siparişlerde bir TAHMİN/varsayılan olarak kullanılmalı.

SELECT
  'I65' AS rule, 'channel_order_commission_drift' AS entity, co.id::text AS id,
  co.commission_amount::numeric(18, 4) AS expected, so.commission_amount::numeric(18, 4) AS actual,
  (so.commission_amount - co.commission_amount)::numeric(18, 4) AS diff
FROM channel_orders co
JOIN sales_orders so ON so.id = co.sales_order_id
WHERE co.sync_status = 'converted' AND abs(so.commission_amount - co.commission_amount) > 0

UNION ALL

SELECT
  'I65', 'channel_order_shipping_drift', co.id::text,
  co.shipping_amount::numeric(18, 4), so.shipping_deduction::numeric(18, 4),
  (so.shipping_deduction - co.shipping_amount)::numeric(18, 4)
FROM channel_orders co
JOIN sales_orders so ON so.id = co.sales_order_id
WHERE co.sync_status = 'converted' AND abs(so.shipping_deduction - co.shipping_amount) > 0

UNION ALL

SELECT
  'I65', 'channel_order_net_revenue_drift', co.id::text,
  co.net_amount::numeric(18, 4), so.net_revenue::numeric(18, 4),
  (so.net_revenue - co.net_amount)::numeric(18, 4)
FROM channel_orders co
JOIN sales_orders so ON so.id = co.sales_order_id
WHERE co.sync_status = 'converted' AND abs(so.net_revenue - co.net_amount) > 0

UNION ALL

-- Savunma katmanı: 'converted' iken sales_order_id boş, ya da 'converted' DIŞINDA bir statüde
-- sales_order_id dolu olmamalı (tutarsız senkron durumu — gelecekteki bir regresyona karşı).
SELECT
  'I65', 'channel_order_sync_status_mismatch', co.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM channel_orders co
WHERE (co.sync_status = 'converted' AND co.sales_order_id IS NULL)
   OR (co.sync_status <> 'converted' AND co.sales_order_id IS NOT NULL)

ORDER BY id;
