import Decimal from 'decimal.js';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { formatMoney, formatPct } from '@/lib/format';
import { PRICE_SOURCE_LABELS } from '../labels';
import type { getSalesDocDetail } from '../queries';

type Detail = NonNullable<Awaited<ReturnType<typeof getSalesDocDetail>>>;

export function SalesDocLines({ lines, currency, showProgress }: { lines: Detail['lines']; currency: string; showProgress: boolean }) {
  // Ekran toplamı da her sayı gibi Decimal ile toplanır — float toplama yasak (CLAUDE.md).
  const grandTotal = lines.reduce((sum, l) => sum.plus(l.line.lineTotal), new Decimal(0));
  return (
    <div className="rounded-lg border border-border/70 bg-card">
      {/* Mobil kart listesi: 9 sütunlu ham tablo 390px'te en kritik sütunu (Satır toplamı) ekran
          dışına itiyordu. Ürün + miktar×fiyat + toplam kalır, kaynak/iskonto/KDV/ilerleme ikinci
          satırda etiket-değer çiftleri olarak (grid-cols-2) — hiçbiri kırpılmaz. */}
      <ul className="divide-y divide-border/60 md:hidden">
        {lines.map((l) => (
          <li key={l.line.id} className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{l.productName}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>
              </div>
              <MoneyCell value={l.line.lineTotal} currency={currency} className="shrink-0 font-semibold text-foreground" />
            </div>
            <div className="text-xs text-muted-foreground">
              <QtyCell value={l.line.qty} uom={l.uomCode} className="justify-start" /> × <MoneyCell value={l.line.unitPrice} currency={currency} digits={2} className="inline text-muted-foreground" />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-[12px]">
              <div><dt className="text-[11px] text-muted-foreground">Kaynak</dt><dd>{l.line.priceSource ? <StatusBadge status={l.line.priceSource} label={PRICE_SOURCE_LABELS[l.line.priceSource] ?? l.line.priceSource} tone={l.line.priceSource === 'customer' ? 'primary' : l.line.priceSource === 'channel' ? 'info' : 'muted'} dot={false} /> : '—'}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">İskonto</dt><dd className="font-mono tabular-nums">{Number(l.line.discountPct) > 0 ? formatPct(l.line.discountPct, 2) : '—'}</dd></div>
              {showProgress ? (
                <>
                  <div><dt className="text-[11px] text-muted-foreground">Teslim</dt><dd><QtyCell value={l.line.deliveredQty} uom={l.uomCode} className="justify-start" /></dd></div>
                  <div><dt className="text-[11px] text-muted-foreground">Fatura</dt><dd><QtyCell value={l.line.invoicedQty} uom={l.uomCode} className="justify-start" /></dd></div>
                </>
              ) : null}
            </dl>
          </li>
        ))}
        <li className="flex items-center justify-between p-3 text-xs font-medium text-muted-foreground">
          <span>Satırlar toplamı (KDV dahil)</span>
          <MoneyCell value={grandTotal.toFixed(4)} currency={currency} className="font-semibold text-foreground" />
        </li>
      </ul>

      <div className="scrollbar-thin hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead className="text-right">Miktar</TableHead>
            <TableHead className="text-right">Birim fiyat</TableHead>
            <TableHead>Kaynak</TableHead>
            <TableHead className="text-right">İskonto</TableHead>
            <TableHead className="text-right">KDV</TableHead>
            {/* Değer KDV dahil hesaplanır (lineSubtotal + lineVat) — Özet kartındaki "Ara toplam" KDV
                hariçtir; başlık bu farkı belirtmezse iki farklı toplam tabanı sessizce çakışıyordu. */}
            <TableHead className="text-right">Satır toplamı (KDV dahil)</TableHead>
            {showProgress ? (
              <>
                <TableHead className="text-right">Teslim</TableHead>
                <TableHead className="text-right">Fatura</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.line.id}>
              <TableCell>
                <div className="font-medium">{l.productName}</div>
                <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>
              </TableCell>
              <TableCell className="text-right"><QtyCell value={l.line.qty} uom={l.uomCode} /></TableCell>
              <TableCell className="text-right" title={formatMoney(l.line.unitPrice, currency, { digits: 4 })}><MoneyCell value={l.line.unitPrice} currency={currency} digits={2} /></TableCell>
              <TableCell>{l.line.priceSource ? <StatusBadge status={l.line.priceSource} label={PRICE_SOURCE_LABELS[l.line.priceSource] ?? l.line.priceSource} tone={l.line.priceSource === 'customer' ? 'primary' : l.line.priceSource === 'channel' ? 'info' : 'muted'} dot={false} /> : '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{Number(l.line.discountPct) > 0 ? formatPct(l.line.discountPct, 2) : '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatPct(l.line.vatRate, 2)}</TableCell>
              <TableCell className="text-right"><MoneyCell value={l.line.lineTotal} currency={currency} className="font-medium text-foreground" /></TableCell>
              {showProgress ? (
                <>
                  <TableCell className="text-right"><QtyCell value={l.line.deliveredQty} uom={l.uomCode} /></TableCell>
                  <TableCell className="text-right"><QtyCell value={l.line.invoicedQty} uom={l.uomCode} /></TableCell>
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="text-right text-xs font-medium text-muted-foreground">Satırlar toplamı (KDV dahil)</TableCell>
            <TableCell className="text-right"><MoneyCell value={grandTotal.toFixed(4)} currency={currency} className="font-semibold text-foreground" /></TableCell>
            {showProgress ? <TableCell colSpan={2} /> : null}
          </TableRow>
        </TableFooter>
      </Table>
      </div>
    </div>
  );
}
