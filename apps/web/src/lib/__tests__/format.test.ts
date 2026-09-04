import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { formatMoney, formatQty, formatInt, formatPct, formatDate, formatDateTime, relativeTime, daysUntil, initials, slugify, parseMoneyInput } from '../format';

describe('formatMoney', () => {
  it('TRY: ₺1.234,56 (tr-TR)', () => {
    expect(formatMoney('1234.5600')).toBe('₺1.234,56');
    expect(formatMoney(new Decimal('1234.56'))).toBe('₺1.234,56');
    expect(formatMoney(0)).toBe('₺0,00');
    expect(formatMoney(null)).toBe('₺0,00');
  });
  it('yarım yukarı yuvarlar, negatif korunur', () => {
    expect(formatMoney('0.005')).toBe('₺0,01');
    expect(formatMoney('-99.999')).toBe('-₺100,00');
  });
  it('diğer para birimleri', () => {
    expect(formatMoney('10', 'EUR')).toBe('€10,00');
    expect(formatMoney('10', 'USD')).toBe('$10,00');
  });
  it('büyük tutarlarda hassasiyet kaybı yok', () => {
    expect(formatMoney('123456789012345.6789')).toBe('₺123.456.789.012.345,68');
  });
  // Tur 3 P2 bulgusu: Intl'in `style:'currency'+notation:'compact'` ikilisi ICU sürümüne göre
  // sembolü sona düşürebiliyordu ("16 B ₺") — sayfadaki her yerdeki sembol-önde biçimle çelişiyordu
  // (net-ciro grafiği Y ekseni). Sembol artık manuel olarak sayının önüne (negatifte işaretten
  // sonra) sabitleniyor, ICU'nun kısaltma yerleşimine bağımlı değil.
  it('compact: sembol her zaman önde (₺ sonda değil) — Intl "B"/"Mn" öncesine daralmayan boşluk (NBSP) koyar', () => {
    expect(formatMoney(16000, 'TRY', { compact: true })).toBe('₺16 B');
    expect(formatMoney(-16000, 'TRY', { compact: true })).toBe('-₺16 B');
    expect(formatMoney(2500000, 'TRY', { compact: true })).toBe('₺2,5 Mn');
    expect(formatMoney(16000, 'TRY', { compact: true }).startsWith('₺')).toBe(true);
  });
});

describe('formatQty / formatInt', () => {
  it('gereksiz sıfır yok, en fazla 3 ondalık', () => {
    expect(formatQty('1250.5000', 'kg')).toBe('1.250,5 kg');
    expect(formatQty('1250.0000')).toBe('1.250');
    expect(formatQty('0.12345')).toBe('0,123');
  });
  it('tam sayı', () => {
    expect(formatInt('1234.7')).toBe('1.235');
  });
});

describe('formatPct', () => {
  it('yüzde puanı → %12,5', () => {
    expect(formatPct('12.5')).toBe('%12,5');
    expect(formatPct(100)).toBe('%100');
    expect(formatPct('0.04', 2)).toBe('%0,04');
  });
});

describe('tarih', () => {
  const d = new Date('2026-09-02T11:35:00Z'); // İstanbul: 14:35
  it('dd.MM.yyyy, Europe/Istanbul', () => {
    expect(formatDate(d)).toBe('02.09.2026');
    expect(formatDateTime(d)).toBe('02.09.2026 14:35');
  });
  it('gece yarısı UTC → İstanbul ertesi gün değil, aynı gün 03:00', () => {
    expect(formatDateTime('2026-01-01T00:30:00Z')).toBe('01.01.2026 03:30');
    // 22:30 UTC İstanbul'da ertesi gün 01:30
    expect(formatDate('2026-01-01T22:30:00Z')).toBe('02.01.2026');
  });
  it('geçersiz → —', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('abc')).toBe('—');
  });
  it('relativeTime Türkçe', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    expect(relativeTime(now, now)).toBe('az önce');
    expect(relativeTime(new Date(now.getTime() - 3 * 3600_000), now)).toMatch(/saat önce/);
  });
  it('daysUntil takvim günü', () => {
    const now = new Date('2026-09-02T12:00:00Z');
    expect(daysUntil('2026-09-02T20:00:00Z', now)).toBe(0);
    expect(daysUntil('2026-10-02T00:00:00Z', now)).toBe(30);
    expect(daysUntil('2026-09-01T00:00:00Z', now)).toBe(-1);
    expect(daysUntil(null, now)).toBeNull();
  });
});

// Tur 14, P0: /finans/tahsilat/yeni "çift tahsilat engeli" kusurunun kök nedeni — bkz.
// apps/web/src/lib/format.ts (parseMoneyInput) ve
// apps/web/src/modules/finance/components/allocation-amount-input.tsx dosya başı yorumları.
describe('parseMoneyInput', () => {
  it('tr-TR biçimi: nokta binlik, virgül ondalık', () => {
    expect(parseMoneyInput('1.020,00')).toBe('1020');
    expect(parseMoneyInput('920,00')).toBe('920');
    expect(parseMoneyInput('1.234.567,89')).toBe('1234567.89');
    expect(parseMoneyInput('0,5')).toBe('0.5');
  });
  it('kanonik/API biçimi: noktalı ondalık, binlik ayraç yok', () => {
    expect(parseMoneyInput('1020.00')).toBe('1020');
    expect(parseMoneyInput('1020')).toBe('1020');
    expect(parseMoneyInput('919.9999')).toBe('919.9999');
  });
  it('boş/geçersiz → null (sessizce 0 değil)', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
    expect(parseMoneyInput(undefined)).toBeNull();
    expect(parseMoneyInput('-')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
  it('bozuk/birleşmiş metin (odak-yarışı sonucu) → null, asla yanlış yorumlanmaz', () => {
    // Kök neden kanıtı: paylaşılan NumberInput'ta odak anındaki yeniden biçimlenme ile
    // otomasyon/gerçek kullanıcı yazımı çakışınca "919,9999" + "1020,00" birleşip
    // "919,99991020,00" gibi ayrıştırılamaz bir metin üretiyordu (prod trace kanıtı, rapor).
    expect(parseMoneyInput('919,99991020,00')).toBeNull();
    expect(parseMoneyInput('1.020.00')).toBeNull();
    expect(parseMoneyInput('1,020,00')).toBeNull();
  });
  it('₺ öneki ve boşluk temizlenir', () => {
    expect(parseMoneyInput('₺ 1.020,00')).toBe('1020');
  });
});

describe('metin', () => {
  it('initials tr-TR', () => {
    expect(initials('Yasin Türker')).toBe('YT');
    expect(initials('ışık')).toBe('I');
    expect(initials('')).toBe('?');
  });
  it('slugify Türkçe karakter', () => {
    expect(slugify('Ayarlar / Kullanıcılar')).toBe('ayarlar-kullanicilar');
    expect(slugify('Üretim Şefi')).toBe('uretim-sefi');
  });
});
