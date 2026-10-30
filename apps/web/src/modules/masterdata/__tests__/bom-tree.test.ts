import { describe, expect, it } from 'vitest';
import { MAX_BOM_DEPTH, buildBomTree, flattenBomTree, type BomTreeLoader, type LoadedBom, type LoadedProduct } from '../bom-tree';

/** Sahte loader: ürünler ve aktif reçeteler bellekte. */
function makeLoader(products: LoadedProduct[], boms: Record<string, Omit<LoadedBom, 'id' | 'code' | 'version' | 'status'> & Partial<LoadedBom>>): BomTreeLoader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getProduct(id) {
      return products.find((p) => p.id === id) ?? null;
    },
    async getBom(productId) {
      calls.push(productId);
      const b = boms[productId];
      if (!b) return null;
      return { id: `bom-${productId}`, code: `BOM-${productId}`, version: 1, status: 'active', ...b } as LoadedBom;
    },
  };
}

const prod = (id: string, type: LoadedProduct['type'], extra: Partial<LoadedProduct> = {}): LoadedProduct => ({
  id, sku: id.toUpperCase(), name: id, type, isManufactured: type === 'finished' || type === 'semi_finished', uom: 'ADET', ...extra,
});
const line = (id: string, product: LoadedProduct, qty: string, extra: Partial<LoadedBom['lines'][number]> = {}): LoadedBom['lines'][number] => ({
  id: `l-${id}-${product.id}`, product, qty, uom: product.uom, scrapPct: '0', isByproduct: false, unitCost: null, ...extra,
});
const bomBase = { outputQty: '1', cycleMinutes: null, line: null, unitCost: null };

