import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';

export type PriceListItemRow = { item: { id: string; minQty: string; price: string; validFrom: string | null; validTo: string | null }; listCode: string; listName: string; currency: string };
export type CustomerPriceRow = { price: { id: string; minQty: string; price: string; currency: string; validFrom: string | null; validTo: string | null }; partnerCode: string; partnerName: string };

export function ProductPricesTab({ priceItems, customerPrices }: { priceItems: PriceListItemRow[]; customerPrices: CustomerPriceRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-sm font-medium">Fiyat listeleri</div>
        {priceItems.length === 0 ? (
          <EmptyState compact title="Fiyat listesinde yok" description="Bu ürün henüz hiçbir fiyat listesine eklenmemiş." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Liste</th>
                  <th className="h-9 px-3 text-right font-medium">Min. Miktar</th>
                  <th className="h-9 px-3 text-right font-medium">Fiyat</th>
                  <th className="h-9 px-3 text-left font-medium">Geçerlilik</th>
                </tr>
              </thead>
              <tbody>
                {priceItems.map((r) => (
                  <tr key={r.item.id} className="h-9 border-b border-border/50 last:border-0">
                    <td className="px-3">
                      {r.listName} <span className="font-mono text-[11px] text-muted-foreground">({r.listCode})</span>
                    </td>
                    <td className="px-3 text-right text-muted-foreground">{r.item.minQty}</td>
                    <td className="px-3 text-right">
                      <MoneyCell value={r.item.price} currency={r.currency} />
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {r.item.validFrom || r.item.validTo ? `${r.item.validFrom ? formatDate(r.item.validFrom) : '—'} – ${r.item.validTo ? formatDate(r.item.validTo) : '—'}` : 'Süresiz'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">Müşteriye özel fiyatlar</div>
        {customerPrices.length === 0 ? (
          <EmptyState compact title="Özel fiyat yok" description="Bu ürün için tanımlı müşteriye özel fiyat bulunmuyor." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Müşteri</th>
                  <th className="h-9 px-3 text-right font-medium">Min. Miktar</th>
                  <th className="h-9 px-3 text-right font-medium">Fiyat</th>
                </tr>
              </thead>
              <tbody>
                {customerPrices.map((r) => (
                  <tr key={r.price.id} className="h-9 border-b border-border/50 last:border-0">
                    <td className="px-3">
                      {r.partnerName} <span className="font-mono text-[11px] text-muted-foreground">({r.partnerCode})</span>
                    </td>
                    <td className="px-3 text-right text-muted-foreground">{r.price.minQty}</td>
                    <td className="px-3 text-right">
                      <MoneyCell value={r.price.price} currency={r.price.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
