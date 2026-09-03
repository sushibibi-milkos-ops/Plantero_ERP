'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import { formatDate, formatMoney, formatPct } from '@/lib/format';

const COST_METHOD_LABELS: Record<string, string> = { lot: 'Lot bazlı', average: 'Hareketli ortalama', standard: 'Standart maliyet' };

export function ProductGeneralTab({
  product,
  uomName,
  defaultListPrice,
}: {
  product: { p: Record<string, unknown> };
  uomName: string;
  /** Varsayılan (perakende) fiyat listesinden türetilen satış fiyatı — bkz. urunler/[id]/page.tsx. */
  defaultListPrice?: string | null;
}) {
  const p = product.p as {
    sku: string; shortCode: string | null; name: string; barcode: string | null; caseBarcode: string | null;
    type: string; status: string; category1: string | null; category2: string | null; category3: string | null;
    variant: string | null; packaging: string | null; packQty: number; isLotTracked: boolean; isPurchasable: boolean;
    isSellable: boolean; isManufactured: boolean; costMethod: string; averageCost: string; standardCost: string;
    shelfLifeDays: number | null; requiresIncomingQc: boolean; quarantineDays: number; vatRate: string;
    purchaseVatRate: string; listPrice: string; hsCode: string | null; minQty: string | null; maxQty: string | null;
    leadTimeDays: number | null; note: string | null; createdAt: string; updatedAt: string; oldSku: string | null;
    legacyLocationCode: string | null;
  };

  // Tip ve durum sayfa başlığında zaten gösteriliyor — burada tekrar edilmiyor.
  const groups = useMemo(
    () => [
      {
        title: 'Sınıflandırma',
        fields: [
          { label: 'Kısa kod', value: p.shortCode, node: p.shortCode ?? '—' },
          { label: 'Birim', value: true, node: uomName },
          { label: 'Kategori 1', value: p.category1, node: p.category1 ?? '—' },
          { label: 'Kategori 2', value: p.category2, node: p.category2 ?? '—' },
          { label: 'Kategori 3', value: p.category3, node: p.category3 ?? '—' },
          { label: 'Varyant', value: p.variant, node: p.variant ?? '—' },
        ],
      },
      {
        title: 'Ambalaj & Barkod',
        fields: [
          { label: 'Ambalaj', value: p.packaging, node: p.packaging ?? '—' },
          { label: 'Ambalaj içi adet', value: true, node: p.packQty },
          { label: 'Ana barkod', value: p.barcode, node: p.barcode ?? '—' },
          { label: 'Koli barkodu', value: p.caseBarcode, node: p.caseBarcode ?? '—' },
        ],
      },
      {
        title: 'Stok & Kalite',
        fields: [
          { label: 'Lot takipli', value: true, node: p.isLotTracked ? 'Evet' : 'Hayır' },
          { label: 'Satın alınabilir', value: true, node: p.isPurchasable ? 'Evet' : 'Hayır' },
          { label: 'Satılabilir', value: true, node: p.isSellable ? 'Evet' : 'Hayır' },
          { label: 'Üretilebilir', value: true, node: p.isManufactured ? 'Evet' : 'Hayır' },
          { label: 'Maliyet yöntemi', value: true, node: COST_METHOD_LABELS[p.costMethod] ?? p.costMethod },
          { label: 'Raf ömrü', value: p.shelfLifeDays, node: p.shelfLifeDays ? `${p.shelfLifeDays} gün` : '—' },
          { label: 'Girişte kalite kontrol', value: true, node: p.requiresIncomingQc ? `Zorunlu (${p.quarantineDays} gün karantina)` : 'Gerekmez' },
          { label: 'Min. / Maks. stok', value: p.minQty || p.maxQty, node: `${p.minQty ?? '—'} / ${p.maxQty ?? '—'}` },
          { label: 'Tedarik süresi', value: p.leadTimeDays, node: p.leadTimeDays ? `${p.leadTimeDays} gün` : '—' },
        ],
      },
      {
        title: 'Fiyat & Vergi',
        fields: [
          // Ekranda tüm para alanları tek biçim: ₺0,00. Ham 4 haneli değer title/tooltip'te durur
          // (4 hane yalnızca hesap/mutabakat ekranlarına ait, detay özetine değil).
          { label: 'Ortalama maliyet', value: true, node: <span title={formatMoney(p.averageCost, undefined, { digits: 4 })}>{formatMoney(p.averageCost)}</span> },
          { label: 'Standart maliyet', value: true, node: <span title={formatMoney(p.standardCost, undefined, { digits: 4 })}>{formatMoney(p.standardCost)}</span> },
          { label: 'Liste fiyatı', value: true, node: formatMoney(defaultListPrice ?? p.listPrice) },
          { label: 'Satış KDV', value: true, node: formatPct(p.vatRate) },
          { label: 'Alış KDV', value: true, node: formatPct(p.purchaseVatRate) },
          { label: 'GTİP', value: p.hsCode, node: p.hsCode ?? '—' },
        ],
      },
      {
        title: 'Kayıt',
        fields: [
          ...(p.legacyLocationCode ? [{ label: 'Excel lokasyon (bilgi)', value: true, node: p.legacyLocationCode }] : []),
          { label: 'Oluşturma', value: true, node: formatDate(p.createdAt) },
          { label: 'Son güncelleme', value: true, node: formatDate(p.updatedAt) },
        ],
      },
    ] satisfies DetailFieldGroup[],
    [p, uomName, defaultListPrice],
  );

  return (
    <div className="max-w-[1080px] space-y-6">
      {/* Tur 5 P1 bulgusu: SKU üç kez tekrarlanıyordu — PageHeader description'ında, bu şeritte ("SKU: …")
          ve aşağıdaki "Kayıt" grubunda ("Kısa kod: …"in yanında). 390px'te bu üç tekrar ilk ~350px dikey
          alana sıkışıyordu. Şerit artık yalnızca gerçekte başka hiçbir yerde görünmeyen tek bilgiyi taşır:
          kilit durumu + eski SKU (varsa). Güncel SKU zaten sayfa başlığında. */}
      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Lock className="size-3" /> Ad ve barkod kilitli
          </span>
          {p.oldSku ? (
            <span className="text-muted-foreground">
              Eski SKU: <span className="font-mono">{p.oldSku}</span>
            </span>
          ) : null}
        </div>
      </div>

      <DetailFieldGroupsGrid groups={groups} />

      {p.note ? (
        <div>
          <div className="mb-1 text-[12px] text-muted-foreground">Not</div>
          <p className="text-[13px] whitespace-pre-wrap text-muted-foreground">{p.note}</p>
        </div>
      ) : null}
    </div>
  );
}
