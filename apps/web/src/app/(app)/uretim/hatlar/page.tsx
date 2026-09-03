import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listLineCards } from '@/modules/production/queries';
import { LineCards } from '@/modules/production/components/line-cards';
import { PageHeader } from '@/components/page-header';
import { D } from '@plantero/core';

export const metadata: Metadata = { title: 'Üretim Hatları' };
export const dynamic = 'force-dynamic';

export default async function ProductionLinesPage() {
  await requirePermission('production.view');
  const lines = await listLineCards();

  // Açıklama kartların altındaki hat adlarını kelimesi kelimesine tekrar etmesin diye gerçek bir özet
  // hesaplanır. Bugünkü üretim miktarını hatlar arası toplamamıza dikkat edilir: hatlar farklı birim
  // (KG/ADET) üretebildiğinden ham toplam yanlış olurdu — bunun yerine birimsiz "doluluk %" ortalanır.
  const runningCount = lines.filter((l) => l.activeWorkOrder?.status === 'in_progress').length;
  const fillPcts = lines
    .map((l) => (l.capacityPerHour && D(l.capacityPerHour).mul(l.shiftMinutes).gt(0) ? D(l.todayProducedQty).div(D(l.capacityPerHour).mul(l.shiftMinutes).div(60)).mul(100) : null))
    .filter((v): v is NonNullable<typeof v> => v !== null);
  const avgFillPct = fillPcts.length ? Math.round(fillPcts.reduce((a, v) => a.plus(v), D(0)).div(fillPcts.length).toNumber()) : null;
  const description = `${lines.length} hat · ${runningCount} çalışıyor${avgFillPct !== null ? ` · ort. doluluk %${avgFillPct}` : ''}`;

  return (
    <>
      {/* Mobilde üst çubuk zaten "Hatlar" kırıntısını taşıyor — H1 aynı sayfa başlığını tekrar
          ediyordu (Tur 5 bulgusu, P2, is-emirleri/page.tsx ile aynı desen). sr-only: ekran okuyucu
          için kalır, açıklama satırı görsel başlığın yerini alır. */}
      <PageHeader title={<span className="max-md:sr-only">Üretim Hatları</span>} description={description} />
      <LineCards lines={lines} />
    </>
  );
}
