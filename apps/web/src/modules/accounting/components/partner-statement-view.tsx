import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import type { StatementLine } from '../queries';

/** Cari ekstresi — masaüstünde tablo, mobilde kart listesi (Borç/Alacak/Bakiye sütunları 375px'te kesiliyordu). */
export function PartnerStatementView({ lines }: { lines: StatementLine[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
              <th className="px-3 py-2 font-medium">Tarih</th>
              <th className="px-3 py-2 font-medium">Belge</th>
              <th className="px-3 py-2 font-medium">Açıklama</th>
              <th className="px-3 py-2 text-right font-medium">Borç</th>
              <th className="px-3 py-2 text-right font-medium">Alacak</th>
              <th className="px-3 py-2 text-right font-medium">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.docNo}-${i}`} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{formatDate(l.date)}</td>
                <td className="px-3 py-2 font-mono">{l.docNo}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.description}</td>
                <td className="px-3 py-2 text-right">{Number(l.debit) > 0 ? <MoneyCell value={l.debit} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right">{Number(l.credit) > 0 ? <MoneyCell value={l.credit} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={l.runningBalance} signed /></td>
              </tr>
            ))}
            {!lines.length ? <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Bu cari için henüz hareket yok.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border/40 md:hidden">
        {lines.map((l, i) => (
          <div key={`${l.docNo}-${i}`} className="space-y-1 px-3 py-2.5 text-[13px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono">{l.docNo}</span>
                <span className="ml-2 text-[12px] text-muted-foreground">{formatDate(l.date)}</span>
              </div>
              <MoneyCell value={l.runningBalance} signed className="shrink-0 font-medium" />
            </div>
            <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
              <span className="truncate">{l.description}</span>
              <span className="shrink-0">{Number(l.debit) > 0 ? <>Borç <MoneyCell value={l.debit} className="text-[12px]" /></> : <>Alacak <MoneyCell value={l.credit} className="text-[12px]" /></>}</span>
            </div>
          </div>
        ))}
        {!lines.length ? <div className="px-3 py-10 text-center text-muted-foreground">Bu cari için henüz hareket yok.</div> : null}
      </div>
    </div>
  );
}
