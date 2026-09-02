import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { warehouses } from '@plantero/db';
import { createLocation, getDescendantIds, getLocationTree } from './locations.js';
import { withRollback, suffix } from '../__tests__/helpers.js';

describe('masterdata/locations — lokasyon ağacı', () => {
  it('getDescendantIds: bellek içi ağaçta alt düğümleri bulur', () => {
    const all = [
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'a' },
      { id: 'd', parentId: 'b' },
      { id: 'e', parentId: null },
    ];
    const desc = getDescendantIds(all, 'a').sort();
    expect(desc).toEqual(['b', 'c', 'd']);
    expect(getDescendantIds(all, 'e')).toEqual([]);
  });

  it('createLocation: kod, üst lokasyonun kodu + segment birleşimidir; çakışma reddedilir', async () => {
    await withRollback(async (tx) => {
      const s = suffix();
      const [wh] = await tx.insert(warehouses).values({ code: `WH${s}`, name: `Depo ${s}` }).returning();
      const root = await createLocation(tx, { warehouseId: wh!.id, segment: 'HAM', name: 'Hammadde', usage: 'internal' });
      expect(root.code).toBe(`WH${s}/HAM`);

      const child = await createLocation(tx, { parentId: root.id, segment: 'R01', name: 'Raf 01', usage: 'internal' });
      expect(child.code).toBe(`WH${s}/HAM/R01`);
      expect(child.warehouseId).toBe(wh!.id); // üst lokasyondan miras alır

      await expect(createLocation(tx, { warehouseId: wh!.id, segment: 'HAM', name: 'Tekrar', usage: 'internal' })).rejects.toThrow(/zaten var/);
    });
  });

  it('getLocationTree: gerçek seed verisiyle Tire deposu ağacı döner ve kökler ilk seviyeyi kapsar', async () => {
    await withRollback(async (tx) => {
      const [tire] = await tx.select().from(warehouses).where(eq(warehouses.code, 'TIRE')).limit(1);
      if (!tire) return; // seed henüz çalışmamışsa testi atla
      const tree = await getLocationTree(tx, tire.id);
      expect(tree.length).toBeGreaterThan(0);
      const ham = tree.find((n) => n.code === 'TIRE/HAM');
      expect(ham).toBeTruthy();
      expect(ham!.children.length).toBeGreaterThan(0);
      // Üst düğümün toplamı en az kendi alt düğümlerinin toplamı kadardır
      const childSum = ham!.children.reduce((acc, c) => acc + Number(c.totalQty), 0);
      expect(Number(ham!.totalQty)).toBeGreaterThanOrEqual(childSum - 0.0001);
    });
  });
});
