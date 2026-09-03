# Veri Bütünlüğü Kuralları (veri-critic her turda doğrular — tolerans sıfır)

| # | Kural | SQL dosyası |
|---|---|---|
| I1 | Σ(stock_quants.qty × lot.unit_cost) [ürün tipi kırılımı] = 150 / 151.02 / 152 / 153 hesap bakiyeleri (VUK ve UFRS ayrı ayrı); 151.01 (WIP) I1 dışında | `checks/01_inventory_value.sql` |
| I2 | Her stock_moves: qty × unit_cost = value; quant bakiyesi = Σ giriş − Σ çıkış (lokasyon+lot); quant.qty ≥ 0; reserved ≤ qty | `checks/02_stock_ledger.sql` |
| I3 | Her değerli stok hareketinin VUK ve UFRS fişi var; her stok fişinin move'u var | `checks/03_stock_journal_link.sql` |
| I4 | Her yevmiye: Σdebit = Σcredit; kapalı döneme kayıt yok; VUK fişi ↔ UFRS ikizi | `checks/04_journal_balance.sql` |
| I5 | Lot geri: her mamul lotu → origin_work_order_id dolu → iş emrinin ≥1 tüketimi var → her tüketim lotu origin_receipt_id (veya origin WO) dolu | `checks/05_lot_backward.sql` |
| I6 | Lot ileri: her delivery_lines.lot_id dolu (lotlu ürün) ve lot released; Σ tüketim + Σ sevk + Σ fire + eldeki ≤ lot initial_qty (+ sayım fazlası) | `checks/06_lot_forward.sql` |
| I7 | Belge zinciri: her delivery→sales_order, invoice(sales)→delivery|sales_order, payment_allocation→invoice bağı document_links'te var; origin='manual' olmayan belge zincirsiz olamaz | `checks/07_document_chain.sql` |
| I8 | Miktar zinciri: sales_order_lines.delivered_qty = Σ delivery_lines.picked_qty; invoiced_qty ≤ delivered_qty; PO received_qty = Σ receipt_lines.qty | `checks/08_qty_chain.sql` |
| I9 | Cari bakiye: partners.balance = Σ satış faturaları (posted) − Σ tahsilat allocations (+iadeler) = 120.cari bakiyesi (VUK) | `checks/09_partner_balance.sql` |
| I10 | Fatura: residual = grand_total − paid_amount; Σ allocations = paid_amount; status tutarlı | `checks/10_invoice_residual.sql` |
| I11 | Banka: her bank_transaction en fazla 1 approved/auto_applied match; matched → payment/journal var; suggested/rejected match bakiyeyi etkilemez; eşleşen tutar = ödeme tutarı / fatura tahsis toplamı | `checks/11_bank_reconciliation.sql` |
| I12 | KDV: 391 = Σ satış fatura line_vat; 191 = Σ alış fatura line_vat (dönem bazında) | `checks/12_vat.sql` |
| I13 | Kur farkı: dövizli fatura grand_total_try = grand_total × exchange_rate; tahsilatta fx_difference = amount × (tahsilat kuru − fatura kuru) ve 646/656 fişi var | `checks/13_fx.sql` |
| I14 | Üretim: WO total_cost = material_cost + overhead_cost; Σ consumption.value = material_cost; Σ outputs.value = total_cost (kapalı WO); output lot unit_cost = value/qty | `checks/14_production_cost.sql` |
| I15 | 151.01 WIP bakiyesi = Σ (açık WO material_cost − Σ output value − Σ fire değeri) | `checks/15_wip.sql` |
| I16 | Karantina/red lotu müşteri veya üretim lokasyonuna hareket etmemiş | `checks/16_lot_status_moves.sql` |
| I17 | Audit: son 24 saatteki her create/post işlemi için audit_log satırı var (server action'lar) | `checks/17_audit_coverage.sql` |
| I18 | Cari bakiye (tedarikçi tarafı, I9'un simetriği): Σ alış faturaları − Σ tahsis edilmiş ödemeler = −partners.balance (payable) = 320 hesabının (alacak−borç) bakiyesi (VUK) | `checks/18_supplier_balance.sql` |
| I19 | Sipariş miktar tavanı: sales_order_lines.delivered_qty ≤ qty; purchase_order_lines.received_qty ≤ qty; purchase_order_lines.invoiced_qty ≤ received_qty | `checks/19_order_qty_ceiling.sql` |
| I20 | Kur kaynağı: dövizli satış faturasının exchange_rate'i fiş tarihine eşit/önceki en yakın exchange_rates.buying (TCMB) ile birebir eşleşmeli (I13 yalnızca fatura içi çarpımı doğrular, kaynağı doğrulamaz) | `checks/20_fx_rate_source.sql` |
| I21 | Devreden KDV (190): vat_periods zinciri — bu ayın carried_from_prev = önceki ayın carried_to_next; payable = greatest(carried_from_prev+input_vat−output_vat, 0); carried_to_next = greatest(−(...), 0); 190 defter bakiyesi = carried_to_next. **Bulgu**: vat_periods'ı dolduran servis yok (bkz. rapor) — kural bugün veri yokluğundan geçiyor, kod tamamlandığında otomatik devreye girer | `checks/21_vat_carryforward.sql` |
| I22 | İş emri denormalize alan tutarlılığı: work_order_materials.consumed_qty = Σ work_order_consumptions.qty (materyal bazında); work_orders.scrap_qty = Σ work_order_scraps.qty; work_orders.yield_pct = round(produced_qty/planned_qty×100, 2) (planned_qty>0 ve dolu iken) | `checks/22_work_order_denorm.sql` |
| I23 | Satın alma faturalama zinciri: her değerli mal kabulünün (receipts, is_valued stok hareketi üreten) bağlı bir alış faturası (invoices.kind='purchase', receiptId) OLMALI — aksi halde 320.999 (Faturası Gelmemiş Alımlar) kapanmaz ve 191 (İndirilecek KDV) hiç doğmaz; purchase_order_lines.received_qty>0 iken invoiced_qty=0 olan satır aynı boşluğun sipariş tarafı yansıması. **Bulgu (tur 2→3 sabit)**: `packages/core/src/purchasing/invoicing.ts` içindeki `createPurchaseInvoiceFromReceipt` servisi yazılmış ve birim testli, ama hiçbir çağıran yok — ne `apps/web` içinde bir server action/route (`apps/web/src/app/(app)/satin-alma` dizini hiç mevcut değil; `nav.ts`'teki "Satın Alma" bağlantıları hedefsiz), ne de seed (`packages/db/src/seed/{stock,production}.ts`) bu servisi çağırıyor. Sonuç: 320.999 iki defterde de −440.730,00 TL kapanmamış bakiyede donuk duruyor, 191 hesabında hiç satır yok (7/7 mal kabul faturasız, 0 satın alma faturası, 0 satın alma siparişi kayıtlı) | `checks/23_purchase_invoice_gap.sql` |
