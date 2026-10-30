/**
 * Çok seviyeli ürün ağacı (multilevel BOM) — SAF mantık (db'siz, `server-only`'siz).
 *
 * Veri kaynağı bir `BomTreeLoader` arkasında soyutlanır: `queries.ts` içindeki `getBomTree` Drizzle ile
 * gerçek loader'ı bağlar, birim testleri sahte loader verir. Böylece ağaç yapısı (normalize miktar,
 * döngü koruması, derinlik sınırı) veri kaynağından bağımsız ve test edilebilir kalır.
 */
import { D } from '@plantero/core/money';

/** Ağaç derinlik sınırı: kök = 0, en derin genişletilen düğüm = 6. */
export const MAX_BOM_DEPTH = 6;
/** Güvenlik tavanı: patolojik (çok dallı) ağaçlarda toplam düğüm sayısı. */
export const MAX_BOM_NODES = 400;

export type BomNodeKind = 'raw' | 'packaging' | 'semi' | 'finished';

export type BomNodeProduct = {
  id: string;
  sku: string;
  name: string;
  type: BomNodeKind;
  isManufactured: boolean;
  /** Ürünün temel birimi (kod) */
  uom: string;
};

export type BomNodeLine = { id: string; code: string; name: string };
export type BomNodeBom = { id: string; code: string; version: number; status: string; cycleMinutes: number | null };

export type BomTreeNode = {
  /** Yol bazlı benzersiz anahtar (aynı ürün farklı dallarda tekrar edebilir) */
  key: string;
  product: BomNodeProduct;
  /** 1 birim ÜST ürün başına miktar (BOM çıktı miktarına normalize) — satırın birimiyle */
  qty: string;
  qtyUom: string;
  /** 1 birim KÖK mamul başına birikimli miktar (üst zincirin çarpımı) */
  qtyPerRoot: string;
  scrapPct: string;
  isByproduct: boolean;
  /** Bu düğümü ÜRETEN reçetenin varsayılan hattı (yalnız kendi reçetesi olan düğümlerde) */
  line: BomNodeLine | null;
  /** Bu düğümün kendi reçetesi (kök ve genişletilmiş yarı mamuller) */
  bom: BomNodeBom | null;
  /** Bileşenin birim maliyeti (kendi biriminde); yoksa null */
  birimMaliyet: string | null;
  depth: number;
  /** Aynı ürün zincirde tekrar etti — genişletilmedi */
  cycle: boolean;
  /** Derinlik/düğüm sınırı nedeniyle genişletilmedi */
  truncated: boolean;
  /** Üretilen ürün ama aktif reçetesi yok */
  missingBom: boolean;
  children: BomTreeNode[];
};

export type BomTree = {
  root: BomTreeNode;
  /** Kök reçetenin doğrudan satır sayısı (yan ürünler dahil) */
  lineCount: number;
  nodeCount: number;
  maxDepth: number;
};

/* ------------------------------------------------------------------ */
/* Loader sözleşmesi                                                    */
/* ------------------------------------------------------------------ */

export type RawProductType = 'finished' | 'semi_finished' | 'raw_material' | 'packaging' | 'merchandise' | 'equipment' | 'fixed_asset' | 'service';

export type LoadedProduct = {
  id: string;
  sku: string;
  name: string;
  type: RawProductType;
  isManufactured: boolean;
  uom: string;
};

export type LoadedBomLine = {
  id: string;
  product: LoadedProduct;
  qty: string;
  uom: string;
  scrapPct: string;
  isByproduct: boolean;
  /** Bu bileşenin birim maliyeti (rollup satırından); yoksa null */
  unitCost: string | null;
};

export type LoadedBom = {
  id: string;
  code: string;
  version: number;
  status: string;
  outputQty: string;
  cycleMinutes: number | null;
  line: BomNodeLine | null;
  /** Reçetenin kendi birim maliyeti (rollup); yoksa null */
  unitCost: string | null;
  lines: LoadedBomLine[];
};

export type BomTreeLoader = {
  getProduct(productId: string): Promise<LoadedProduct | null>;
  /**
   * `bomId` verilirse o reçete; verilmezse ürünün AKTİF reçetesi.
   * `allowDraft` true iken aktif yoksa en yüksek versiyonlu taslak döner (yalnız kök için).
   */
  getBom(productId: string, opts: { bomId?: string; allowDraft?: boolean }): Promise<LoadedBom | null>;
};

/** Veritabanı ürün tipi → akış şeması düğüm tipi */
export function nodeKindOf(type: RawProductType): BomNodeKind {
  switch (type) {
    case 'finished':
    case 'merchandise':
      return 'finished';
    case 'semi_finished':
      return 'semi';
    case 'packaging':
      return 'packaging';
    default:
      return 'raw';
  }
}

function toNodeProduct(p: LoadedProduct): BomNodeProduct {
  return { id: p.id, sku: p.sku, name: p.name, type: nodeKindOf(p.type), isManufactured: p.isManufactured, uom: p.uom };
}

