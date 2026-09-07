import Link from 'next/link';
import type { FinanceCards } from '@plantero/core/cockpit/kpis';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { CockpitReceipt } from '../queries';
import { Section, DashboardGrid, StatStrip, AgingStrip, OverdueTop5List, BreakEvenPanel, BankAccountsList, RowLink } from './shared';

function periodLabel(period: string): string {
  const [y, m] = period.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/** Muhasebe/Finans panosu — banka, mutabakat kuyruğu, vadesi geçen, KDV pozisyonu, 3 aylık nakit projeksiyonu, break-even. */
export function FinanceDashboardView({ data, paymentsToday }: { data: FinanceCards; paymentsToday: CockpitReceipt[] }) {
  const { bank, reconciliationQueue, reconciliationQueueItems, overdue, vat, cashProjection3m, breakEven } = data;

  return (
    <>
      <KpiStripRow>
        <KpiCard title="Banka toplamı" value={bank.totalTry} format="money" fractionDigits={0} href="/muhasebe/banka" variant="strip" />
        <KpiCard title="Vadesi geçen alacak" value={overdue.aging.totalOverdue} format="money" fractionDigits={0} invertDelta href="/finans/tahsilat-takibi" variant="strip" />
        <KpiCard title="KDV ödenecek" value={vat ? vat.payable : null} format="money" fractionDigits={0} href="/muhasebe/kdv" variant="strip" />
        {/* Kök neden (Tur 1 P1 kokpit-fin-col-balance-01 + kokpit-fin-density-01): bu sayaç önceden
            110px'lik tek satırlık bir bölüm işgal ediyordu (sol kolonun altında 246px boş alan
            bırakan tek katkı) — bir sayaç zaten KPI şeridine ait. Aşağıdaki "Mutabakat kuyruğu"
            bölümü artık bir SAYAÇ değil, bekleyen önerilerin gerçek LİSTESİ. */}
        <KpiCard title="Mutabakat kuyruğu" value={reconciliationQueue} format="int" invertDelta href="/muhasebe/mutabakat" variant="strip" />
        <KpiCard title="Break-even ilerleme" value={breakEven.progressPct} format="pct" href="/finans/break-even" variant="strip" />
      </KpiStripRow>

      <DashboardGrid>
        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Banka" href="/muhasebe/banka">
            <div className="flex h-11 items-center justify-between border-b border-border/60 px-4 text-[13px]">
              <span className="text-muted-foreground">Toplam (TRY hesaplar)</span>
              <MoneyCell value={bank.totalTry} className="font-medium" />
            </div>
            {bank.accounts.length === 0 ? (
              // Kök neden (Tur 6 P1 kokpit-depo-empty-action-04, aynı desen): boş durum yalnızca
              // ikon+başlık taşıyordu — puan kartı kriteri 7 ikon+başlık+açıklama+eylem istiyor.
              <EmptyState
                compact
                title="Banka hesabı yok"
                description="Banka hesabı tanımlandığında bakiye burada görünür."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/muhasebe/banka"><ArrowRight className="size-3.5" /> Banka hesabını yönet</Link>
                  </Button>
                }
              />
            ) : (
              <BankAccountsList accounts={bank.accounts} href="/muhasebe/banka" />
            )}
          </Section>

          <Section title="KDV pozisyonu" href="/muhasebe/kdv">
            {!vat ? (
              // Kök neden (Tur 6 P1 kokpit-depo-empty-action-04, aynı desen).
              <EmptyState
                compact
                title="Henüz KDV dönemi hesaplanmadı"
                description="Dönem kapatıldığında KDV pozisyonu burada görünür."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/muhasebe/kdv"><ArrowRight className="size-3.5" /> KDV dönemini hesapla</Link>
                  </Button>
                }
              />
            ) : (
              <StatStrip
                divider
                items={[
                  // tabular-nums (Tur 9 P2 kokpit-meta-tabular-08, kriter 6): dönem etiketi de yıl
                  // rakamını taşıyor, diğer StatStrip değerleriyle aynı rakam davranışını izlemeli.
                  { key: 'period', value: periodLabel(vat.period), label: 'Dönem', valueClassName: 'text-[13px] tabular-nums' },
                  { key: 'payable', value: formatMoney(vat.payable, 'TRY', { digits: 0 }), label: 'Ödenecek' },
                  { key: 'output', value: formatMoney(vat.outputVat, 'TRY', { digits: 0 }), label: 'Hesaplanan (391)' },
                  { key: 'input', value: formatMoney(vat.inputVat, 'TRY', { digits: 0 }), label: 'İndirilecek (191)' },
                ]}
              />
            )}
          </Section>

          <Section title="Mutabakat kuyruğu" href="/muhasebe/mutabakat">
            {/* Kök neden (Tur 4 P1 kokpit-fin-row-anatomy-01): bu satır elle yazılmış `<li className=
                "flex h-11 …">` idi — href taşımıyordu (tıklanamaz) ve 44px, aynı viewport'un sağ
                kolonundaki "Geciken alacak" (`RowLink`, 40px, tıklanabilir) ile aynı bilgi sınıfı
                olduğu halde görsel/etkileşim olarak ayırt edilemiyordu. `RowLink`'e taşındı: satır
                40px, kendi kaydına link, hover/active/focus dili diğer tüm listelerle birebir.
                Kök neden (Tur 7 P1 kokpit-fin-recon-discriminator-05): satır yalnızca ad+tutar
                taşıyordu — 8 kaydın 3'ü aynı karşı taraf+tutar olduğunda (ör. üç "Trendyol Pazaryeri
                ₺5.000,00") satırlar birbirinden AYIRT EDİLEMİYORDU, oysa satırın arkasındaki karara
                (öneriyi onayla/reddet) asıl yön veren AI güven skoru (0,15-0,90 arası) hiç
                gösterilmiyordu. Sıralama artık DB'de güven DESC (kpis.ts) — en güvenilir öneri
                başta; satıra da üçüncü alan olarak güven yüzdesi eklendi (muhasebe modülündeki
                `reconciliation-history-table.tsx`/`approval-queue.tsx` ile AYNI biçim:
                `%{Math.round(confidence*100)}`, tabular-nums, muted). Satır yüksekliği (RowLink, 40px)
                DEĞİŞMEDİ — üçüncü alan mevcut `shrink-0` grubuna eklendi, satır hâlâ tek satır. */}
            {reconciliationQueueItems.length === 0 ? (
              // Kök neden (Tur 6 P1 kokpit-depo-empty-action-04, aynı desen).
              <EmptyState
                compact
                title="Onay bekleyen öneri yok"
                description="AI mutabakat eşleştirmesi öneri ürettiğinde burada listelenir."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/muhasebe/mutabakat"><ArrowRight className="size-3.5" /> Mutabakatı aç</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {reconciliationQueueItems.map((r) => (
                  <li key={r.id}>
                    <RowLink href="/muhasebe/mutabakat">
                      <span className="min-w-0 flex-1 truncate">{r.partnerName ?? r.counterpartyName ?? r.description}</span>
                      {/* Kök neden: güven yüzdesi ilk denemede MoneyCell'den AYRI üçüncü bir doğrudan
                          çocuk olarak eklenmişti — ROW_BASE mobilde `flex-col` olduğu için bu, satırı
                          3 satıra (84,5px) çıkarıp modülün mobil bandını (56-72px) aşıyordu. `OverdueTop5List`
                          (shared.tsx) ile AYNI desen: sağdaki iki alan (güven + tutar) `sm:contents` ile
                          TEK mobil satırında gruplanır, masaüstünde düzleşip ayrı sütun olur. */}
                      <span className="flex shrink-0 items-center justify-between gap-3 sm:contents">
                        <span className="text-[11px] tabular-nums text-muted-foreground">%{Math.round(Number(r.confidence) * 100)}</span>
                        <MoneyCell value={r.amount} />
                      </span>
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <Section title="Geciken alacak" href="/finans/tahsilat-takibi">
            <AgingStrip aging={overdue.aging} />
            {overdue.top5.length === 0 ? (
              // Kök neden (Tur 6 P1 kokpit-depo-empty-action-04, aynı desen).
              <EmptyState
                compact
                title="Vadesi geçen alacak yok"
                description="Vadesi geçen fatura olduğunda burada listelenir."
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/finans/tahsilat-takibi"><ArrowRight className="size-3.5" /> Tahsilat takibini aç</Link>
                  </Button>
                }
              />
            ) : (
              <OverdueTop5List items={overdue.top5} href="/finans/tahsilat-takibi" />
            )}
          </Section>

          {/* Kök neden (Tur 3 P2 kokpit-fin-col-balance-02): "Bugünün tahsilatları" boş durumuna
              (Tur 2 kokpit-empty-action-02) açıklama+eylem eklenince kart 190→258px büyüdü ve sol
              kolonu (Banka+Mutabakat kuyruğu+KDV) sağdan 184px öne geçirdi (eşik bu rota için 120px —
              Tur 2'de belirlendi). "Mutabakat kuyruğu" (8 satıra kadar gerçek liste, ~400px) tek başına
              taşınsaydı dengeyi ters yöne aşırı kaydırırdı (denendi, terk edildi) — bunun yerine küçük
              "KDV pozisyonu" (106px) sağdan sola, "Bugünün tahsilatları" (258px) soldan sağa TAKAS
              edildi: sol artık Banka+Mutabakat kuyruğu+KDV (~758px), sağ Geciken alacak+Bugünün
              tahsilatları+Nakit+Break-even (~863px) — fark ~105px, hedef ≤120px. */}
          <Section title="Bugünün tahsilatları" href="/finans/tahsilat">
            {paymentsToday.length === 0 ? (
              // Kök neden (Tur 2 P1 kokpit-empty-action-02): boş durum yalnızca ikon+başlık taşıyordu —
              // puan kartı kriteri 7 ikon+başlık+açıklama+eylem istiyor (Tur 1'de yalnızca 2/14 boş
              // durum düzeltilmişti, bu ikisi eksik kalmıştı).
              // Kök neden (Tur 6 P2 kokpit-fin-fold-rows-01): shell `EmptyState`'in `compact` varyantı
              // `py-10` taşıyor (shell-emptystate-compact-height-01, ortak dosya — burada değiştirilmez).
              // Masaüstünde daraltılmış dikey boşluk (`className`, twMerge ile ezer); mobil DEĞİŞMEDİ.
              <EmptyState
                compact
                title="Bugün tahsilat yok"
                description="Bir tahsilat kaydedildiğinde burada görünür."
                className="sm:py-1"
                action={
                  <Button asChild variant="outline" size="sm" className="h-11 md:h-8">
                    <Link href="/finans/tahsilat/yeni"><Plus className="size-3.5" /> Tahsilat kaydet</Link>
                  </Button>
                }
              />
            ) : (
              // Kök neden (Tur 5 P1 kokpit-activity-row-anatomy-01 / P2 kokpit-fin-payments-row-h11-01):
              // bu satır Tur 4'ün "Mutabakat kuyruğu" düzeltmesinin (kokpit-fin-row-anatomy-01) DIŞINDA
              // kalmış üçüncü bir kopyaydı — elle yazılmış `li.flex.h-11` (44px, href yok), aynı ekrandaki
              // "Geciken alacak"/"Mutabakat kuyruğu" (RowLink, 40px, tıklanabilir) ile aynı bilgi sınıfı
              // olduğu halde ayırt edilemiyordu. Kayda özel bir detay rotası yok — "Mutabakat kuyruğu"
              // satırlarıyla AYNI desen: kendi bölüm rotasına (`/finans/tahsilat`) bağlanır.
              <ul className="divide-y divide-border/50">
                {paymentsToday.map((r) => (
                  <li key={r.id}>
                    <RowLink href="/finans/tahsilat">
                      <span className="min-w-0 flex-1 truncate">{r.partnerName}</span>
                      <MoneyCell value={r.amount} className="shrink-0" />
                    </RowLink>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Nakit projeksiyonu (3 ay)" href="/finans/nakit-akisi">
            {/* Kök neden (Tur 1 P1 kokpit-cash-mixed-format-01 + kokpit-cash-green-01): aynı hücrede
                iki farklı notasyon (tam basamaklı net akış + kısaltılmış "kapanış ₺33,3 B") VE üç ayın
                üçü de pozitif olduğu için hiçbir ayrım taşımayan süs yeşili kullanılıyordu. Artık ikisi
                de TAM basamaklı, renk yalnızca negatifte devreye girer (Stripe pozitif tutarı boyamaz). */}
            <StatStrip
              items={cashProjection3m.map((c) => {
                const negative = Number(c.netCashflow) < 0;
                return {
                  key: c.period,
                  top: periodLabel(c.period),
                  value: formatMoney(c.netCashflow, 'TRY', { digits: 0 }),
                  valueClassName: negative ? 'text-destructive' : undefined,
                  label: `kapanış ${formatMoney(c.closingCash, 'TRY', { digits: 0 })}`,
                };
              })}
            />
          </Section>

          <Section title="Break-even'a uzaklık" href="/finans/break-even">
            <BreakEvenPanel breakEven={breakEven} />
          </Section>
        </div>
      </DashboardGrid>
    </>
  );
}
