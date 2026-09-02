# Modül: Muhasebe (accounting)

Route kökü `/muhasebe`, izinler `accounting.*`, core `packages/core/src/accounting/**` (journal.ts + mapping.ts hazır; yeni: invoices.ts, payments.ts, bank.ts, reconciliation.ts, vat.ts, fx.ts, einvoice.ts, periods.ts), web `apps/web/src/modules/accounting/**`, seed `seed/accounting-docs.ts` + `seed/bank.ts`, worker job `reconciliation-nightly`.

## Ekranlar
1. `/muhasebe` — özet: banka toplamı (hesap bazında son ekstre bakiyesi + defter bakiyesi farkı), açık alacak/borç, vadesi geçmiş, bu ay KDV pozisyonu (devreden), eşleşmeyen banka hareketi sayısı (sabah onay ekranına link), kapanmamış dönem.
2. `/muhasebe/faturalar` — sekmeler Satış / Alış / İadeler; tablo: no, tarih, cari, kanal, vade (gecikme rozeti: "12 gün gecikti"), tutar, kalan, durum, e-belge durumu (rozet: gönderilmedi/kuyrukta/kabul/red). Filtre durum/vade/kanal/e-belge; toplu "e-Fatura gönder". Detay: satırlar (lot, SMM), yevmiye fişi (VUK + UFRS ikizi), tahsilatlar/allocations, belge zinciri, e-belge geçmişi (UUID, GİB no), "Tahsilat kaydet" hızlı aksiyon, "İade faturası" (credit note → 610/391 ters + stok `return_in` opsiyonu), PDF. Alış faturası formu: tedarikçi, PO/mal kabul seç → satırlar (stoklu: 320.999'u kapatır; gider: hesap seç), KDV %20, `postInvoice` (`kind: purchase`: 320.999 + 191 / 320.cari).
3. `/muhasebe/tahsilatlar` — tahsilat/ödeme listesi; form: cari → açık faturalar listesi (checkbox + tutar dağıtımı, otomatik en eski önce) → banka hesabı / kasa → tarih → tutar (döviz ise kur: o günün TCMB kuru otomatik; kur farkı önizlemesi) → `recordPayment` (102 / 120.cari; allocations; invoice paid/partial; partners.balance; dövizde `fx.ts` ile 646/656 fişi). Çift tahsilat engeli (aynı banka hareketi ikinci kez kullanılamaz).
4. `/muhasebe/banka` — hesap kartları (Vakıfbank TL/EUR, QNB): ekstre bakiyesi, defter bakiyesi (102.xx), fark, son senkron; hareket tablosu (tarih, açıklama, karşı taraf, tutar ±, durum rozeti unmatched/suggested/matched/ignored, eşleşme). **Ekstre içe aktar**: dosya (MT940 `.sta/.txt`, CSV; banka seç, CSV kolon eşleme önizlemesi) → `importStatement` (externalRef ile çift kayıt engeli; duplicateCount) → hemen `runReconciliation(importId)` çalışır → sonuç özeti (otomatik eşlenen / onay bekleyen / bilinmeyen). "Açık bankacılıktan çek" (sandbox).
5. `/muhasebe/mutabakat` — **Sabah onay ekranı** (AI Mutabakat Ajanı): sol liste eşleşmeyen/önerilen hareketler (tarih, açıklama, tutar), sağ panel: önerilen eşleşme kartı (tür: fatura/cari avans/kredi taksiti/gider/pazaryeri hakedişi/banka masrafı; güven % çubuğu; gerekçe: "tutar birebir + cari adı %91 benzer + IBAN daha önce 3 kez eşleşti"), alternatif adaylar, **Onayla** (`approveMatch` → tahsilat/ödeme/fiş üret, `reconciliation_learnings` güncelle, approvals kapat) / **Reddet** (gerekçe; öğrenme: bu deseni bu cariyle eşleştirme) / **Elle eşle** (fatura/cari/hesap seç). Klavye: J/K gez, A onayla, R reddet, animasyonsuz (sık kullanım). Üstte: "bu sabah 14 öneri, 9 otomatik uygulandı (≥%92), 5 onay bekliyor". Geçmiş sekmesi.
6. `/muhasebe/yevmiye` — fiş listesi (defter seçici VUK/UFRS, tarih, yevmiye, açıklama, borç/alacak, kaynak belge linki), detay (satırlar), manuel fiş formu (denge göstergesi canlı; kapalı dönem uyarısı), ters kayıt.
7. `/muhasebe/hesap-plani` — ağaç (kod, ad, tip, bakiye VUK | UFRS yan yana, ifrsCode), hesap detayı: hareketler (muavin), dönem filtresi; mizan görünümü (`/muhasebe/mizan`: borç/alacak/bakiye toplamları, ledger seçici, Excel dışa aktarım).
8. `/muhasebe/kdv` — dönem listesi: hesaplanan (391), indirilecek (191), önceki devreden (190), ödenecek/devreden; "Dönemi hesapla" (`computeVatPeriod` → fiş 391/191/190), grafik: devreden KDV birikimi (Stripe tarzı alan grafiği). Açıklama: %1 satış / %20 alış asimetrisi.
9. `/muhasebe/donemler` — dönem kapat/aç (`accounting.close_period`), kapatınca kapalı döneme fiş atılamaz (journal.ts zaten kontrol eder).
10. `/muhasebe/cariler/[id]/ekstre` — cari ekstresi (fatura/tahsilat/bakiye yürüyen; PDF; "Mutabakat mektubu" e-posta taslağı).

## Core servisleri
- `invoices.ts`: `createPurchaseInvoice`, `postInvoice` (satış + alış; ledger 'both'; KDV satırları taxes'tan; dövizli: exchange_rates günün kuru, grandTotalTry), `createCreditNote`, `cancelInvoice` (ters fiş), `getAging(partnerId?)` (0-30/31-60/61-90/90+).
- `payments.ts`: `recordPayment` (allocations, residual, status, partner balance), `unapplyPayment`.
- `fx.ts`: `getRate(currency, date)` (yoksa integrations tcmb fetch → exchange_rates), `postFxDifference(invoice, payment)`.
- `bank.ts`: `importStatement(bankAccountId, source, parsed)`, `syncOpenBanking`.
- `reconciliation.ts`: `runReconciliation({ bankAccountId?, importId?, since? })`: her unmatched hareket için adaylar (açık faturalar tutar ±%1 ve ±3 gün, cariler ad benzerliği, kredi taksitleri tutar/gün, learnings desen, sabit masraf desenleri) → `@plantero/ai` `matchBankTransaction` → `reconciliation_matches` (suggested); güven ≥0.92 ve tek aday ve tür fatura/kredi/masraf → `auto_applied` (tahsilat/fiş üretir); diğerleri `approvals` (kind 'reconciliation'). `approveMatch`, `rejectMatch`, `manualMatch`, `learnFromDecision`.
- `vat.ts`: `computeVatPeriod(period)`.
- `einvoice.ts`: `sendEInvoice(invoiceId)` (integrations bizimhesap; tür: cari e-fatura mükellefi ise e_fatura değilse e_arsiv; ihracat → export), `pollStatuses`, `sendEDespatch(deliveryId)`.
- `periods.ts`: `closePeriod`, `openPeriod`.

## Seed
- `seed/accounting-docs.ts`: 10 alış faturası (mal kabullerle eşleşen, 320.999 kapanır; 3 gider faturası: kira, elektrik, muhasebe), 4 tahsilat (satış faturalarına), 2 ödeme, 1 ihracat faturası EUR + tahsilatında kur farkı, KDV dönemi 2026-08 hesaplanmış.
- `seed/bank.ts`: Vakıfbank TL 60 gün hareket (sandbox open banking): pazaryeri hakedişleri (Trendyol/Hepsiburada haftalık), toptan müşteri havaleleri (fatura tutarına birebir, açıklamada firma adı/fatura no), Migros ödemesi, kredi taksitleri (7 kredinin gün/tutarına birebir), kira, maaş, elektrik, banka masrafları, 3 tanınmayan hareket (onay ekranına düşer). Import kaydı + `runReconciliation` seed sırasında ÇALIŞMAZ (QA akışı ve worker için bırakılır) — ama demo için 20 hareket önceden eşlenmiş (approved) olsun.

## Kabul kriterleri
- I4, I9, I10, I11, I12, I13 yeşil. Cari bakiye = faturalar − tahsilatlar = 120.cari.
- Mutabakat: seed'deki fatura tutarına birebir havale ≥%92 ile otomatik; belirsizler onay ekranında; onay sonrası tahsilat + fiş + bakiye güncel; ret öğreniliyor.
- e-Fatura sandbox: gönder → accepted, UUID ve GİB no dolu.
