import { MoneyCell } from '@/components/money-cell';
import type { JournalLineRow } from '../queries';

/** Yevmiye satırları — masaüstünde tablo, mobilde kart listesi (Borç/Alacak sütunları 375px'te görünmez oluyordu). */
export function JournalLinesView({ lines, totalDebit, totalCredit }: { lines: JournalLineRow[]; totalDebit: string; totalCredit: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Hesap</th>
              <th className="px-3 py-2 font-medium">Cari</th>
              <th className="px-3 py-2 font-medium">Açıklama</th>
              <th className="px-3 py-2 text-right font-medium">Borç</th>
              <th className="px-3 py-2 text-right font-medium">Alacak</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-mono">{l.accountCode} <span className="font-sans text-muted-foreground">{l.accountName}</span></td>
                <td className="px-3 py-2">{l.partnerName ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.description ?? '—'}</td>
                <td className="px-3 py-2 text-right">{Number(l.debit) > 0 ? <MoneyCell value={l.debit} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right">{Number(l.credit) > 0 ? <MoneyCell value={l.credit} /> : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-medium">
              <td colSpan={3} className="px-3 py-2 text-right">Toplam</td>
              <td className="px-3 py-2 text-right"><MoneyCell value={totalDebit} /></td>
              <td className="px-3 py-2 text-right"><MoneyCell value={totalCredit} /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {lines.map((l) => (
          <div key={l.id} className="space-y-1 px-3 py-2.5 text-[13px]">
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono">{l.accountCode} <span className="font-sans text-muted-foreground">{l.accountName}</span></span>
              <span className="shrink-0 text-right text-[12px]">
                <span className="mr-1 text-muted-foreground">{Number(l.debit) > 0 ? 'Borç' : 'Alacak'}</span>
                <MoneyCell value={Number(l.debit) > 0 ? l.debit : l.credit} />
              </span>
            </div>
            {l.partnerName ? <div className="text-[12px] text-muted-foreground">{l.partnerName}</div> : null}
            {l.description ? <div className="text-[12px] text-muted-foreground">{l.description}</div> : null}
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
