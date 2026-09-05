import { MoneyCell } from '@/components/money-cell';
import { D } from '@plantero/core';
import { formatDate, formatQty } from '@/lib/format';
import type { getPurchaseOrderDetail } from '../queries';

type Lines = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>['lines'];

/** Sipariş satırları: miktar/alınan/faturalanan zinciri + tutar — belge zinciri okuma bağlamı (I19).
 *
 * Tur 1 P0 tedarik-po-detay-01 kök neden: bu tablo elle yazılmış (DataTable'ın mobil kart
 * karşılığı yok) — 7 sütunun 3'ü (Birim fiyat, Tutar, Beklenen tarih) 390px'te yalnızca yatay
 * kaydırmayla erişilebiliyordu, hiçbir kullanıcı bir satın alma siparişinin birim fiyatını
 * kaydırmadan görmüyordu. `md:` altında ayrı bir kart kalıbı eklendi (ürün+SKU başlık, miktar/
 * alınan meta satırı, birim fiyat + tutar sağda) — masaüstü tablo aynen korunur. */
export function OrderLinesTable({ lines }: { lines: Lines }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
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

      <ul className="space-y-2 md:hidden">
        {lines.map((r) => {
          const receivedFull = D(r.line.receivedQty).gte(D(r.line.qty));
          return (
            <li key={r.line.id} className="rounded-lg border border-border/70 bg-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] leading-5 font-medium">{r.productName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                </div>
                <MoneyCell value={r.line.lineTotal} className="shrink-0 text-[13px] font-semibold tabular-nums" />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  {formatQty(r.line.qty, r.uomCode)} sipariş · <span className={receivedFull ? 'text-success' : ''}>{formatQty(r.line.receivedQty)} alınan</span>
                </span>
                <MoneyCell value={r.line.unitPrice} className="shrink-0 tabular-nums" digits={2} />
              </div>
              {r.line.expectedDate ? <div className="mt-0.5 text-[11px] text-muted-foreground">Beklenen: {formatDate(r.line.expectedDate)}</div> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
