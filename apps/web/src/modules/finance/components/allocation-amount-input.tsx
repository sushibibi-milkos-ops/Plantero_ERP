'use client';

import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { parseTrNumber, formatTrNumber } from '@/components/form/number-input';

/**
 * Fatura tahsis tutarı girişi (`/finans/tahsilat/yeni` satır tablosu) — tur 14, P0 düzeltmesi.
 *
 * Kök neden: paylaşılan `NumberInput` (apps/web/src/components/form/number-input.tsx, ORTAK dosya,
 * bu modül değiştiremez — bkz. rapor "ortak bileşen talebi") odaklanınca ekranda 2 ondalıkla görünen
 * metni ("920,00") DEĞİL, `value` prop'unun tam hassasiyetini (numeric(18,4) → "919.9999") yeniden
 * biçimlendirip yazıyor VE odakta metni seçili bırakmıyor (`select()` yok). Bir fatura kalanı gibi
 * 4 ondalıklı ama 2 ondalık gösterilen bir değer satıra önceden yazılmışsa (checkbox işaretlenince
 * `toggleInvoice` kalan tutarı otomatik doldurur), kullanıcı/otomasyon odaklanır odaklanmaz metin
 * "920,00" → "919,9999" olarak DEĞİŞİYOR; hemen ardından yazılan yeni tutar SEÇİLİ metnin yerine
 * değil, bu değişen metnin SONUNA ekleniyor ("919,99991020,00" gibi ayrıştırılamaz bir dize).
 * `parseTrNumber` bunu null döndürüyor, satır SESSİZCE tahsissiz kalıyor — kullanıcı bir faturayı
 * tahsis ediyormuş gibi görünürken ödeme aslında tahsissiz (avans) kaydediliyordu (bkz.
 * packages/core/src/finance/payments.ts, RecordPaymentForm).
 *
 * Bu bileşen paylaşılan dosyayı değiştirmeden aynı ayrıştırma/biçimlendirme mantığını (saf
 * `parseTrNumber`/`formatTrNumber` fonksiyonları, oradan İTHAL edilir, kopyalanmaz) yeniden
 * kullanır ama odaklanınca `input.select()` çağırır — böylece hemen ardından yazılan/yapıştırılan
 * metin her zaman seçili olanın YERİNE geçer, asla sonuna eklenmez; yarış artık oluşamaz.
 *
 * İNCE NOKTA (ilk sürümde eksikti, gate2 e2e koşusuyla yakalandı): `select()`'i React'in
 * `setText(...)`'ten sonraki YENİDEN RENDER'ını beklemeden, event handler içinde SENKRON çağırmak
 * yetmiyor — DOM'daki `<input>.value` o an hâlâ ESKİ (odaktan önceki) metin olduğundan, seçim eski
 * metni kapsıyor; React'in async re-render'ı biraz sonra `value`'yu YENİ metne çevirince tarayıcı
 * seçimi yeni metnin uzunluğuna göre KIRPIYOR (bir alt küme kalıyor, tamamı değil) — yani aynı yarış
 * farklı bir yoldan geri geliyordu. Çözüm: `input.value`'yu React'i beklemeden BURADA, senkron
 * olarak nihai metne çevirip `select()`'i ONDAN SONRA çağırmak (React'in bir sonraki render'ı aynı
 * değeri zaten yazacağından çakışma olmaz — idempotent).
 * Kalıcı/genel çözüm paylaşılan `NumberInput`'ta da aynı düzeltmedir (bkz. rapor).
 */
export function AllocationAmountInput({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: string | null | undefined;
  onChange: (canonical: string | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const maxDigits = 2;
  const minDigits = 2;
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatTrNumber(value, maxDigits, minDigits));

  useEffect(() => {
    if (!focused) setText(formatTrNumber(value, maxDigits, minDigits));
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      value={text}
      placeholder="0,00"
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true);
        const raw = value ? new Decimal(value).toFixed().replace('.', ',') : text;
        setText(raw);
        // Kök neden düzeltmesi (bkz. dosya başı "İNCE NOKTA"): DOM değerini React'in re-render'ını
        // beklemeden BURADA nihai metne eşitle, seçimi ONDAN SONRA yap — böylece hemen ardından
        // yazılan/otomasyonla doldurulan metin her zaman TAMAMI seçili olanın yerine geçer.
        e.currentTarget.value = raw;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        onChange(parseTrNumber(raw));
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseTrNumber(text);
        const rounded = parsed === null ? null : new Decimal(parsed).toFixed(maxDigits, Decimal.ROUND_HALF_UP);
        onChange(rounded);
        setText(formatTrNumber(rounded, maxDigits, minDigits));
      }}
      className={cn('num h-11 text-right text-[13px] md:h-9 md:text-[13px]', className)}
    />
  );
}
