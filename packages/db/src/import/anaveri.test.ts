import { describe, it, expect } from 'vitest';
import { productTypeFromSku, statusFromDurum, parsePackQty, barcodeFromCell, defaultUomForType } from './anaveri.js';

describe('productTypeFromSku', () => {
  it('SKU ilk hanesinden doğru tipi çözer', () => {
    expect(productTypeFromSku('110010001').type).toBe('finished');
    expect(productTypeFromSku('301010000').type).toBe('raw_material');
    expect(productTypeFromSku('401010000').type).toBe('packaging');
    expect(productTypeFromSku('810010001').type).toBe('equipment');
    expect(productTypeFromSku('910010001').type).toBe('fixed_asset');
  });

  it('bilinmeyen hane için service + unknown=true döner', () => {
    const r = productTypeFromSku('501010000');
    expect(r.type).toBe('service');
    expect(r.unknown).toBe(true);
  });
});

describe('statusFromDurum', () => {
  it('"İptal" arşivlenir, diğer her şey (boş dahil) aktif kabul edilir', () => {
    expect(statusFromDurum('İptal')).toBe('cancelled');
    expect(statusFromDurum('Aktif')).toBe('active');
    expect(statusFromDurum(null)).toBe('active');
    expect(statusFromDurum('')).toBe('active');
  });
});

describe('parsePackQty', () => {
  it('Excel ambalaj metinlerini adete çevirir', () => {
    expect(parsePackQty('Tekli')).toBe(1);
    expect(parsePackQty("2'li")).toBe(2);
    expect(parsePackQty("3'lü")).toBe(3);
    expect(parsePackQty("6'lı")).toBe(6);
    expect(parsePackQty('12 Adet')).toBe(12);
    expect(parsePackQty('1 Adet')).toBe(1);
    expect(parsePackQty('Palet')).toBe(1);
    expect(parsePackQty('Set')).toBe(1);
    expect(parsePackQty('10gr x 10 saşe')).toBe(10);
    expect(parsePackQty(null)).toBe(1);
  });
});

describe('barcodeFromCell', () => {
  it('sayısal barkodu 13 haneye tamamlar, string barkodu olduğu gibi bırakır', () => {
    expect(barcodeFromCell(8683529789049)).toBe('8683529789049');
    expect(barcodeFromCell(123)).toBe('0000000000123');
    expect(barcodeFromCell('8683529789049')).toBe('8683529789049');
    expect(barcodeFromCell(null)).toBeNull();
    expect(barcodeFromCell(undefined)).toBeNull();
  });
});

describe('defaultUomForType', () => {
  it('hammadde/yarı mamul KG, diğerleri ADET', () => {
    expect(defaultUomForType('raw_material')).toBe('KG');
    expect(defaultUomForType('semi_finished')).toBe('KG');
    expect(defaultUomForType('finished')).toBe('ADET');
    expect(defaultUomForType('packaging')).toBe('ADET');
    expect(defaultUomForType('equipment')).toBe('ADET');
    expect(defaultUomForType('fixed_asset')).toBe('ADET');
  });
});
