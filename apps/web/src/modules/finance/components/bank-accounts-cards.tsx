import { Landmark } from 'lucide-react';
import { MoneyCell } from '@/components/money-cell';
import { D } from '@plantero/core';
import type { BankAccountSummary } from '../queries';

/** Banka hesap kartları: ekstre bakiyesi, defter bakiyesi (102.xx), fark */
export function BankAccountsCards({ accounts }: { accounts: BankAccountSummary[] }) {
  if (!accounts.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => {
        const diffZero = D(a.diff).abs().lt('0.01');
        return (
          <div key={a.id} className="rounded-lg border border-border/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Landmark className="size-3.5 text-muted-foreground" />
                  {a.bankName}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{a.accountCode} · {a.currency}</div>
              </div>
              {a.unmatchedCount > 0 ? (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-[oklch(0.5_0.14_70)] dark:text-warning">{a.unmatchedCount} bekliyor</span>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ekstre bakiyesi</div>
                <MoneyCell value={a.statementBalance} currency={a.currency} className="text-sm" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Defter bakiyesi</div>
                <MoneyCell value={a.ledgerBalanceVuk} currency={a.currency} className="text-sm" />
              </div>
            </div>
            {!diffZero ? (
              <div className="mt-2 text-[12px] text-warning">Fark: <MoneyCell value={a.diff} currency={a.currency} signed /></div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
