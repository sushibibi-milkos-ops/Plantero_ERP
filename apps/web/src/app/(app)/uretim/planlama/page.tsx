import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { listPlanningWorkOrders, listLineOptions } from '@/modules/production/queries';
import { PlanningBoard } from '@/modules/production/components/planning-board';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { businessDate, addDays } from '@plantero/core/dates';

export const metadata: Metadata = { title: 'Üretim Planlama' };
export const dynamic = 'force-dynamic';

/** Verilen (`YYYY-MM-DD`) günün ait olduğu haftanın Pazartesi'si — takvim aritmetiği, UTC gün kayması yok. */
function mondayOf(dateIso: string): string {
  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay(); // 0=Pazar
  return addDays(dateIso, -((dow + 6) % 7));
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ hafta?: string }> }) {
  await requirePermission('production.plan');
  const { hafta } = await searchParams;
  // Europe/Istanbul takvim gününe göre "bugün" — eskisi `getUTCDay()/toISOString()` kullanıyordu:
  // UTC+3'te 21:00'den sonra (Istanbul'da hâlâ aynı gün, UTC'de zaten ertesi gün) hafta bir gün erken
  // dönüyordu (I bkz. rapor). `businessDate` bu dönüşümü doğru yapar.
  const todayIso = businessDate(new Date());
  const requestedMonday = hafta && /^\d{4}-\d{2}-\d{2}$/.test(hafta) ? mondayOf(hafta) : mondayOf(todayIso);
  const startIso = requestedMonday;
  const endIso = addDays(startIso, 13);

  const [workOrders, lines] = await Promise.all([listPlanningWorkOrders(startIso, endIso), listLineOptions()]);

  const thisWeekMonday = mondayOf(todayIso);
  const prevWeekHref = `/uretim/planlama?hafta=${addDays(startIso, -7)}`;
  const nextWeekHref = `/uretim/planlama?hafta=${addDays(startIso, 7)}`;
  const isThisWeek = startIso === thisWeekMonday;

  return (
    <>
      <PageHeader
        title="Üretim Planlama"
        description="Kartı sürükleyerek hat/gün değiştirin."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" asChild aria-label="Önceki hafta">
              <Link href={prevWeekHref}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className={isThisWeek ? 'pointer-events-none opacity-50' : ''}>
              <Link href="/uretim/planlama" aria-disabled={isThisWeek}>
                Bugün
              </Link>
            </Button>
            <Button variant="outline" size="icon" asChild aria-label="Sonraki hafta">
              <Link href={nextWeekHref}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        }
      />
      {lines.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Üretim hattı tanımlı değil" />
      ) : (
        <PlanningBoard lines={lines} workOrders={workOrders} startIso={startIso} todayIso={todayIso} />
      )}
    </>
  );
}
