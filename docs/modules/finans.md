# Modül: Finans (finance)

Route kökü `/finans`, izinler `finance.*`, core `packages/core/src/finance/**`, web `apps/web/src/modules/finance/**`, seed `seed/finance.ts` (krediler/sabit giderler/varsayımlar hazır — genişlet), worker `cashflow-recompute`, `dunning-scheduler`.

## Ekranlar (Stripe Dashboard çıtası)
1. `/finans/nakit-akisi` — **36 aylık projeksiyon** (Eyl 2026 → Ağu 2029): üstte KPI (dönem başı nakit, bu ay net nakit, 12 ay ortalama, minimum nakit ayı uyarısı), büyük alan grafiği (kapanış nakit + net akış çubukları; senaryo seçici base/optimistic/pessimistic; hover'da ay detayı), altta tablo (satırlar: kanal ciroları, tahsilat, değişken gider, brüt kâr, sabit giderler (14 kalem, katlanabilir), FAVÖK, kredi faiz, vergi, anapara, KDV, diğer giriş, yatırım, net nakit, kapanış — kolonlar aylar; yatay kaydırma; **mavi hücreler düzenlenebilir** (overrides: kanal cirosu, diğer girişler, yatırımlar) → anında yeniden hesap). "Varsayımlar" drawer: opening_cash, kurumlar vergisi, tampon, senaryo çarpanı, aylık büyüme, sabit gider artışı, kanal tablosu (ciro/marj/vade). "Excel'den içe aktar" (nakitakisi.xlsx yeniden). Hesap motoru `projectCashflow(scenario)` Excel formülleriyle birebir (ilk ay için doğrulama: Eyl 2026 net nakit 33.278,03 TL; hedef ciro 1.560.717,48 TL).
2. `/finans/break-even` — **canlı başabaş**: "Bu ay gereken minimum ciro" büyük rakam (NumberFlow), formül kartı: sabit gider + kredi taksiti + vergi + tampon ÷ ağırlıklı katkı marjı; kanal payı dağılımı; **gerçekleşen ile karşılaştırma**: ayın bugüne kadarki net cirosu (satış modülünden), kalan gün, günlük gereken tempo, ilerleme çubuğu; duyarlılık tabloları (marj × ciro, toptan ciro senaryoları — Excel Duyarlılık 1-2).
3. `/finans/butce` — bütçe vs gerçekleşen: ay/kanal/hesap kırılımı, plan/gerçek/sapma (renkli), grafik; `refreshActuals` (muhasebeden: 600/601 satış, 7XX giderler, 102 tahsilat).
4. `/finans/krediler` — 7 kredi kartı (banka, ürün, kalan anapara, taksit, kalan taksit, bitiş, faiz tipi), konsolide taksit takvimi (ay × kredi tablosu; ödenen/planlanan/geciken; banka hareketiyle eşleşen taksitler ✓), toplam yük grafiği (aylık taksit → Tem 2028 düşüşü görünür), kredi detayı (amortisman tablosu; değişken faizli Tam Çıpa için faiz oranı güncelleme → yeniden hesap).
5. `/finans/tahsilat-takibi` — **kademeli hatırlatma**: yaşlandırma (0-30/31-60/61-90/90+) KPI, vadesi geçen faturalar tablosu (müşteri, fatura, gecikme, tutar, son hatırlatma, seviye), "Taslak oluştur" → AI (`draftDunningMessage`) e-posta + WhatsApp metni (ton seviyeye göre) → düzenle → **Onayla ve gönder** (`sendDunning` → integrations; dunning_actions sent; invoices.dunningLevel++), onay kuyruğu entegrasyonu (kind 'dunning_message'), geçmiş. Kural tablosu düzenleme (seviye/gün/kanal/ton).
6. `/finans/tahmin` — AI satış/nakit tahmini: son 12 ay kanal satışları + tahmin 6 ay (bant), nakit tahmini; "Yeniden üret" (`forecastSales`/`forecastCash`; fallback mevsimsel); tahminler nakit akışı senaryosuna "uygula" opsiyonu.

## Core servisleri
`finance/cashflow.ts` (`projectCashflow`, `applyOverride`, `getBreakEven(period)`, `getMonthToDate`), `finance/loans.ts` (`buildSchedule`, `recomputeVariableLoan(rate)`, `markInstallmentPaid(bankTxId)`), `finance/budget.ts` (`refreshActuals`), `finance/dunning.ts` (`findDueInvoices`, `createDrafts`, `approveAndSend`), `finance/forecast.ts`.

## Kabul kriterleri
- Projeksiyon ilk ayı ve toplamları Excel ile kuruşu kuruşuna (test: `cashflow.test.ts` Excel değerleriyle).
- Break-even rakamı Excel "HEDEF AYLIK CİRO — Eyl 2026" ile eşit (varsayılan varsayımlarda).
- Kredi taksitleri banka hareketleriyle eşleşince `loan_installments.status=paid` ve 300/780 fişi (I11).
- Hatırlatma: taslak → onay → gönderildi zinciri, WhatsApp/e-posta sandbox kayıtları.
