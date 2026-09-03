import { MoneyCell } from '@/components/money-cell';
import { D } from '@plantero/core';
import { formatDate, formatQty } from '@/lib/format';
import type { getPurchaseOrderDetail } from '../queries';

type Lines = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>['lines'];

/** Sipariş satırları: miktar/alınan/faturalanan zinciri + tutar — belge zinciri okuma bağlamı (I19). */
export function OrderLinesTable({ lines }: { lines: Lines }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">Ürün</th>
            <th className="px-3 py-2 text-right font-medium">Sipariş</th>
            <th className="px-3 py-2 text-right font-medium">Alınan</th>
            <th className="px-3 py-2 text-right font-medium">Faturalanan</th>
            <th className="px-3 py-2 text-right font-medium">Birim fiyat</th>
            <th className="px-3 py-2 text-right font-medium">Tutar</th>
            <th className="px-3 py-2 font-medium">Beklenen tarih</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((r) => {
            const receivedFull = D(r.line.receivedQty).gte(D(r.line.qty));
            return (
              <tr key={r.line.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{r.productName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatQty(r.line.qty, r.uomCode)}</td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${receivedFull ? 'text-success' : ''}`}>{formatQty(r.line.receivedQty)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatQty(r.line.invoicedQty)}</td>
                <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.unitPrice} /></td>
                <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.lineTotal} /></td>
                <td className="px-3 py-2.5 text-muted-foreground">{r.line.expectedDate ? formatDate(r.line.expectedDate) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
