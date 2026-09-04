import { MoneyCell } from '@/components/money-cell';
import { EmptyCell } from '@/components/empty-cell';
import type { ChartAccountRow } from '../queries';

const TYPE_LABELS: Record<string, string> = { asset: 'Varlık', liability: 'Yükümlülük', equity: 'Özkaynak', income: 'Gelir', expense: 'Gider', cogs: 'SMM', off_balance: 'Nazım' };

/** Hesap planı — masaüstünde tablo, mobilde kart listesi (VUK/UFRS bakiye sütunları 375px'te kesiliyordu). */
export function ChartOfAccountsView({ accounts }: { accounts: ChartAccountRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Kod</th>
              <th className="px-3 py-2 font-medium">Ad</th>
              <th className="px-3 py-2 font-medium">Tip</th>
              <th className="px-3 py-2 font-medium">UFRS kodu</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye (VUK)</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye (UFRS)</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const depth = a.code.split('.').length - 1;
              return (
                <tr key={a.code} className={`border-b border-border/40 last:border-0 ${!a.isPostable ? 'bg-muted/20' : ''}`}>
                  <td className="px-3 py-2 font-mono" style={{ paddingLeft: `${12 + depth * 16}px` }}>{a.code}</td>
                  <td className="px-3 py-2">{a.name}{!a.isPostable ? <span className="ml-2 text-[11px] text-muted-foreground">(ara toplam)</span> : null}</td>
                  <td className="px-3 py-2 text-muted-foreground">{TYPE_LABELS[a.type] ?? a.type}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{a.ifrsCode ?? <EmptyCell />}</td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={a.balanceVuk} muted={Number(a.balanceVuk) === 0} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={a.balanceUfrs} muted={Number(a.balanceUfrs) === 0} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {accounts.map((a) => (
          <div key={a.code} className={`px-3 py-2.5 text-[13px] ${!a.isPostable ? 'bg-muted/20' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span><span className="font-mono">{a.code}</span> <span className="text-muted-foreground">{TYPE_LABELS[a.type] ?? a.type}</span></span>
              <MoneyCell value={a.balanceVuk} muted={Number(a.balanceVuk) === 0} className="shrink-0" />
            </div>
            <div className="text-muted-foreground">{a.name}</div>
            {Number(a.balanceUfrs) !== Number(a.balanceVuk) ? (
              <div className="mt-0.5 text-[12px] text-muted-foreground">UFRS: <MoneyCell value={a.balanceUfrs} className="text-[12px]" /></div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
