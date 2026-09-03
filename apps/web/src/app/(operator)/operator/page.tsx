import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listProductionLines, getActiveWorkOrderForLine } from '@/modules/production/queries';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Operatör' };
export const dynamic = 'force-dynamic';

export default async function OperatorHome() {
  const user = await requireUser();
  const lines = await listProductionLines();
  const withActive = await Promise.all(lines.map(async (l) => ({ line: l, active: await getActiveWorkOrderForLine(l.id) })));

  const runningCount = withActive.filter((w) => w.active?.wo.status === 'in_progress').length;
  const pausedCount = withActive.filter((w) => w.active?.wo.status === 'paused').length;
  const idleCount = lines.length - runningCount - pausedCount;

  return (
    // lg:max-w-5xl: 1024×768 tabletde max-w-3xl (768px) içerik yüksekliğin ~%53'ünü, genişliğin
    // %47'sini dolduruyordu (Tur 2 bulgusu) — büyük ekranlarda terminal daha geniş açılır.
    <div className="mx-auto max-w-3xl space-y-6 lg:max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Merhaba, {user.fullName.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Çalışacağınız hattı seçin.</p>
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={Factory} title="Üretim hattı tanımlı değil" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {withActive.map(({ line, active }) => (
              <Link
                key={line.id}
                href={`/operator/${line.id}`}
                data-pressable
                className="flex min-h-52 flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-transform active:scale-[0.98] lg:min-h-64"
              >
                <div>
                  <div className="font-mono text-xs text-muted-foreground">{line.code}</div>
                  <div className="text-base font-semibold">{line.name}</div>
                </div>
                {active ? (
                  <div className="space-y-1.5">
                    <StatusBadge status={active.wo.status} kind="work_order" />
                    <div className="truncate text-sm text-muted-foreground">{active.product.name}</div>
                    {/* /uretim/hatlar kartıyla aynı anatomi: ilerleme çubuğu + üretilen/planlanan —
                        önceden bu ekranda yalnızca ürün adı vardı, hangi iş emrinde ne kadar
                        ilerlendiği operatörün hat seçmeden önce görebileceği bir bilgi değildi.
                        opacity-60 kaldırıldı: 0'da düz gri çizgi ayraçtan ayırt edilemiyordu (Tur 2
                        bulgusu) — hairline + birleşik "0 / 70 ADET (%0)" etiketi. */}
                    {(() => {
                      const pct = D(active.wo.plannedQty).gt(0) ? Math.min(100, D(active.wo.producedQty).div(active.wo.plannedQty).mul(100).toNumber()) : 0;
                      return (
                        <>
                          <Progress value={pct} className="h-1.5" />
                          <div className="text-xs text-muted-foreground">
                            <QtyCell value={active.wo.producedQty} /> / <QtyCell value={active.wo.plannedQty} uom={active.uomCode} /> (%{Math.round(pct)})
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Aktif iş emri yok</span>
                )}
                {/* Tek dokunma göstergesi köşedeki 20px ChevronRight'tan tam genişlik bir "düğme"ye
                    (kart zaten tek büyük dokunma hedefi — <a> içine gerçek <button> konmaz, görsel
                    olarak düğme gibi davranan bir bant yeterli) — Tur 2 bulgusu. */}
                <div className="mt-1 flex h-12 items-center justify-center gap-1.5 rounded-lg bg-primary/10 text-sm font-medium text-primary">
                  Hattı aç <ChevronRight className="size-4" />
                </div>
              </Link>
            ))}
          </div>

          {/* Vardiya özeti: min-h-52/lg:min-h-64 ile büyüyen kartların altında kalan boşluğu dolduran,
              hattı tek tek incelemeden genel duruma bakış sağlayan şerit (Tur 2 bulgusu). */}
          <div className="hidden items-center gap-4 rounded-xl border border-border/70 bg-card px-4 py-3 lg:flex">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Vardiya özeti</span>
            <span className="flex items-center gap-1.5 text-sm">
              <span aria-hidden className="size-1.5 rounded-full bg-success motion-safe:animate-pulse" /> {runningCount} çalışıyor
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" /> {pausedCount} duraklatıldı
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50" /> {idleCount} boşta
            </span>
          </div>
        </>
      )}
    </div>
  );
}
