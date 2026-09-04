-- I30 — Banka hesabı / hareket / ödeme para birimi tutarlılığı
-- Bir banka hesabı tek bir para biriminde tutulur (ör. VKF-TIRE-EUR yalnızca EUR, VKF-TIRE-TL yalnızca TRY) —
-- gerçek bankacılıkta bir TL hesabına EUR yatırılamaz/EUR hesaptan TL çekilemez. Ancak:
--   `packages/core/src/finance/payments.ts::recordPayment` `bankAccountId` seçildiğinde `input.currency` ile
--   o hesabın `bankAccounts.currency`'sini HİÇBİR ŞEKİLDE karşılaştırmıyor (yalnızca `accountCode`'u okuyor) —
--   `resolveCashAccount` fonksiyonu bkz. Aynı şekilde `packages/core/src/finance/bankReconciliation.ts::
--   importStatement` de `line.currency ?? account.currency` ile çağrıyı olduğu gibi kabul ediyor, uyuşmazlığı
--   reddetmiyor. BULGU (tur 10, kök neden — henüz veri ihlali YOK, fresh seed temiz, ama servis katmanında
--   koruma yok): `apps/web/src/modules/finance/components/record-payment-form.tsx`'teki banka hesabı seçici
--   (`bankAccountOptions`) da seçilen `currency` alanına göre FİLTRELENMİYOR — kullanıcı EUR tutar girip TL
--   hesabı (veya tersini) seçebilir, form/server hiçbir uyarı vermeden kaydeder; TL karşılığı (amountTry)
--   yine doğru hesaplanır (muhasebe dengesi bozulmaz) ama 102.xx hesabına gerçekte var olmayan bir döviz
--   hareketi işlenmiş olur — banka ekstresiyle mutabakat asla tutmaz.
-- Fresh seed: 0 ihlal. Düzeltme önerisi: (a) `recordPayment` içine `if (input.bankAccountId) { hesabı çek;
--   hesap.currency !== currency ise ValidationError }` ekle, (b) `record-payment-form.tsx`'te
--   `bankAccountOptions`'ı seçilen `currency`'ye göre filtrele, (c) `importStatement`'ta da aynı kontrolü ekle.

SELECT
  'I30' AS rule, 'payment_bank_account_currency_mismatch' AS entity, p.id::text AS id,
  0::numeric(18, 4) AS expected, 1::numeric(18, 4) AS actual, 1::numeric(18, 4) AS diff
FROM payments p
JOIN bank_accounts ba ON ba.id = p.bank_account_id
WHERE p.currency <> ba.currency

UNION ALL

SELECT
  'I30', 'bank_tx_account_currency_mismatch', bt.id::text,
  0::numeric(18, 4), 1::numeric(18, 4), 1::numeric(18, 4)
FROM bank_transactions bt
JOIN bank_accounts ba ON ba.id = bt.bank_account_id
WHERE bt.currency <> ba.currency

ORDER BY id;
