import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatQty } from '@/lib/format';

export type CustomerPriceRow = { price: { id: string; minQty: string; price: string; currency: string; validFrom: string | null; validTo: string | null }; sku: string; name: string };

export function PartnerCustomerPricesTab({ rows }: { rows: CustomerPriceRow[] }) {
  if (rows.length === 0) return <EmptyState compact title="Özel fiyat yok" description="Bu müşteri için tanımlı bir özel fiyat bulunmuyor (satış modülünden eklenir)." />;
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
            <th className="h-9 px-3 text-left font-medium">SKU</th>
            <th className="h-9 px-3 text-left font-medium">Ürün</th>
            <th className="h-9 px-3 text-right font-medium">Min. Miktar</th>
            <th className="h-9 px-3 text-right font-medium">Fiyat</th>
            <th className="h-9 px-3 text-left font-medium">Geçerlilik</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.price.id} className="h-9 border-b border-border/50 last:border-0">
              <td className="px-3 font-mono text-[12px]">{r.sku}</td>
              <td className="px-3">{r.name}</td>
              <td className="px-3 text-right text-muted-foreground">{formatQty(r.price.minQty)}</td>
              <td className="px-3 text-right">
                <MoneyCell value={r.price.price} currency={r.price.currency} />
              </td>
              <td className="px-3 text-muted-foreground">
                {r.price.validFrom || r.price.validTo ? `${r.price.validFrom ? formatDate(r.price.validFrom) : '—'} – ${r.price.validTo ? formatDate(r.price.validTo) : '—'}` : 'Süresiz'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
