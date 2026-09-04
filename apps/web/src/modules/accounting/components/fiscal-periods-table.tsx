'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeriodToggleButton } from './period-toggle-button';
import { formatDate } from '@/lib/format';

export type FiscalPeriodRow = { id: string; code: string; startDate: string; endDate: string; isClosed: boolean };

/** Uzak gelecek dönemler (kapatılacak/bakılacak bir şey olmayan, 2 aydan fazla ileri) varsayılan olarak katlanır. */
export function FiscalPeriodsTable({ periods, canClose, horizonMonths = 2 }: { periods: FiscalPeriodRow[]; canClose: boolean; horizonMonths?: number }) {
  const [showAll, setShowAll] = useState(false);
  const todayCode = new Date().toISOString().slice(0, 7);

  const { visible, hiddenCount } = useMemo(() => {
    const horizon = new Date(`${todayCode}-01T00:00:00Z`);
    horizon.setUTCMonth(horizon.getUTCMonth() + horizonMonths);
    const horizonCode = horizon.toISOString().slice(0, 7);
    if (showAll) return { visible: periods, hiddenCount: 0 };
    const near = periods.filter((p) => p.code <= horizonCode);
    return { visible: near, hiddenCount: periods.length - near.length };
  }, [periods, showAll, todayCode, horizonMonths]);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Dönem</th>
              <th className="px-3 py-2 font-medium">Başlangıç</th>
              <th className="px-3 py-2 font-medium">Bitiş</th>
              <th className="px-3 py-2 font-medium">Durum</th>
              {canClose ? <th className="px-3 py-2 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={`border-b border-border/40 last:border-0 ${p.code === todayCode ? 'bg-primary/5' : ''}`}>
                <td className="px-3 py-2 font-mono">{p.code}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(p.startDate)}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(p.endDate)}</td>
                <td className="px-3 py-2">
                  <span className={p.isClosed ? 'font-medium text-muted-foreground' : 'font-medium text-success'}>{p.isClosed ? 'Kapalı' : 'Açık'}</span>
                </td>
                {canClose ? <td className="px-3 py-2"><PeriodToggleButton code={p.code} isClosed={p.isClosed} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
          <ChevronDown className="size-3.5" /> {hiddenCount} uzak gelecek dönemi daha göster
        </Button>
      ) : showAll ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(false)}>
          <ChevronUp className="size-3.5" /> Daralt
        </Button>
      ) : null}
    </div>
  );
}
