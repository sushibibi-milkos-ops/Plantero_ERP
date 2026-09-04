import { MoneyCell } from '@/components/money-cell';
import { formatQty, formatPct } from '@/lib/format';
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
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
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
                  {/* description === productName ise ikinci satır basılmaz (tur 2 P2
                      muhasebe-fatura-detay-03) — aynı metin iki kez yazılınca satır 70.5px'e
                      çıkıyordu (hedef 36-40px); ikinci satır yalnızca GERÇEK ek bilgi taşıyorsa değer. */}
                  {l.productName && l.description !== l.productName ? <div className="text-[12px] text-muted-foreground">{l.description}</div> : null}
                  {l.accountCode ? <div className="font-mono text-[11px] text-muted-foreground">{l.accountCode}</div> : null}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatQty(l.qty, l.uomCode)}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={l.unitPrice} currency={currency} /></td>
                {/* formatPct (tur 2 P1 muhasebe-fatura-detay-01): ham numeric(18,4) çıplak basılıyordu
                    ("%20.0000", 4 ondalık nokta ayraçlı) — aynı satırdaki MoneyCell TR virgülüyle
                    ("₺30.600,00") çelişiyordu. formatPct gereksiz sıfırları atar, TR virgül kullanır. */}
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{formatPct(l.vatRate)}</td>
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
                {l.productName && l.description !== l.productName ? <div className="truncate text-[12px] text-muted-foreground">{l.description}</div> : null}
              </div>
              <MoneyCell value={l.lineTotal} currency={currency} className="shrink-0 font-medium" />
            </div>
            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span>{formatQty(l.qty, l.uomCode)} × <MoneyCell value={l.unitPrice} currency={currency} className="text-[12px]" /> · KDV {formatPct(l.vatRate)}</span>
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
