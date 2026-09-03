import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, ChevronRight, ListOrdered } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listProductionLines, listOpenWorkOrdersForLine } from '@/modules/production/queries';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Operatör' };
export const dynamic = 'force-dynamic';

// /uretim/hatlar'daki (line-cards.tsx) durum rozetiyle birebir aynı sözlük — aynı hat iki ekranda
// iki farklı anatomiyle çiziliyordu (boş hatlarda rozet hiç yoktu, Tur 3 bulgusu, P2).
const STATUS_TONE: Record<'running' | 'paused' | 'idle', { label: string; className: string; dot: string }> = {
  running: { label: 'Çalışıyor', className: 'bg-success/12 text-success', dot: 'bg-success' },
  paused: { label: 'Duraklatıldı', className: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning', dot: 'bg-warning' },
  idle: { label: 'Boşta', className: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/50' },
};

export default async function OperatorHome() {
  const user = await requireUser();
  const lines = await listProductionLines();
  // getActiveWorkOrderForLine yerine doğrudan kuyruk: birden fazla eşit öncelikli açık iş emri
  // varken (ör. iki `released`) o fonksiyon bilinçli olarak null döner (Tur 3 bulgusu, P0) — burada
  // "Aktif iş emri yok" yazıp kuyruğu gizlemek yerine kuyruk uzunluğunu gösteririz.
  const withActive = await Promise.all(
    lines.map(async (l) => {
      const queue = await listOpenWorkOrdersForLine(l.id);
      const active = queue.find((w) => w.status === 'in_progress') ?? queue.find((w) => w.status === 'paused') ?? null;
      return { line: l, queue, active };
    }),
  );

  const runningCount = withActive.filter((w) => w.active?.status === 'in_progress').length;
  const pausedCount = withActive.filter((w) => w.active?.status === 'paused').length;
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
            {withActive.map(({ line, active, queue }) => {
              const tone = active?.status === 'paused' ? STATUS_TONE.paused : active?.status === 'in_progress' ? STATUS_TONE.running : STATUS_TONE.idle;
              return (
                <Link
                  key={line.id}
                  href={`/operator/${line.id}`}
                  data-pressable
                  className="flex min-h-52 flex-col justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 transition-transform active:scale-[0.98] lg:min-h-64"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{line.code}</div>
                      <div className="text-base font-semibold">{line.name}</div>
                    </div>
                    {/* Durum rozeti /uretim/hatlar (line-cards.tsx) ile birebir aynı — boş hatta da her
                        zaman gösterilir; eskiden yalnızca aktif iş emri varken görünüyordu, iki ekran
                        arasında hat durumu iki farklı yerden okunuyordu (Tur 3 bulgusu, P2). */}
                    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', tone.className)}>
                      <span aria-hidden className={cn('size-1.5 rounded-full', tone.dot)} />
                      {tone.label}
                    </span>
                  </div>
                  {active ? (
                    <div className="space-y-1.5">
                      <div className="truncate text-sm text-muted-foreground">{active.productName}</div>
                      {/* /uretim/hatlar kartıyla aynı anatomi: ilerleme çubuğu + üretilen/planlanan —
                          önceden bu ekranda yalnızca ürün adı vardı, hangi iş emrinde ne kadar
                          ilerlendiği operatörün hat seçmeden önce görebileceği bir bilgi değildi.
                          opacity-60 kaldırıldı: 0'da düz gri çizgi ayraçtan ayırt edilemiyordu (Tur 2
                          bulgusu) — hairline + birleşik "0 / 70 ADET (%0)" etiketi. */}
                      {(() => {
                        const pct = D(active.plannedQty).gt(0) ? Math.min(100, D(active.producedQty).div(active.plannedQty).mul(100).toNumber()) : 0;
                        return (
                          <>
                            <Progress value={pct} className="h-1.5" />
                            <div className="text-xs text-muted-foreground">
                              <QtyCell value={active.producedQty} /> / <QtyCell value={active.plannedQty} uom={active.uomCode} /> (%{Math.round(pct)})
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : queue.length > 0 ? (
                    // Birden fazla eşit öncelikli açık iş emri (hepsi `released`, hiçbiri başlamamış) —
                    // hangisinin "aktif" sayılacağı belirsiz, otomatik seçilmiyor (Tur 3 bulgusu, P0).
                    // Hattı açınca operatör kuyruktan seçer.
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ListOrdered className="size-3.5 shrink-0" />
                      {queue.length} iş emri kuyrukta — seçim bekliyor
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
              );
            })}
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
