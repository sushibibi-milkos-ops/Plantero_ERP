import { MoneyCell } from '@/components/money-cell';
import type { TrialBalanceRow } from '../queries';

/** Mizan — masaüstünde tablo, mobilde kart listesi (3 para sütunu 375px'te kesiliyordu). */
export function TrialBalanceView({ rows, totalDebit, totalCredit }: { rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Kod</th>
              <th className="px-3 py-2 font-medium">Hesap</th>
              <th className="px-3 py-2 text-right font-medium">Borç</th>
              <th className="px-3 py-2 text-right font-medium">Alacak</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={r.debit} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={r.credit} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={r.balance} signed /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-medium">
              <td colSpan={2} className="px-3 py-2 text-right">Toplam</td>
              <td className="px-3 py-2 text-right"><MoneyCell value={totalDebit} /></td>
              <td className="px-3 py-2 text-right"><MoneyCell value={totalCredit} /></td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {rows.map((r) => (
          <div key={r.code} className="px-3 py-2.5 text-[13px]">
            <div className="flex items-center justify-between gap-2">
              <span><span className="font-mono">{r.code}</span> <span className="text-muted-foreground">{r.name}</span></span>
              <MoneyCell value={r.balance} signed className="shrink-0 font-medium" />
            </div>
            <div className="mt-0.5 flex gap-3 text-[12px] text-muted-foreground">
              <span>Borç <MoneyCell value={r.debit} className="text-[12px]" /></span>
              <span>Alacak <MoneyCell value={r.credit} className="text-[12px]" /></span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-3 py-2.5 text-[13px] font-medium md:hidden">
        <span>Toplam</span>
        <span className="flex gap-3">
          <MoneyCell value={totalDebit} />
          <MoneyCell value={totalCredit} />
        </span>
      </div>
    </div>
  );
}
