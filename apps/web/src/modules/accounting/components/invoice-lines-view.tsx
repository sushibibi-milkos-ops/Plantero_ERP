import { MoneyCell } from '@/components/money-cell';
import { formatQty } from '@/lib/format';
import type { InvoiceLineRow } from '../queries';

/**
 * Fatura satırları — masaüstünde tablo, mobilde tek kolona düşen kart listesi (5 sütun 375px'te
 * kesiliyordu; toplam satırları görünmez oluyordu — Tur kuralı: "formlar tek kolona düşer").
 * Toplamlar HER iki görünümde de ayrı, her zaman tam genişlikte bir blokta (asla kesilmez).
 */
export function InvoiceLinesView({ lines, currency, subtotal, vatTotal, grandTotal }: { lines: InvoiceLineRow[]; currency: string; subtotal: string; vatTotal: string; grandTotal: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Açıklama</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
              <th className="px-3 py-2 text-right font-medium">Birim fiyat</th>
              <th className="px-3 py-2 text-right font-medium">KDV %</th>
              <th className="px-3 py-2 text-right font-medium">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2">
                  <div>{l.productName ?? l.description}</div>
                  {l.productName ? <div className="text-[12px] text-muted-foreground">{l.description}</div> : null}
                  {l.accountCode ? <div className="font-mono text-[11px] text-muted-foreground">{l.accountCode}</div> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(l.qty)}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={l.unitPrice} currency={currency} /></td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">%{l.vatRate}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={l.lineTotal} currency={currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {lines.map((l) => (
          <div key={l.id} className="space-y-1 px-3 py-2.5 text-[13px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate">{l.productName ?? l.description}</div>
                {l.productName ? <div className="truncate text-[12px] text-muted-foreground">{l.description}</div> : null}
              </div>
              <MoneyCell value={l.lineTotal} currency={currency} className="shrink-0 font-medium" />
            </div>
            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span>{formatQty(l.qty)} × <MoneyCell value={l.unitPrice} currency={currency} className="text-[12px]" /> · KDV %{l.vatRate}</span>
              {l.accountCode ? <span className="font-mono">{l.accountCode}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t border-border/60 bg-muted/20 px-3 py-2.5 text-[13px]">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Ara toplam</span>
          <MoneyCell value={subtotal} currency={currency} />
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>KDV</span>
          <MoneyCell value={vatTotal} currency={currency} />
        </div>
        <div className="flex items-center justify-between font-medium">
          <span>Genel toplam</span>
          <MoneyCell value={grandTotal} currency={currency} />
        </div>
      </div>
    </div>
  );
}
