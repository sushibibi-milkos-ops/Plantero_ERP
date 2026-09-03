import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { PRICE_SOURCE_LABELS } from '../labels';
import type { getSalesDocDetail } from '../queries';

type Detail = NonNullable<Awaited<ReturnType<typeof getSalesDocDetail>>>;

export function SalesDocLines({ lines, currency, showProgress }: { lines: Detail['lines']; currency: string; showProgress: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70 bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead className="text-right">Miktar</TableHead>
            <TableHead className="text-right">Birim fiyat</TableHead>
            <TableHead>Kaynak</TableHead>
            <TableHead className="text-right">İskonto</TableHead>
            <TableHead className="text-right">KDV</TableHead>
            <TableHead className="text-right">Satır toplamı</TableHead>
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
              <TableCell className="text-right"><MoneyCell value={l.line.unitPrice} currency={currency} digits={4} /></TableCell>
              <TableCell>{l.line.priceSource ? <StatusBadge status={l.line.priceSource} label={PRICE_SOURCE_LABELS[l.line.priceSource] ?? l.line.priceSource} tone={l.line.priceSource === 'customer' ? 'primary' : l.line.priceSource === 'channel' ? 'info' : 'muted'} dot={false} /> : '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">{Number(l.line.discountPct) > 0 ? `%${l.line.discountPct}` : '—'}</TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">%{l.line.vatRate}</TableCell>
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
      </Table>
    </div>
  );
}
