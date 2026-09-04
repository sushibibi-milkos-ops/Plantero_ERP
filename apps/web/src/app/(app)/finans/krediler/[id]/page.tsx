import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { formatDate } from '@/lib/format';
import { getLoan, listLoanInstallments } from '@/modules/finance/loans-queries';
import { formatPctFixed } from '@/modules/finance/format';
import { LoanInstallmentsTable, RateUpdateDialog } from '@/modules/finance/components/loan-panel';

export const metadata: Metadata = { title: 'Kredi Detayı' };
export const dynamic = 'force-dynamic';

/**
 * Modül sözleşmesi (`docs/modules/finans.md` §4) "kredi detayı (amortisman tablosu; değişken faizli
 * için faiz oranı güncelleme → yeniden hesap)" ekranını ister — Tur 1'de route hiç yoktu (404,
 * finans-krediler-detay-01, P1). Kart listesindeki kod rozetiyle aynı `L#` eşlemesi burada da
 * kullanılır; oran güncelleme diyaloğu `LoanCards` ile PAYLAŞILIR (tek kaynak, iki giriş noktası).
 */
export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission('finance.view');
  const [loan, installments] = await Promise.all([getLoan(id), listLoanInstallments(id)]);
  if (!loan) notFound();

  const canEdit = userCan(user, 'finance.manage');
  const paidCount = installments.filter((i) => i.status === 'paid').length;

  return (
    <>
      <div className="mb-3">
        {/* Kriter 9 kök neden düzeltmesi (Tur 3, P1 finans-krediler-detay-02): geri bağlantısı 64x16px
            — 44px dokunma hedefinin çok altında. `-my-4 py-4` dokunma alanını görsel boyutu
            değiştirmeden büyütür (py-3/40px yetersiz kaldığı için py-4/48px'e çıkarıldı). */}
        <Link href="/finans/krediler" className="-my-4 inline-flex items-center gap-1.5 py-4 text-[11px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Krediler
        </Link>
      </div>
      <PageHeader
        eyebrow={loan.code}
        title={loan.bankName}
        description={`${loan.productName} · ${loan.rateKind === 'variable' ? 'Değişken faiz' : 'Sabit faiz'} · açılış ${formatDate(loan.openedAt)}`}
        actions={canEdit && loan.rateKind === 'variable' ? <RateUpdateDialog loanId={loan.id} loanCode={loan.code} currentRate={loan.monthlyRatePct} /> : null}
      />

      <KpiStripRow>
        {/* Tur 7 P2 kök neden düzeltmesi: statik I34(c) referansı (remainingPrincipal) yerine
            canlı bakiye (outstandingPrincipal, tek SUM sorgusu — bkz. loans-queries.ts) gösterilir. */}
        <KpiCard variant="strip" title="Kalan anapara" value={loan.outstandingPrincipal} format="money" />
        <KpiCard variant="strip" title="Aylık taksit" value={loan.monthlyInstallment} format="money" />
        {/* Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-krediler-detay-05): iki kart birebir
            aynı yardımcı metni ("N taksit toplam") basıyordu — Ödenen taksit kartı artık tamamlanma
            yüzdesini gösterir, ayırt edici bilgi taşır. */}
        <KpiCard variant="strip" title="Kalan taksit" value={loan.remainingInstallments} format="int" hint={`${installments.length} taksit toplam`} />
        <KpiCard variant="strip" title="Ödenen taksit" value={paidCount} format="int" hint={installments.length > 0 ? `takvimin %${Math.round((paidCount / installments.length) * 100)}'i` : '—'} />
      </KpiStripRow>

      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold">Amortisman takvimi</div>
        <div className="text-[11px] text-muted-foreground">Aylık faiz: <span className="font-mono tabular-nums text-foreground">{formatPctFixed(loan.monthlyRatePct)}</span></div>
      </div>
      <LoanInstallmentsTable installments={installments} />
    </>
  );
}
