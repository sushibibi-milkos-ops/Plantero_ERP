import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { products } from '@plantero/db';
import {
  isValidEan13, parseSku, validateSku, suggestNextSku, suggestShortCode, abbreviate,
  createProduct, updateProduct, findByBarcode,
} from './products.js';
import { withRollback, seedBase, suffix } from '../__tests__/helpers.js';

describe('masterdata/products — SKU ve barkod', () => {
  it('isValidEan13: doğru/yanlış checksum', () => {
    expect(isValidEan13('8683529789049')).toBe(true); // gerçek Plantero barkodu (seed)
    expect(isValidEan13('8683529789040')).toBe(false); // son hane bozuk
    expect(isValidEan13('12345')).toBe(false); // uzunluk hatalı
    expect(isValidEan13(null)).toBe(false);
  });

  it('parseSku / validateSku: 9 haneli T·AA·BB·CC·PP', () => {
    expect(parseSku('110010001')).toEqual({ t: '1', aa: '10', bb: '01', cc: '00', pp: '01' });
    expect(parseSku('abc')).toBeNull();
    expect(validateSku('110010001').valid).toBe(true);
    expect(validateSku('510010001').valid).toBe(false); // T=5 tanınmıyor
    expect(validateSku('123').valid).toBe(false);
  });

  it('abbreviate: kategori adından 3 harf kısaltma üretir', () => {
    expect(abbreviate('Kuruyemiş Hammaddeleri')).toHaveLength(3);
    expect(abbreviate('Badem')).toBe('BAD');
    expect(abbreviate(null)).toBe('GEN');
  });

  it('suggestNextSku: mevcut ürünlerin en büyük PP + 1 önerir ve çakışmayı engeller', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const t = b.raw.sku.charAt(0); // '1' + s + '01' — testte T=1 kullanıyoruz aa/bb/cc'yi kendimiz kurgulayalım
      const aa = '99';
      const bb = '99';
      const cc = '99';
      const prefix7 = `${t}${aa}${bb}${cc}`;
      // Bu prefiksle iki ürün oluştur: PP=01 ve PP=03 (02 boş bırakılır)
      await tx.insert(products).values({ sku: `${prefix7}01`, name: `Test A ${b.s}`, type: 'finished', uomId: b.kg.id });
      await tx.insert(products).values({ sku: `${prefix7}03`, name: `Test B ${b.s}`, type: 'finished', uomId: b.kg.id });

      const suggestion = await suggestNextSku(tx, { t, aa, bb, cc });
      expect(suggestion.conflict).toBe(false);
      expect(suggestion.sku).toBe(`${prefix7}04`); // en büyük PP (03) + 1

      const taken = await suggestNextSku(tx, { t, aa, bb, cc }, { preferredPP: '03' });
      expect(taken.sku).not.toBe(`${prefix7}03`); // 03 dolu — kaçınılır, en büyük+1'e düşer
      expect(taken.sku).toBe(`${prefix7}04`);

      const free = await suggestNextSku(tx, { t, aa, bb, cc }, { preferredPP: '06' });
      expect(free.sku).toBe(`${prefix7}06`); // boş tercih edilen PP doğrudan kullanılır
    });
  });

  it('suggestShortCode: HAM-<abbr>-NN artan sıra üretir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const first = await suggestShortCode(tx, { type: 'raw_material', category2: `Test Grubu ${b.s}` });
      expect(first.endsWith('-01')).toBe(true);
      expect(first.startsWith('HAM-')).toBe(true);
    });
  });

  it('createProduct: SKU çakışmasını reddeder', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const sku = '399999901';
      await createProduct(tx, { sku, name: 'İlk ürün', type: 'raw_material', uomId: b.kg.id });
      await expect(
        createProduct(tx, { sku, name: 'Çakışan ürün', type: 'raw_material', uomId: b.kg.id }),
      ).rejects.toThrow(/kullanımda/);
    });
  });

  it('updateProduct: ad/barkod kilitli — allowIdentityChange olmadan reddedilir, gerekçesiz de reddedilir', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await expect(updateProduct(tx, b.raw.id, { name: 'Yeni Ad' })).rejects.toThrow(/kilitlenir/);
      await expect(updateProduct(tx, b.raw.id, { name: 'Yeni Ad' }, { allowIdentityChange: true })).rejects.toThrow(/gerekçe/);
      const updated = await updateProduct(tx, b.raw.id, { name: 'Yeni Ad' }, { allowIdentityChange: true, reason: 'Excel hatası düzeltildi' });
      expect(updated.name).toBe('Yeni Ad');
      // Kimlik dışı bir alan (not) serbestçe güncellenebilir
      const noted = await updateProduct(tx, b.raw.id, { note: 'test notu' });
      expect(noted.note).toBe('test notu');
    });
  });

  it('findByBarcode: ana barkod ile bulur', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const barcode = `890${suffix()}`;
      await tx.update(products).set({ barcode }).where(eq(products.id, b.raw.id));
      const found = await findByBarcode(tx, barcode);
      expect(found?.product.id).toBe(b.raw.id);
      expect(found?.matchKind).toBe('unit');
      expect(await findByBarcode(tx, 'yok-boyle-bir-kod')).toBeNull();
    });
  });
});
