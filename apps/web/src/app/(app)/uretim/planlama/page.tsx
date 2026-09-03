import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { listPlanningWorkOrders, listLineOptions } from '@/modules/production/queries';
import { PlanningBoard } from '@/modules/production/components/planning-board';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { businessDate, addDays } from '@plantero/core/dates';

export const metadata: Metadata = { title: 'Üretim Planlama' };
export const dynamic = 'force-dynamic';

/** Verilen (`YYYY-MM-DD`) günün ait olduğu haftanın Pazartesi'si — takvim aritmetiği, UTC gün kayması yok. */
function mondayOf(dateIso: string): string {
  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay(); // 0=Pazar
  return addDays(dateIso, -((dow + 6) % 7));
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ hafta?: string; gorunum?: string }> }) {
  await requirePermission('production.plan');
  const { hafta, gorunum } = await searchParams;
  // Europe/Istanbul takvim gününe göre "bugün" — eskisi `getUTCDay()/toISOString()` kullanıyordu:
  // UTC+3'te 21:00'den sonra (Istanbul'da hâlâ aynı gün, UTC'de zaten ertesi gün) hafta bir gün erken
  // dönüyordu (I bkz. rapor). `businessDate` bu dönüşümü doğru yapar.
  const todayIso = businessDate(new Date());
  const requestedMonday = hafta && /^\d{4}-\d{2}-\d{2}$/.test(hafta) ? mondayOf(hafta) : mondayOf(todayIso);
  const startIso = requestedMonday;
  // Varsayılan 7 gün: 14 günlük ızgara (110px + 14×84px + 92px = 1378px) 1440px masaüstünde içerik
  // alanına (~1096px) hiçbir zaman sığmıyordu (Tur 2 bulgusu) — "14 gün" görünümü isteğe bağlı, dar
  // sütunlarla (bkz. PlanningBoard) açılır.
  const days = gorunum === '14' ? 14 : 7;
  const endIso = addDays(startIso, days - 1);

  const [workOrders, lines] = await Promise.all([listPlanningWorkOrders(startIso, endIso), listLineOptions()]);

  const thisWeekMonday = mondayOf(todayIso);
  const viewSuffix = gorunum === '14' ? '&gorunum=14' : '';
  const prevWeekHref = `/uretim/planlama?hafta=${addDays(startIso, -7)}${viewSuffix}`;
  const nextWeekHref = `/uretim/planlama?hafta=${addDays(startIso, 7)}${viewSuffix}`;
  const todayHref = gorunum === '14' ? '/uretim/planlama?gorunum=14' : '/uretim/planlama';
  const isThisWeek = startIso === thisWeekMonday;

  return (
    <>
      <PageHeader
        // Mobilde üst çubuk zaten "Planlama" kırıntısını taşıyor — aynı desen (Tur 5 bulgusu, P2).
        title={<span className="max-md:sr-only">Üretim Planlama</span>}
        // Sürükle-bırak yalnızca masaüstü ızgarada çalışır (mobil görünüm, aşağıda, salt okunur gün
        // listesi) — koşulsuz "Kartı sürükleyerek…" talimatı 390px'teki kullanıcıya cihazında
        // uygulayamayacağı bir eylem söylüyordu (Tur 5 bulgusu, P1).
        description={
          <>
            <span className="max-md:hidden">Kartı sürükleyerek hat/gün değiştirin.</span>
            <span className="md:hidden">Gün gün planlanan iş emirleri.</span>
          </>
        }
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-11 w-11 md:h-9 md:w-9" asChild aria-label="Önceki hafta">
              <Link href={prevWeekHref}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className={cn('h-11 md:h-9', isThisWeek && 'pointer-events-none opacity-50')} asChild>
              <Link href={todayHref} aria-disabled={isThisWeek}>
                Bugün
              </Link>
            </Button>
            <Button variant="outline" size="icon" className="h-11 w-11 md:h-9 md:w-9" asChild aria-label="Sonraki hafta">
              <Link href={nextWeekHref}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {/* 7 gün / 14 gün görünüm seçici — ızgara genişliğini kullanıcı bilinçli olarak açar.
                h-10 → h-11: 40px, dokunma hedefi eşiği 44px'in altındaydı — aynı satırdaki ok
                butonları ve "Bugün" zaten h-11 kullanıyordu, yalnızca bu segment kontrolü dışarıda
                kalmıştı (Tur 10 bulgusu, P1). Masaüstünde md:h-7 korunur. */}
            <div className="ml-1 flex items-center rounded-md border border-border/70 p-0.5">
              <Link
                href={`/uretim/planlama?hafta=${startIso}`}
                className={cn('flex h-11 items-center rounded px-2.5 text-xs font-medium md:h-7', days === 7 ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                7 gün
              </Link>
              <Link
                href={`/uretim/planlama?hafta=${startIso}&gorunum=14`}
                className={cn('flex h-11 items-center rounded px-2.5 text-xs font-medium md:h-7', days === 14 ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                14 gün
              </Link>
            </div>
          </div>
        }
      />
      {lines.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Üretim hattı tanımlı değil" />
      ) : (
        <PlanningBoard lines={lines} workOrders={workOrders} startIso={startIso} todayIso={todayIso} days={days} />
      )}
    </>
  );
}