/** Miktarları 6 ondalığa kadar, gereksiz sıfırsız düz string olarak üretir (bilimsel gösterim yok). */
function plain(d: ReturnType<typeof D>): string {
  return d.toDecimalPlaces(6).toFixed();
}

/** Bileşen genişletilmeli mi: üretilen ürün veya yarı mamul. */
function shouldExpand(p: LoadedProduct): boolean {
  return p.isManufactured || p.type === 'semi_finished';
}

/* ------------------------------------------------------------------ */
/* Ağaç kurucu                                                          */
/* ------------------------------------------------------------------ */

export async function buildBomTree(
  rootProductId: string,
  loader: BomTreeLoader,
  opts: { bomId?: string } = {},
): Promise<BomTree | null> {
  const rootProduct = await loader.getProduct(rootProductId);
  if (!rootProduct) return null;
  const rootBom = await loader.getBom(rootProductId, { bomId: opts.bomId, allowDraft: true });
  if (!rootBom) return null;

  const counter = { n: 0, maxDepth: 0 };

  async function expand(
    product: LoadedProduct,
    bom: LoadedBom,
    base: {
      key: string;
      qty: string;
      qtyUom: string;
      qtyPerRoot: string;
      scrapPct: string;
      isByproduct: boolean;
      birimMaliyet: string | null;
      depth: number;
    },
    ancestry: ReadonlySet<string>,
  ): Promise<BomTreeNode> {
    counter.n += 1;
    counter.maxDepth = Math.max(counter.maxDepth, base.depth);
    const chain = new Set(ancestry);
    chain.add(product.id);

    const outputQty = D(bom.outputQty);
    const divisor = outputQty.isZero() ? D(1) : outputQty;

    const children: BomTreeNode[] = [];
    let idx = 0;
    for (const l of bom.lines) {
      idx += 1;
      const qtyPerParent = D(l.qty).div(divisor);
      const qtyPerRoot = D(base.qtyPerRoot).mul(qtyPerParent);
      const childKey = `${base.key}/${l.product.id}:${idx}`;
      const common = {
        key: childKey,
        qty: plain(qtyPerParent),
        qtyUom: l.uom,
        qtyPerRoot: plain(qtyPerRoot),
        scrapPct: l.scrapPct,
        isByproduct: l.isByproduct,
        birimMaliyet: l.unitCost,
        depth: base.depth + 1,
      };

      const leaf = (extra: Partial<Pick<BomTreeNode, 'cycle' | 'truncated' | 'missingBom'>> = {}): BomTreeNode => {
        counter.n += 1;
        counter.maxDepth = Math.max(counter.maxDepth, common.depth);
        return {
          ...common,
          product: toNodeProduct(l.product),
          line: null,
          bom: null,
          cycle: false,
          truncated: false,
          missingBom: false,
          children: [],
          ...extra,
        };
      };

      if (!shouldExpand(l.product) || l.isByproduct) {
        children.push(leaf());
        continue;
      }
      if (chain.has(l.product.id)) {
        children.push(leaf({ cycle: true }));
        continue;
      }
      if (common.depth >= MAX_BOM_DEPTH || counter.n >= MAX_BOM_NODES) {
        children.push(leaf({ truncated: true }));
        continue;
      }
      const childBom = await loader.getBom(l.product.id, {});
      if (!childBom) {
        children.push(leaf({ missingBom: true }));
        continue;
      }
      // Yarı mamulün maliyeti: kendi reçetesinin rollup'ı varsa o, yoksa üst reçetedeki bileşen maliyeti
      const ownCost = childBom.unitCost && !D(childBom.unitCost).isZero() ? childBom.unitCost : l.unitCost;
      children.push(await expand(l.product, childBom, { ...common, birimMaliyet: ownCost }, chain));
    }

    return {
      key: base.key,
      product: toNodeProduct(product),
      qty: base.qty,
      qtyUom: base.qtyUom,
      qtyPerRoot: base.qtyPerRoot,
      scrapPct: base.scrapPct,
      isByproduct: base.isByproduct,
      line: bom.line,
      bom: { id: bom.id, code: bom.code, version: bom.version, status: bom.status, cycleMinutes: bom.cycleMinutes },
      birimMaliyet: base.birimMaliyet,
      depth: base.depth,
      cycle: false,
      truncated: false,
      missingBom: false,
      children,
    };
  }

  const root = await expand(
    rootProduct,
    rootBom,
    { key: rootProduct.id, qty: '1', qtyUom: rootProduct.uom, qtyPerRoot: '1', scrapPct: '0', isByproduct: false, birimMaliyet: rootBom.unitCost, depth: 0 },
    new Set(),
  );

  return { root, lineCount: rootBom.lines.length, nodeCount: counter.n, maxDepth: counter.maxDepth };
}

/** Ağaçtaki düğümleri (kök dahil) derinlik öncelikli düz listeye çevirir. */
export function flattenBomTree(node: BomTreeNode): BomTreeNode[] {
  return [node, ...node.children.flatMap(flattenBomTree)];
}
