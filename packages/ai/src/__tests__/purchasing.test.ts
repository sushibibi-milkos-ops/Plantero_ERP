import { describe, expect, it } from 'vitest';
import { draftPurchaseOrders, fallbackDraftPurchaseOrders, type ReplenishRule, type SupplierProductOption } from '../purchasing.js';

const rules: ReplenishRule[] = [
  { productId: 'prod-1', productName: 'Organik Buğday Unu', warehouseId: 'wh-1', minQty: '500', maxQty: '2000', onHandQty: '300' },
  { productId: 'prod-2', productName: 'Ambalaj Kutusu', warehouseId: 'wh-1', minQty: '1000', maxQty: '5000', onHandQty: '4000' }, // eşik üstünde → atlanır
];

const supplierProducts: SupplierProductOption[] = [
  { productId: 'prod-1', partnerId: 'sup-1', partnerName: 'Ege Tarım Ürünleri', price: '18.50', currency: 'TRY', leadTimeDays: 5, minOrderQty: '100', isPreferred: true },
  { productId: 'prod-1', partnerId: 'sup-2', partnerName: 'Anadolu Un San.', price: '17.90', currency: 'TRY', leadTimeDays: 7, minOrderQty: '250', isPreferred: false },
];

describe('fallbackDraftPurchaseOrders', () => {
  it('eldeki miktar min altındaysa max seviyesine tamamlayan taslak üretir', () => {
    const drafts = fallbackDraftPurchaseOrders(rules, [], supplierProducts);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.partnerId).toBe('sup-1'); // tercihli tedarikçi seçilir
    expect(drafts[0]!.lines).toHaveLength(1);
    expect(drafts[0]!.lines[0]!.productId).toBe('prod-1');
    // needed = 2000 - 300 = 1700; MOQ 100 katına yuvarlama zaten tam katı
    expect(drafts[0]!.lines[0]!.qty).toBe('1700.0000');
  });

  it('eşik üstündeki ürünler için taslak üretmez', () => {
    const drafts = fallbackDraftPurchaseOrders(rules, [], supplierProducts);
    const lineIds = drafts.flatMap((d) => d.lines.map((l) => l.productId));
    expect(lineIds).not.toContain('prod-2');
  });

  it('tedarikçisi tanımsız ürünü atlar', () => {
    const drafts = fallbackDraftPurchaseOrders(
      [{ productId: 'prod-x', productName: 'X', warehouseId: 'wh-1', minQty: '10', maxQty: '100', onHandQty: '0' }],
      [],
      [],
    );
    expect(drafts).toEqual([]);
  });

  it('minOrderQty katına yuvarlar', () => {
    const drafts = fallbackDraftPurchaseOrders(
      [{ productId: 'prod-1', productName: 'Un', warehouseId: 'wh-1', minQty: '100', maxQty: '350', onHandQty: '0' }],
      [],
      [{ productId: 'prod-1', partnerId: 'sup-1', partnerName: 'Tedarikçi', price: '10', currency: 'TRY', leadTimeDays: 3, minOrderQty: '150', isPreferred: true }],
    );
    // needed = 350; 150'nin katına yuvarlanır → 450
    expect(drafts[0]!.lines[0]!.qty).toBe('450.0000');
  });
});

describe('draftPurchaseOrders (ANTHROPIC_API_KEY yokken fallback)', () => {
  it('API anahtarı yoksa fallback sonucunu döner', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const drafts = await draftPurchaseOrders(rules, [], supplierProducts);
    expect(drafts).toEqual(fallbackDraftPurchaseOrders(rules, [], supplierProducts));
  });
});
