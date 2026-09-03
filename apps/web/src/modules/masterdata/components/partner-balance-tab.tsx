import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';
import type { PartnerDocRow } from '../queries';

function DocList({ title, kind, rows, currency }: { title: string; kind: 'sales_order' | 'invoice' | 'payment'; rows: PartnerDocRow[]; currency: string }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <EmptyState compact title="Kayıt yok" description="Bu cari için henüz belge oluşturulmadı." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                  <th className="h-9 px-3 text-left font-medium">Belge No</th>
                  <th className="h-9 px-3 text-left font-medium">Tarih</th>
                  <th className="h-9 px-3 text-left font-medium">Durum</th>
                  <th className="h-9 px-3 text-right font-medium">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.docNo} className="h-9 border-b border-border/50 last:border-0">
                    <td className="px-3 font-mono text-[12px]">{r.docNo}</td>
                    <td className="px-3 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-3">
                      <StatusBadge status={r.status} kind={kind === 'sales_order' ? 'sales_order' : kind === 'invoice' ? 'invoice' : 'payment'} />
                    </td>
                    <td className="px-3 text-right">
                      <MoneyCell value={r.amount} currency={r.currency || currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function PartnerBalanceTab({
  balance,
  currency,
  orders,
  invoices,
  payments,
}: {
  balance: string;
  currency: string;
  orders: PartnerDocRow[];
  invoices: PartnerDocRow[];
  payments: PartnerDocRow[];
}) {
  const n = Number(balance);
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
        <span className="text-[13px] text-muted-foreground">Güncel bakiye (pozitif = bize borçlu): </span>
        <MoneyCell value={balance} currency={currency} className={n > 0 ? 'text-success font-semibold' : n < 0 ? 'text-destructive font-semibold' : 'font-semibold'} />
      </div>
      <DocList title="Siparişler" kind="sales_order" rows={orders} currency={currency} />
      <DocList title="Faturalar" kind="invoice" rows={invoices} currency={currency} />
      <DocList title="Tahsilatlar / Ödemeler" kind="payment" rows={payments} currency={currency} />
    </div>
  );
}
