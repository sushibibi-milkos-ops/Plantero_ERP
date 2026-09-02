import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import type { StockBreakdownRow } from '../queries';

export function ProductStockTab({ rows, uomCode }: { rows: StockBreakdownRow[]; uomCode: string }) {
  if (rows.length === 0) return <EmptyState compact title="Eldeki stok yok" description="Bu üründe hiçbir depoda hareket görülen stok bulunmuyor." />;

  const totalQty = rows.reduce((acc, r) => acc + Number(r.qty), 0);
  const totalValue = rows.reduce((acc, r) => acc + Number(r.value), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-[13px]">
        <div>
          <span className="text-muted-foreground">Toplam eldeki: </span>
          <span className="num font-semibold">{totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} {uomCode}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Toplam değer: </span>
          <MoneyCell value={String(totalValue)} className="font-semibold" />
        </div>
        <div className="text-muted-foreground">{rows.length} lokasyon/lot satırı</div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[12px] whitespace-nowrap text-muted-foreground">
                <th className="h-9 px-3 text-left font-medium">Depo</th>
                <th className="h-9 px-3 text-left font-medium">Lokasyon</th>
                <th className="h-9 px-3 text-left font-medium">Lot</th>
                <th className="h-9 px-3 text-left font-medium">SKT</th>
                <th className="h-9 px-3 text-right font-medium">Miktar</th>
                <th className="h-9 px-3 text-right font-medium">Rezerve</th>
                <th className="h-9 px-3 text-right font-medium">Birim Maliyet</th>
                <th className="h-9 px-3 text-right font-medium">Değer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.quantId} className="h-9 border-b border-border/50 last:border-0 whitespace-nowrap">
                  <td className="px-3">{r.warehouseName}</td>
                  <td className="px-3 font-mono text-[12px] text-muted-foreground">{r.locationCode}</td>
                  <td className="px-3">
                    <LotBadge lotNo={r.lotNo} status={r.lotStatus} />
                  </td>
                  <td className="px-3">{r.expiryDate ? <ExpiryBadge date={r.expiryDate} showDate={false} /> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3">
                    <QtyCell value={r.qty} uom={uomCode} />
                  </td>
                  <td className="px-3">
                    <QtyCell value={r.reservedQty} uom={uomCode} />
                  </td>
                  <td className="px-3">
                    <MoneyCell value={r.unitCost} digits={4} muted />
                  </td>
                  <td className="px-3">
                    <MoneyCell value={r.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
