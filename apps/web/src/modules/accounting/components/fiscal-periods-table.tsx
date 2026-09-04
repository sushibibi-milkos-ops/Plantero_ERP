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
    // max-w-[720px] (tur 3 P1 kök nedeni): tablo önceden ana içerik genişliğine (1152px)
    // yayılıyordu ama gerçek içerik (4 dar sütun + eylem düğmesi) ~500px'te bitiyordu — sağda
    // ~200-650px ölü bant kalıyordu. Sarmalayıcı artık kendi içeriğine göre doğal genişliğinde
    // (üst sınır 720px), TABLO ise `w-full` ile bu sarmalayıcıyı doldurur (tur 4 P1 kök nedeni:
    // `w-full` yoksa table-layout:auto tabloyu 491px'te bırakıyor, çerçeve 720/984px'e kadar
    // sürüyor — başlık zemini/hairline'lar x=756'da bitip çerçevenin İÇİNDE 229px ölü bant
    // kalıyordu). Sütun genişlikleri hâlâ içeriğe göre dağılır (auto layout), yalnız toplam
    // genişlik artık çerçeveyle birebir eşleşir.
    <div className="max-w-[720px]">
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Dönem</th>
                <th className="px-3 py-2 font-medium">Başlangıç</th>
                <th className="px-3 py-2 font-medium">Bitiş</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                {/* sr-only (DataTable'ın __actions sütun başlığıyla aynı sözleşme): görünür bir
                    "Eylem" etiketi hücreye gereksiz genişlik ekler, ekran okuyucu için erişilebilir
                    kalır. */}
                {canClose ? <th className="px-3 py-2 font-medium"><span className="sr-only">Eylem</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                // group (kritik bulgu, kriter 11): eylem düğmesinin hover/odakta görünmesi için —
                // bkz. period-toggle-button.tsx altındaki not.
                <tr key={p.id} className={`group border-b border-border/40 last:border-0 ${p.code === todayCode ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-1 font-mono">{p.code}</td>
                  <td className="px-3 py-1 text-muted-foreground">{formatDate(p.startDate)}</td>
                  <td className="px-3 py-1 text-muted-foreground">{formatDate(p.endDate)}</td>
                  <td className="px-3 py-1"><StatusBadge status={p.isClosed ? 'closed' : 'open'} kind="fiscal_period" /></td>
                  {/* py-1 (tur 2 P1 muhasebe-donemler-02 kök nedeni): `py-2` hücre dolgusu + düğmenin
                      kendi yüksekliği satırı 49px'e çıkarıyordu (hedef ≤40px) — düğme zaten `size="sm"`. */}
                  {canClose ? <td className="px-3 py-1"><PeriodToggleButton code={p.code} isClosed={p.isClosed} revealOnHover /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobil kart listesi (tur 2 P0 muhasebe-donemler-01 kök nedeni): tablonun TEK eylemi
            (Kapat/Yeniden aç) 390px'te görünmez taşan bir kaydırıcının içindeydi — hiçbir görünür
            kaydırma ipucu yoktu, dönem açma/kapama mobilde fiilen yapılamıyordu.
            Eylem düğmesi artık satır SONUNDA, kompakt (auto genişlik, dikeyde ortalı) — tur 4 P1
            kök nedeni: `w-full` düğün 11/11 kartta ~119px kart adımı yaratıyordu (hedef 56-72px)
            ve masaüstündeki tek hover'da beliren ghost düğmeyle aynı eylem için ikinci, tutarsız
            bir kalıp oluşturuyordu (kriter 11). */}
        <div className="divide-y divide-border/40 md:hidden">
          {visible.map((p) => (
            <div key={p.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] ${p.code === todayCode ? 'bg-primary/5' : ''}`}>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{p.code}</span>
                  <StatusBadge status={p.isClosed ? 'closed' : 'open'} kind="fiscal_period" />
                </div>
                <div className="text-[12px] text-muted-foreground">{formatDate(p.startDate)} – {formatDate(p.endDate)}</div>
              </div>
              {canClose ? <PeriodToggleButton code={p.code} isClosed={p.isClosed} className="h-11 shrink-0" /> : null}
            </div>
          ))}
        </div>
      </div>
      {/* h-11 sm:h-8 (kritik bulgu, muhasebe-mobil-buton-01): 390px'te 32px yükseklikteydi. */}
      {hiddenCount > 0 ? (
        <Button variant="ghost" size="sm" className="mt-2 h-11 sm:h-8" onClick={() => setShowAll(true)}>
          <ChevronDown className="size-3.5" /> {hiddenCount} uzak gelecek dönemi daha göster
        </Button>
      ) : showAll ? (
        <Button variant="ghost" size="sm" className="mt-2 h-11 sm:h-8" onClick={() => setShowAll(false)}>
          <ChevronUp className="size-3.5" /> Daralt
        </Button>
      ) : null}
    </div>
  );
}
