# Veri Bütünlüğü Kuralları (veri-critic her turda doğrular — tolerans sıfır)

| # | Kural | SQL dosyası |
|---|---|---|
| I1 | Σ(stock_quants.qty × lot.unit_cost) [ürün tipi kırılımı] = 150/152/153 hesap bakiyeleri (VUK ve UFRS ayrı ayrı) | `checks/01_inventory_value.sql` |
| I2 | Her stock_moves: qty × unit_cost = value; quant bakiyesi = Σ giriş − Σ çıkış (lokasyon+lot); quant.qty ≥ 0; reserved ≤ qty | `checks/02_stock_ledger.sql` |
| I3 | Her değerli stok hareketinin VUK ve UFRS fişi var; her stok fişinin move'u var | `checks/03_stock_journal_link.sql` |
| I4 | Her yevmiye: Σdebit = Σcredit; kapalı döneme kayıt yok; VUK fişi ↔ UFRS ikizi | `checks/04_journal_balance.sql` |
| I5 | Lot geri: her mamul lotu → origin_work_order_id dolu → iş emrinin ≥1 tüketimi var → her tüketim lotu origin_receipt_id (veya origin WO) dolu | `checks/05_lot_backward.sql` |
| I6 | Lot ileri: her delivery_lines.lot_id dolu (lotlu ürün) ve lot released; Σ tüketim + Σ sevk + Σ fire + eldeki ≤ lot initial_qty (+ sayım fazlası) | `checks/06_lot_forward.sql` |
| I7 | Belge zinciri: her delivery→sales_order, invoice(sales)→delivery|sales_order, payment_allocation→invoice bağı document_links'te var; origin='manual' olmayan belge zincirsiz olamaz | `checks/07_document_chain.sql` |
| I8 | Miktar zinciri: sales_order_lines.delivered_qty = Σ delivery_lines.picked_qty; invoiced_qty ≤ delivered_qty; PO received_qty = Σ receipt_lines.qty | `checks/08_qty_chain.sql` |
| I9 | Cari bakiye: partners.balance = Σ satış faturaları (posted) − Σ tahsilat allocations (+iadeler) = 120.cari bakiyesi (VUK) | `checks/09_partner_balance.sql` |
| I10 | Fatura: residual = grand_total − paid_amount; Σ allocations = paid_amount; status tutarlı | `checks/10_invoice_residual.sql` |
| I11 | Banka: her bank_transaction en fazla 1 approved/auto_applied match; matched → payment/journal var; suggested/rejected match bakiyeyi etkilemez | `checks/11_bank_reconciliation.sql` |
| I12 | KDV: 391 = Σ satış fatura line_vat; 191 = Σ alış fatura line_vat (dönem bazında) | `checks/12_vat.sql` |
| I13 | Kur farkı: dövizli fatura grand_total_try = grand_total × exchange_rate; tahsilatta fx_difference = amount × (tahsilat kuru − fatura kuru) ve 646/656 fişi var | `checks/13_fx.sql` |
| I14 | Üretim: WO total_cost = material_cost + overhead_cost; Σ consumption.value = material_cost; Σ outputs.value = total_cost (kapalı WO); output lot unit_cost = value/qty | `checks/14_production_cost.sql` |
| I15 | 151 WIP bakiyesi = Σ (açık WO material_cost − Σ output value) | `checks/15_wip.sql` |
| I16 | Karantina/red lotu müşteri veya üretim lokasyonuna hareket etmemiş | `checks/16_lot_status_moves.sql` |
| I17 | Audit: son 24 saatteki her create/post işlemi için audit_log satırı var (server action'lar) | `checks/17_audit_coverage.sql` |
