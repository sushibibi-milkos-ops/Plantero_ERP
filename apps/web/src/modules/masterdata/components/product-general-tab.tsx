import { Lock } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { formatDate, formatQty } from '@/lib/format';
import { PRODUCT_TYPE_LABELS } from '../product-labels';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

const COST_METHOD_LABELS: Record<string, string> = { lot: 'Lot bazlı', average: 'Hareketli ortalama', standard: 'Standart maliyet' };

export function ProductGeneralTab({ product, uomName }: { product: { p: Record<string, unknown> }; uomName: string }) {
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Lock className="size-3" /> Ad ve barkod kilitli
          </span>
          <span>
            SKU: <span className="font-mono">{p.sku}</span>
          </span>
          {p.oldSku ? (
            <span className="text-muted-foreground">
              Eski SKU: <span className="font-mono">{p.oldSku}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Tip">{PRODUCT_TYPE_LABELS[p.type] ?? p.type}</Field>
        <Field label="Durum">
          <StatusBadge status={p.status} kind="product" />
        </Field>
        <Field label="Kısa kod">{p.shortCode ?? '—'}</Field>
        <Field label="Birim">{uomName}</Field>
        <Field label="Kategori 1">{p.category1 ?? '—'}</Field>
        <Field label="Kategori 2">{p.category2 ?? '—'}</Field>
        <Field label="Kategori 3">{p.category3 ?? '—'}</Field>
        <Field label="Varyant">{p.variant ?? '—'}</Field>
        <Field label="Ambalaj">{p.packaging ?? '—'}</Field>
        <Field label="Ambalaj içi adet">{p.packQty}</Field>
        <Field label="Ana barkod">{p.barcode ?? '—'}</Field>
        <Field label="Koli barkodu">{p.caseBarcode ?? '—'}</Field>
        <Field label="Lot takipli">{p.isLotTracked ? 'Evet' : 'Hayır'}</Field>
        <Field label="Satın alınabilir">{p.isPurchasable ? 'Evet' : 'Hayır'}</Field>
        <Field label="Satılabilir">{p.isSellable ? 'Evet' : 'Hayır'}</Field>
        <Field label="Üretilebilir">{p.isManufactured ? 'Evet' : 'Hayır'}</Field>
        <Field label="Maliyet yöntemi">{COST_METHOD_LABELS[p.costMethod] ?? p.costMethod}</Field>
        <Field label="Ortalama maliyet">₺{formatQty(p.averageCost, undefined, { maxDigits: 4 })}</Field>
        <Field label="Standart maliyet">₺{formatQty(p.standardCost, undefined, { maxDigits: 4 })}</Field>
        <Field label="Liste fiyatı">₺{formatQty(p.listPrice, undefined, { maxDigits: 2 })}</Field>
        <Field label="Satış KDV">%{p.vatRate}</Field>
        <Field label="Alış KDV">%{p.purchaseVatRate}</Field>
        <Field label="Raf ömrü">{p.shelfLifeDays ? `${p.shelfLifeDays} gün` : '—'}</Field>
        <Field label="Girişte kalite kontrol">{p.requiresIncomingQc ? `Zorunlu (${p.quarantineDays} gün karantina)` : 'Gerekmez'}</Field>
        <Field label="Min. / Maks. stok">
          {p.minQty ?? '—'} / {p.maxQty ?? '—'}
        </Field>
        <Field label="Tedarik süresi">{p.leadTimeDays ? `${p.leadTimeDays} gün` : '—'}</Field>
        <Field label="GTİP">{p.hsCode ?? '—'}</Field>
        {p.legacyLocationCode ? <Field label="Excel lokasyon (bilgi)">{p.legacyLocationCode}</Field> : null}
        <Field label="Oluşturma">{formatDate(p.createdAt)}</Field>
        <Field label="Son güncelleme">{formatDate(p.updatedAt)}</Field>
      </div>

      {p.note ? (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Not</div>
          <p className="text-[13px] whitespace-pre-wrap text-muted-foreground">{p.note}</p>
        </div>
      ) : null}
    </div>
  );
}
