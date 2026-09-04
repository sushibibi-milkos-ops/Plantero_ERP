'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
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
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="hidden overflow-x-auto md:block">
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
                  <td className="px-3 py-1 font-mono">{p.code}</td>
                  <td className="px-3 py-1 text-muted-foreground">{formatDate(p.startDate)}</td>
                  <td className="px-3 py-1 text-muted-foreground">{formatDate(p.endDate)}</td>
                  <td className="px-3 py-1"><StatusBadge status={p.isClosed ? 'closed' : 'open'} kind="fiscal_period" /></td>
                  {/* py-1 (tur 2 P1 muhasebe-donemler-02 kök nedeni): `py-2` hücre dolgusu + düğmenin
                      kendi yüksekliği satırı 49px'e çıkarıyordu (hedef ≤40px) — düğme zaten `size="sm"`. */}
                  {canClose ? <td className="px-3 py-1"><PeriodToggleButton code={p.code} isClosed={p.isClosed} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobil kart listesi (tur 2 P0 muhasebe-donemler-01 kök nedeni): tablonun TEK eylemi
            (Kapat/Yeniden aç) 390px'te görünmez taşan bir kaydırıcının içindeydi — hiçbir görünür
            kaydırma ipucu yoktu, dönem açma/kapama mobilde fiilen yapılamıyordu. */}
        <div className="divide-y divide-border/40 md:hidden">
          {visible.map((p) => (
            <div key={p.id} className={`space-y-2 px-3 py-2.5 text-[13px] ${p.code === todayCode ? 'bg-primary/5' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{p.code}</span>
                <StatusBadge status={p.isClosed ? 'closed' : 'open'} kind="fiscal_period" />
              </div>
              <div className="text-[12px] text-muted-foreground">{formatDate(p.startDate)} – {formatDate(p.endDate)}</div>
              {canClose ? <PeriodToggleButton code={p.code} isClosed={p.isClosed} className="h-11 w-full" /> : null}
            </div>
          ))}
        </div>
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
