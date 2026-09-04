import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getDashboard, getOverdueReceivables, getRecentJournalEntries } from '@/modules/accounting/queries';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Muhasebe' };
export const dynamic = 'force-dynamic';

export default async function AccountingHomePage() {
  await requirePermission('accounting.view');
  // ≥15 veri satırı hedefi (tur 2 P1 muhasebe-ozet-01 ölçütü): vadesi geçen alacak seed'de yalnızca
  // 2 satır — dengelemek için yevmiye tarafı 13 satıra çıkarılır (toplam ≥15).
  const [d, overdue, recentEntries] = await Promise.all([getDashboard(), getOverdueReceivables(8), getRecentJournalEntries(13)]);
  const bankDiffAbs = Math.abs(Number(d.bankDiffTry));

  return (
    <>
      <PageHeader title="Muhasebe" description="Faturalar, tahsilat, banka mutabakatı, yevmiye ve KDV — tek bakışta" />

      {/* fractionDigits={2} (kritik bulgu muhasebe-ozet-03 — kök neden): şerit 0 ondalıklıydı,
          hemen altındaki iki liste (vadesi geçen alacak, son yevmiye fişleri) 2 ondalıklı
          MoneyCell kullanıyor — aynı ekranda aynı sayı iki biçimde görünüyordu (₺4.900 vs
          ₺4.900,00). KDV sayfasındaki kalıpla aynı: tüm para KPI'ları 2 ondalık. */}
      <KpiStripRow>
        <KpiCard variant="strip" title="Banka farkı (TL hesaplar)" value={d.bankDiffTry} format="money" fractionDigits={2} invertDelta href="/muhasebe/banka" />
        <KpiCard variant="strip" title="Açık alacak" value={d.openReceivable} format="money" fractionDigits={2} href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Açık borç" value={d.openPayable} format="money" fractionDigits={2} href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Vadesi geçen alacak" value={d.overdueReceivable} format="money" fractionDigits={2} invertDelta href="/muhasebe/faturalar" />
        <KpiCard variant="strip" title="Devreden KDV" value={d.vatCarriedToNext} format="money" fractionDigits={2} hint={d.vatLastPeriod ?? undefined} href="/muhasebe/kdv" />
        <KpiCard variant="strip" title="Eşleşmeyen banka hareketi" value={d.unmatchedBankCount} format="int" invertDelta href="/muhasebe/mutabakat" />
      </KpiStripRow>

      {bankDiffAbs > 0.01 || d.openClosablePeriods > 0 ? (
        <div className="mb-6 space-y-2">
          {bankDiffAbs > 0.01 ? (
            // min-h-11 (44px, tur 2 P2 muhasebe-ozet-02): banner 41.5px'te dokunma hedefi eşiğinin
            // altındaydı — bankacılık uyarısı bir alt menü bağlantısı değil, sık dokunulan bir eylem.
            <Link href="/muhasebe/banka" className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-[13px] text-[oklch(0.5_0.14_70)] transition-colors hover:bg-warning/10 dark:text-warning">
              <span>TL banka hesaplarında ekstre/defter farkı var — mutabakat gerekiyor.</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ) : null}
          {d.openClosablePeriods > 0 ? (
            <Link href="/muhasebe/donemler" className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-2.5 text-[13px] text-info transition-colors hover:bg-info/10">
              <span>{d.openClosablePeriods} geçmiş dönem henüz kapatılmadı.</span>
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Kök neden (tur 2 P1 muhasebe-ozet-01): burada 9 bağlantı kartı vardı — sol menünün Muhasebe
          alt menüsüyle bire bir aynı, hiçbir veri taşımıyordu (rows.count=0). Stripe'ın ana ekranı
          menü tekrarı değil VERİ gösterir: solda vadesi geçmiş 8 alacak, sağda son 8 yevmiye fişi —
          ikisi birlikte ilk ekranda ≥15 satır. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-medium">Vadesi geçen alacaklar</h2>
            {/* min-h-11 mobilde (kritik bulgu muhasebe-ozet-04 — kök neden): "Tümü ↗" 45x18 dokunma
                hedefi eşiğinin altındaydı; md:min-h-0 masaüstünde eski kompakt satırı korur. */}
            <Link href="/muhasebe/faturalar" className="flex min-h-11 items-center text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground md:min-h-0">Tümü ↗</Link>
          </div>
          <div className="rounded-lg border border-border/60">
            {overdue.length ? (
              <ul>
                {overdue.map((r) => (
                  <li key={r.id} className="border-b border-border/40 last:border-0">
                    {/* Mobilde 2 satırlı düzen (kritik bulgu muhasebe-ozet-04 — kök neden): tek
                        satıra sıkışan başlık span'i 152px'e düşüyordu, açıklama/cari fiilen
                        görünmüyordu. 1. satır belge no + tutar, 2. satır cari + gün sayısı —
                        DataTable mobil kart kalıbıyla aynı fikir (iki satır, ~60px). */}
                    <Link href={`/muhasebe/faturalar/${r.id}`} className="flex flex-col gap-0.5 px-3 py-2.5 text-[13px] hover:bg-accent/50 md:h-10 md:flex-row md:items-center md:justify-between md:gap-3 md:py-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono">{r.docNo}</span>
                          <span className="ml-1.5 hidden text-muted-foreground md:inline">{r.partnerName}</span>
                        </span>
                        <MoneyCell value={r.residual} currency={r.currency} className="w-24 shrink-0 md:hidden" />
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground md:hidden">
                        <span className="min-w-0 flex-1 truncate">{r.partnerName}</span>
                        <span className="shrink-0 text-[11px] font-medium text-destructive">{r.daysOverdue} gün</span>
                      </span>
                      <span className="hidden shrink-0 text-[11px] font-medium text-destructive md:inline">{r.daysOverdue} gün</span>
                      <MoneyCell value={r.residual} currency={r.currency} className="hidden w-24 shrink-0 md:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Vadesi geçen alacak yok" description="Tüm satış faturaları vadesinde." />
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-medium">Son yevmiye fişleri</h2>
            <Link href="/muhasebe/yevmiye" className="flex min-h-11 items-center text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground md:min-h-0">Tümü ↗</Link>
          </div>
          <div className="rounded-lg border border-border/60">
            {recentEntries.length ? (
              <ul>
                {recentEntries.map((e) => (
                  <li key={e.id} className="border-b border-border/40 last:border-0">
                    <Link href={`/muhasebe/yevmiye/${e.id}`} className="flex flex-col gap-0.5 px-3 py-2.5 text-[13px] hover:bg-accent/50 md:h-10 md:flex-row md:items-center md:justify-between md:gap-3 md:py-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-mono">{e.docNo}</span>
                          <span className="ml-1.5 hidden text-muted-foreground md:inline">{e.description}</span>
                        </span>
                        <MoneyCell value={e.totalDebit} className="w-24 shrink-0 md:hidden" />
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground md:hidden">
                        <span className="min-w-0 flex-1 truncate">{e.description}</span>
                        <span className="shrink-0 text-[11px]">{formatDate(e.entryDate)}</span>
                      </span>
                      <span className="hidden shrink-0 text-[11px] text-muted-foreground md:inline">{formatDate(e.entryDate)}</span>
                      <MoneyCell value={e.totalDebit} className="hidden w-24 shrink-0 md:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Henüz fiş yok" description="Kaydedilen fişler burada listelenecek." />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
