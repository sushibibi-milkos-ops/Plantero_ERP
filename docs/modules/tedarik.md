# Modül: Tedarik (purchasing)

Route `/satin-alma`, izinler `purchasing.*`, core `packages/core/src/purchasing/**`, web `apps/web/src/modules/purchasing/**`, seed `seed/purchasing.ts`, worker `replenishment-engine`.

## Ekranlar
1. `/satin-alma/kritik-stok` — **kritik stok motoru** panosu: tablo (ürün, depo, eldeki, rezerve, kullanılabilir, günlük tüketim (son 30/90 gün stock_moves consumption+delivery ortalaması), kapsama günü = kullanılabilir ÷ tüketim, lead time, güvenlik günü, min/max, önerilen sipariş = max − kullanılabilir − açık PO (+ tüketim × (lead time + güvenlik)), tercihli tedarikçi, beyaz liste rozeti); risk rengi (kapsama < lead time kırmızı, < lead+güvenlik turuncu). "Motoru çalıştır" (`runReplenishment`: reorder_rules günceller, `@plantero/ai` `draftPurchaseOrders` → tedarikçi bazlı PO taslakları `ai_draft`; beyaz listeli + tutar ≤ autoOrderMaxAmount ise `approved` + otomatik gönderim; diğerleri `pending_approval` + approvals kaydı). Kural düzenleme drawer (min/max/lead/güvenlik/beyaz liste/tedarikçi).
2. `/satin-alma/onay-kuyrugu` — AI taslakları: kart (tedarikçi, kalemler, toplam, AI gerekçesi "kaju 6 günlük stok, lead time 10 gün", güven), Onayla / Düzenle / Reddet; onaylanınca "Tedarikçiye gönder" (PDF + e-posta/WhatsApp sandbox → sentAt, sentVia). Klavye kısayolları animasyonsuz.
3. `/satin-alma/siparisler` — PO listesi (durum, tedarikçi, beklenen tarih, tutar, alınan %), form (tedarikçi → supplier_products fiyat/lead time otomatik), detay (satırlar sipariş/alınan/faturalanan, mal kabuller, faturalar, zincir, PDF, gönderim geçmişi, "Mal kabul oluştur" → /depo/mal-kabul/yeni?po=).
4. `/satin-alma/tedarikciler` — tedarikçi kartları: kalite skoru (kalite modülü), zamanında teslimat %, açık PO, son fiyatlar, lead time; beyaz liste yönetimi.

## Core
`purchasing/replenishment.ts` (`computeConsumptionRates`, `evaluateRules`, `runReplenishment`), `purchasing/orders.ts` (`createPurchaseOrder`, `approvePurchaseOrder`, `rejectPurchaseOrder`, `sendToSupplier` (integrations pdf + messaging), `recomputeStatus`), `purchasing/whitelist.ts`.

## Seed
Reorder kuralları tüm hammadde/ambalaj için (bazıları kritik altında), 3 tedarikçi beyaz listede, 6 PO (2 alınmış → depo seed mal kabulleriyle bağlı olacak şekilde depo seed'i PO id'sini kullanır — sıralama: purchasing seed stock'tan ÖNCE çalışmalı; index'te sırayı buna göre koy: masterdata → accounting → finance → purchasing → stock → production → sales → ...), 1 AI taslak onay bekliyor, 1 otomatik gönderilmiş.

## Kabul
Motor çalışınca kritik kalemler için taslak oluşur; beyaz liste dışı hiçbir PO otomatik gönderilmez; PO → mal kabul zinciri I8.
