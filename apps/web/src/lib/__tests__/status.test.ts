import { describe, expect, it } from 'vitest';
import { getStatusInfo, statusOptions, type StatusKind } from '../status';

// Bir kind içinde muted/neutral hariç hiçbir ton tekrar etmemeli — aksi halde bir tablo sütununda
// iki farklı durum aynı renkte görünür ve durum bilgisi taşımaz (Tur 1 bulgusu: sales_order'da
// confirmed/delivered/invoiced üçü de yeşil, sent/accepted ikisi de mavi görünüyordu).
const REPEATABLE_TONES = new Set(['muted', 'neutral']);

function assertNoToneCollision(kind: StatusKind) {
  const opts = statusOptions(kind);
  const seen = new Map<string, string>();
  for (const o of opts) {
    if (REPEATABLE_TONES.has(o.tone)) continue;
    const prior = seen.get(o.tone);
    if (prior) throw new Error(`${kind}: "${prior}" ve "${o.value}" aynı tonu (${o.tone}) paylaşıyor`);
    seen.set(o.tone, o.value);
  }
}

describe('lib/status — ton çakışması yok', () => {
  it('sales_order: muted/neutral hariç her ton en fazla bir durumda kullanılır', () => {
    assertNoToneCollision('sales_order');
  });

  it('sales_order: Tur 1 bulgusundaki iki küme artık aynı renkte görünmüyor', () => {
    const info = (s: string) => getStatusInfo(s, 'sales_order');
    // sent / accepted (ikisi de mavi görünüyordu)
    expect(info('sent').tone).not.toBe(info('accepted').tone);
    // confirmed / delivered / invoiced (üçü de yeşil görünüyordu): `primary` ve `success` aynı
    // yeşil aile olduğundan (globals.css) bu üçlüden en fazla BİRİ güçlü/renkli (muted/neutral
    // dışı) ton taşıyabilir — aksi halde iki durum yine göz için aynı yeşil olur.
    const strongTones = [info('confirmed').tone, info('delivered').tone, info('invoiced').tone].filter((t) => t !== 'muted' && t !== 'neutral');
    expect(strongTones.length).toBeLessThanOrEqual(1);
    // Tur 2 bulgusu: bu üçlüdeki TEK güçlü ton en ileri aşamaya (invoiced) ait olmalı — Tur 1'de
    // keyfi olarak `delivered`'a verilmişti ve "Faturalandı gri, Sevk edildi yeşil" ters okunuyordu.
    expect(info('invoiced').tone).toBe('success');
  });

  it('opportunity: fırsat aşama kodları (seed/sales.ts STAGES ile birebir) Türkçe etiketlenir', () => {
    for (const code of ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost']) {
      const info = getStatusInfo(code, 'opportunity');
      expect(info.label).not.toBe(code);
      expect(info.label).not.toMatch(/^[a-z]/); // ham enum sızmamalı
    }
  });

  it('sözlükte olmayan durum ham enumu değil "—" döner', () => {
    expect(getStatusInfo('some_unmapped_enum_value', 'sales_order').label).toBe('—');
  });

  it('boş/yok durum "—" döner', () => {
    expect(getStatusInfo(null).label).toBe('—');
    expect(getStatusInfo(undefined).label).toBe('—');
  });
});
