import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, ChevronRight, ListOrdered, OctagonPause } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { listProductionLines, listOpenWorkOrdersForLine, listLineShiftSummaries, listNextPlannedWorkOrders } from '@/modules/production/queries';
import { EmptyState } from '@/components/empty-state';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatTime, formatDate, formatQty } from '@/lib/format';
import { D } from '@plantero/core';
import { DOWNTIME_REASON_LABELS } from '@/modules/production/labels';

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
  const [shiftSummaries, nextPlannedByLine] = await Promise.all([
    listLineShiftSummaries(lines.map((l) => l.id)),
    listNextPlannedWorkOrders(lines.map((l) => l.id)),
  ]);
  const summaryByLine = new Map(shiftSummaries.map((s) => [s.lineId, s]));

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
              const running = active?.status === 'in_progress';
              const tone = active?.status === 'paused' ? STATUS_TONE.paused : running ? STATUS_TONE.running : STATUS_TONE.idle;
              const nextPlanned = nextPlannedByLine.get(line.id);
              return (
                <Link
                  key={line.id}
                  href={`/operator/${line.id}`}
                  data-pressable
                  className={cn(
                    // justify-between kaldırıldı: gövde artık `flex-1` ile kendi payını alıp boş
                    // durumda içeriği dikey ortalıyor — eskiden üç kısa öğe (başlık/"Aktif iş emri
                    // yok"/"Hattı aç") kartın uçlarına itilip aradaki ~130px bilgi taşımayan boşlukta
                    // kalıyordu (Tur 5 bulgusu, P1).
                    'flex min-h-52 flex-col gap-3 rounded-xl border p-4 transition-transform active:scale-[0.98] lg:min-h-64',
                    // Çalışan hat boşta/duraklatılmış hatlarla aynı görsel ağırlıktaydı — fabrika
                    // zemininde hangi hattın çalıştığı kartlara bakmadan, göz gezdirerek ayırt
                    // edilemiyordu (Tur 4 bulgusu, P1).
                    running ? 'border-success/40 bg-success/5' : 'border-border/70 bg-card',
                  )}
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
                  <div className="flex-1">
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
                      <div className="flex h-full items-center gap-1.5 text-sm text-muted-foreground">
                        <ListOrdered className="size-3.5 shrink-0" />
                        {queue.length} iş emri kuyrukta — seçim bekliyor
                      </div>
                    ) : (
                      // "Aktif iş emri yok" tek başına eylemsiz/bağlamsızdı — operatör hattı açmadan
                      // bugün ne planlandığını göremiyordu (Tur 5 bulgusu, P1). Sıradaki henüz serbest
                      // bırakılmamış (status='planned') iş emri varsa doc no + tarih altta gösterilir.
                      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                        <span className="text-sm text-muted-foreground">Bugün planlanan iş emri yok</span>
                        {nextPlanned ? (
                          <span className="text-[11px] text-muted-foreground/70">
                            Sıradaki: <span className="font-mono">{nextPlanned.docNo}</span>
                            {nextPlanned.plannedStart ? ` · ${formatDate(nextPlanned.plannedStart)}` : ''}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                {/* Tek dokunma göstergesi köşedeki 20px ChevronRight'tan tam genişlik bir "düğme"ye
                    (kart zaten tek büyük dokunma hedefi — <a> içine gerçek <button> konmaz, görsel
                    olarak düğme gibi davranan bir bant yeterli) — Tur 2 bulgusu.
                    Kök neden (Tur 4 P1): birincil aksiyon her hatta aynı açık yeşil zemin + yeşil
                    metindi (düşük kontrast) — fabrika zemininin parlak ışığında ve eldivenli
                    kullanımda çalışan hatta yüksek kontrastlı dolu birincil, boşta/duraklatılmış
                    hatlarda nötr outline daha net bir hiyerarşi kurar. */}
                  <div
                    className={cn(
                      'flex h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-medium',
                      running ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground',
                    )}
                  >
                    Hattı aç <ChevronRight className="size-4" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Vardiya özeti: hattı tek tek incelemeden genel duruma bakış sağlayan şerit (Tur 2 bulgusu).
              Kök neden (Tur 5 bulgusu, P0): `hidden ... lg:block` bu şeridi 1024px altındaki TÜM
              cihazlarda (768×1024 portre tablet — fabrika zemininin en yaygın montajı — ve telefon)
              tamamen gizliyordu; operatörün hat seçmeden önce vardiya ilerlemesini/duruşları
              görebileceği tek yer kayboluyordu, yerine hiçbir mobil karşılık yoktu. Artık her
              genişlikte render edilir; yalnızca kapasite çubuğu lg+'da görünür (aşağıya bkz.),
              <lg'de hat kodu + üretilen/hedef + duruş metninden oluşan yoğun bir liste kalır. */}
          <div className="rounded-xl border border-border/70 bg-card">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/60 px-4 py-3">
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
            <div className="divide-y divide-border/40">
              {lines.map((line) => {
                const summary = summaryByLine.get(line.id);
                const produced = D(summary?.todayProducedQty ?? 0);
                const target = D(summary?.todayTargetQty ?? 0);
                const pct = target.gt(0) ? Math.min(100, produced.div(target).mul(100).toNumber()) : 0;
                return (
                  <div key={line.id} className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                    <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground sm:w-16 sm:text-xs">{line.code}</span>
                    {/* ~1000px genişliğinde flex-1 çubuk, taşıdığı bilgiye göre (HAT2'nin %3'ü 30px'lik
                        bir tırnaktı) ~6 kat fazla piksel harcıyordu — sabit 160px, kazanılan alan
                        rakamlara/duruş metnine verildi (Tur 5 bulgusu, P2). <lg'de tamamen gizli. */}
                    <Progress value={pct} className="hidden h-1.5 w-40 shrink-0 lg:block" />
                    {/* Üretilen/hedef ve yüzde iki ayrı sabit genişlikli, tabular-nums (`num`) sütuna
                        ayrıldı — tek metin akışında hatlar arası ondalık/binlik ayraçlar aynı x
                        koordinatına düşmüyordu, göz her satırda yeniden hizalanıyordu (Tur 5 bulgusu,
                        P1). */}
                    <span className="num w-20 shrink-0 text-right text-[11px] text-muted-foreground sm:w-28 sm:text-xs">
                      {formatQty(produced.toFixed(4), undefined, { maxDigits: 0 })} / {formatQty(target.toFixed(4), undefined, { maxDigits: 0 })}
                    </span>
                    <span className="num w-9 shrink-0 text-right text-[11px] text-muted-foreground sm:text-xs">%{Math.round(pct)}</span>
                    <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-[11px] text-muted-foreground sm:text-xs">
                      {summary?.lastDowntime ? (
                        <>
                          <OctagonPause className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">
                            {DOWNTIME_REASON_LABELS[summary.lastDowntime.reason] ?? summary.lastDowntime.reason} · {summary.lastDowntime.minutes} dk · {formatTime(summary.lastDowntime.startedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="truncate">Bugün duruş yok</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