describe('buildBomTree', () => {
  it('reçetesi yoksa null döner', async () => {
    const loader = makeLoader([prod('m', 'finished')], {});
    expect(await buildBomTree('m', loader)).toBeNull();
  });

  it('çok seviyeli: yarı mamul alt reçetesi açılır, hammadde açılmaz', async () => {
    const baz = prod('baz', 'semi_finished');
    const badem = prod('badem', 'raw_material', { uom: 'KG' });
    const sise = prod('sise', 'packaging');
    const mamul = prod('mamul', 'finished');
    const loader = makeLoader([mamul, baz, badem, sise], {
      mamul: { ...bomBase, lines: [line('a', baz, '1'), line('a', sise, '1')] },
      baz: { ...bomBase, line: { id: 'x', code: 'HAT1', name: 'Bazlar' }, lines: [line('b', badem, '0.1')] },
    });
    const tree = await buildBomTree('mamul', loader);
    expect(tree).not.toBeNull();
    const [bazNode, siseNode] = tree!.root.children;
    expect(bazNode!.bom).not.toBeNull();
    expect(bazNode!.line?.code).toBe('HAT1');
    expect(bazNode!.children).toHaveLength(1);
    expect(bazNode!.children[0]!.product.type).toBe('raw');
    expect(siseNode!.bom).toBeNull();
    // Hammadde için reçete sorgusu yapılmadı
    expect(loader.calls).toEqual(['mamul', 'baz']);
    expect(tree!.nodeCount).toBe(4);
    expect(tree!.maxDepth).toBe(2);
    expect(tree!.lineCount).toBe(2);
    expect(flattenBomTree(tree!.root)).toHaveLength(4);
  });

  it('miktarları reçete çıktı miktarına normalize eder (1 birim üst ürün başına) ve kökten birikimli çarpar', async () => {
    const baz = prod('baz', 'semi_finished', { uom: 'KG' });
    const badem = prod('badem', 'raw_material', { uom: 'KG' });
    const mamul = prod('mamul', 'finished');
    const loader = makeLoader([mamul, baz, badem], {
      // 100 adet mamul = 25 kg baz
      mamul: { ...bomBase, outputQty: '100', lines: [line('a', baz, '25')] },
      // 50 kg baz = 12,5 kg badem
      baz: { ...bomBase, outputQty: '50', lines: [line('b', badem, '12.5', { scrapPct: '2' })] },
    });
    const tree = (await buildBomTree('mamul', loader))!;
    const bazNode = tree.root.children[0]!;
    const bademNode = bazNode.children[0]!;
    expect(tree.root.qty).toBe('1');
    expect(bazNode.qty).toBe('0.25');
    expect(bazNode.qtyPerRoot).toBe('0.25');
    expect(bademNode.qty).toBe('0.25');
    expect(bademNode.qtyPerRoot).toBe('0.0625');
    expect(bademNode.scrapPct).toBe('2');
    expect(bademNode.depth).toBe(2);
  });

  it('döngü koruması: zincirde tekrar eden ürün genişletilmez ve işaretlenir', async () => {
    const a = prod('a', 'semi_finished');
    const b = prod('b', 'semi_finished');
    const loader = makeLoader([a, b], {
      a: { ...bomBase, lines: [line('x', b, '1')] },
      b: { ...bomBase, lines: [line('y', a, '1')] },
    });
    const tree = (await buildBomTree('a', loader))!;
    const bNode = tree.root.children[0]!;
    const aAgain = bNode.children[0]!;
    expect(bNode.cycle).toBe(false);
    expect(aAgain.product.id).toBe('a');
    expect(aAgain.cycle).toBe(true);
    expect(aAgain.children).toHaveLength(0);
    expect(aAgain.bom).toBeNull();
    // Sonsuz özyineleme yok: a ve b'nin reçetesi yalnız birer kez yüklendi
    expect(loader.calls).toEqual(['a', 'b']);
  });

  it('kendine referans veren reçete de döngü sayılır', async () => {
    const a = prod('a', 'semi_finished');
    const loader = makeLoader([a], { a: { ...bomBase, lines: [line('x', a, '1')] } });
    const tree = (await buildBomTree('a', loader))!;
    expect(tree.root.children[0]!.cycle).toBe(true);
  });

  it(`derinlik sınırı: en fazla ${MAX_BOM_DEPTH}. seviyeye kadar açar, ötesi truncated`, async () => {
    const chain = Array.from({ length: 10 }, (_, i) => prod(`p${i}`, 'semi_finished'));
    const boms: Record<string, Omit<LoadedBom, 'id' | 'code' | 'version' | 'status'>> = {};
    chain.forEach((p, i) => {
      const next = chain[i + 1];
      if (next) boms[p.id] = { ...bomBase, lines: [line(p.id, next, '1')] };
    });
    const tree = (await buildBomTree('p0', makeLoader(chain, boms)))!;
    expect(tree.maxDepth).toBe(MAX_BOM_DEPTH);
    const last = flattenBomTree(tree.root).find((n) => n.depth === MAX_BOM_DEPTH)!;
    expect(last.truncated).toBe(true);
    expect(last.children).toHaveLength(0);
  });

  it('üretilen ürünün aktif reçetesi yoksa missingBom; yan ürün genişletilmez', async () => {
    const yarim = prod('yarim', 'semi_finished');
    const posa = prod('posa', 'semi_finished');
    const mamul = prod('mamul', 'finished');
    const loader = makeLoader([mamul, yarim, posa], {
      mamul: { ...bomBase, lines: [line('a', yarim, '1'), line('a', posa, '2', { isByproduct: true })] },
    });
    const tree = (await buildBomTree('mamul', loader))!;
    expect(tree.root.children[0]!.missingBom).toBe(true);
    expect(tree.root.children[1]!.isByproduct).toBe(true);
    expect(tree.root.children[1]!.missingBom).toBe(false);
    expect(loader.calls).toEqual(['mamul', 'yarim']);
  });

  it('birim maliyet: yarı mamulde kendi reçete maliyeti, yoksa üst reçetedeki bileşen maliyeti', async () => {
    const baz = prod('baz', 'semi_finished');
    const baz2 = prod('baz2', 'semi_finished');
    const ham = prod('ham', 'raw_material');
    const mamul = prod('mamul', 'finished');
    const loader = makeLoader([mamul, baz, baz2, ham], {
      mamul: { ...bomBase, unitCost: '9.5', lines: [line('a', baz, '1', { unitCost: '1.0000' }), line('a', baz2, '1', { unitCost: '2.0000' })] },
      baz: { ...bomBase, unitCost: '7.2500', lines: [line('b', ham, '1', { unitCost: '3.0000' })] },
      baz2: { ...bomBase, unitCost: '0.0000', lines: [line('c', ham, '1')] },
    });
    const tree = (await buildBomTree('mamul', loader))!;
    expect(tree.root.birimMaliyet).toBe('9.5');
    expect(tree.root.children[0]!.birimMaliyet).toBe('7.2500');
    expect(tree.root.children[1]!.birimMaliyet).toBe('2.0000');
    expect(tree.root.children[0]!.children[0]!.birimMaliyet).toBe('3.0000');
    expect(tree.root.children[1]!.children[0]!.birimMaliyet).toBeNull();
  });
});
