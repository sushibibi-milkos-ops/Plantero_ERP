import { cn } from '@/lib/utils';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime } from '@/lib/format';
import type { BankAccountSummary } from '../queries';

export function BankAccountsCards({ accounts }: { accounts: BankAccountSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => {
        const diffZero = Math.abs(Number(a.diff)) < 0.01;
        return (
          <div key={a.id} className="rounded-lg border border-border/60 p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{a.bankName}{a.branch ? ` — ${a.branch}` : ''}</div>
                <div className="font-mono text-[12px] text-muted-foreground">{a.code} · {a.accountCode} · {a.currency}</div>
              </div>
              {a.unmatchedCount > 0 ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-warning/15 px-2 text-[11px] font-medium text-[oklch(0.5_0.14_70)] dark:text-warning">{a.unmatchedCount} bekliyor</span>
              ) : null}
            </div>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Ekstre bakiyesi</dt>
                <dd><MoneyCell value={a.statementBalance} currency={a.currency} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Defter bakiyesi (VUK)</dt>
                <dd><MoneyCell value={a.ledgerBalanceVuk} currency={a.currency} /></dd>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-1.5">
                <dt className={cn('font-medium', diffZero ? 'text-muted-foreground' : 'text-warning')}>Fark</dt>
                <dd><MoneyCell value={a.diff} currency={a.currency} signed muted={diffZero} /></dd>
              </div>
            </dl>
            <div className="mt-2 text-[11px] text-muted-foreground">{a.lastSyncedAt ? `Son senkron: ${formatDateTime(a.lastSyncedAt)}` : 'Henüz senkronize edilmedi'}</div>
          </div>
        );
      })}
    </div>
  );
}
