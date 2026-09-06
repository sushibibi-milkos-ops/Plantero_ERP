import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { formatDateLong } from '@/lib/format';
import { getCockpitDashboard, getCockpitPaymentsToday, getCockpitToday } from '@/modules/kokpit/queries';
import { GmDashboardView } from '@/modules/kokpit/components/gm-dashboard';
import { DepoDashboardView } from '@/modules/kokpit/components/depo-dashboard';
import { ProductionChiefDashboardView } from '@/modules/kokpit/components/production-chief-dashboard';
import { FinanceDashboardView } from '@/modules/kokpit/components/finance-dashboard';
import { SalesDashboardView } from '@/modules/kokpit/components/sales-dashboard';
import { QualityDashboardView } from '@/modules/kokpit/components/quality-dashboard';
import { MaintenanceDashboardView } from '@/modules/kokpit/components/maintenance-dashboard';

export const metadata: Metadata = { title: 'Kokpit' };
export const dynamic = 'force-dynamic';

/** Saate göre selamlama — akşam saatlerinde "Günaydın" göstermemek için (Europe/Istanbul). */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 6) return 'İyi geceler';
  if (hour < 11) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

const ROLE_DESCRIPTION: Record<string, string> = {
  gm: 'Genel Müdür / Admin özeti',
  depo: 'Depo özeti',
  uretim_sefi: 'Üretim şefi özeti',
  finans: 'Muhasebe / Finans özeti',
  satis: 'Satış özeti',
  kalite: 'Kalite özeti',
  bakim: 'Bakım özeti',
};

export default async function CockpitPage() {
  const user = await requirePermission('cockpit.view');
  const first = user.fullName.split(' ')[0];
  // "Sistem Yöneticisi" gibi rol adları ilk kelimeye kesilince "İYİ GÜNLER, SİSTEM" — insan adı
  // değil, ham hesap adı gibi okunuyordu. Adsız bir selamlama, yanlış bir isimden iyidir.
  const eyebrow = first && first.toLocaleLowerCase('tr-TR') !== 'sistem' ? `${greeting()}, ${first}` : greeting();

  const dashboard = await getCockpitDashboard(user.roles);
  // "Bugün" belge akışı GM'de tam, depoda kendi belge türüne (mal kabul+sevkiyat) filtrelenmiş halde
  // gösterilir — aynı önbelleklenmiş sorgu, farklı kesit. Üretim şefinde YOK: bu liste "bugün
  // oluşturulan/güncellenen" belgelere göre en-yeni-8'e kırpılır — iş emirleri ise kasıtlı olarak
  // "bugün" değil "şu an aktif" mantığıyla seçilir (bir iş emri günler önce başlamış olabilir), bu
  // yüzden yoğun bir mal kabul/fatura/sevkiyat gününde 8'lik kırpmadan hep dışarıda kalabilir —
  // "Hat durumu" zaten her hattın güncel iş emrini eksiksiz gösteriyor, bu yanıltıcı ikinci (çoğu
  // zaman yanlışlıkla boş görünen) listeyi gereksiz kılıyor.
  const needsToday = dashboard.role === 'gm' || dashboard.role === 'depo';
  const [today, paymentsToday] = await Promise.all([
    needsToday ? getCockpitToday() : Promise.resolve([]),
    dashboard.role === 'finans' ? getCockpitPaymentsToday() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Kokpit" description={`${formatDateLong(new Date())} · Tire tesisi · ${ROLE_DESCRIPTION[dashboard.role]}`} />

      {dashboard.role === 'gm' ? <GmDashboardView data={dashboard.data} today={today.slice(0, 8)} /> : null}
      {dashboard.role === 'depo' ? <DepoDashboardView data={dashboard.data} today={today.filter((t) => t.k === 'receipt' || t.k === 'delivery').slice(0, 10)} /> : null}
      {dashboard.role === 'uretim_sefi' ? <ProductionChiefDashboardView data={dashboard.data} /> : null}
      {dashboard.role === 'finans' ? <FinanceDashboardView data={dashboard.data} paymentsToday={paymentsToday} /> : null}
      {dashboard.role === 'satis' ? <SalesDashboardView data={dashboard.data} /> : null}
      {dashboard.role === 'kalite' ? <QualityDashboardView data={dashboard.data} /> : null}
      {dashboard.role === 'bakim' ? <MaintenanceDashboardView data={dashboard.data} /> : null}
    </>
  );
}
