import type { Metadata } from 'next';
import Link from 'next/link';
import { Factory, CalendarClock, CheckSquare, ArrowRight, Wallet } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LotBadge } from '@/components/lot-badge';
import { MoneyCell } from '@/components/money-cell';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDateLong } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getCockpitApprovals, getCockpitExpiringLots, getCockpitKpis, getCockpitLineCards, getCockpitReceivablesToday, getCockpitToday } from '@/modules/kokpit/queries';

export const metadata: Metadata = { title: 'Kokpit' };
export const dynamic = 'force-dynamic';

function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          // max-md:min-h-11: mobil dokunma hedefi 44px altındaydı (16px metin yüksekliği) — header
          // zaten h-11 (44px) sabit, bağlantı kendi kutusunu doldurup tam o yüksekliğe çıkar.
          <Link href={href} className="inline-flex items-center gap-1 max-md:min-h-11 text-xs text-muted-foreground hover:text-foreground">
            Tümü <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Saate göre selamlama — akşam saatlerinde "Günaydın" göstermemek için (Europe/Istanbul). */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour < 6) return 'İyi geceler';
  if (hour < 11) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export default async function CockpitPage() {
  const user = await requirePermission('cockpit.view');
  const first = user.fullName.split(' ')[0];
  // "Sistem Yöneticisi" gibi rol adları ilk kelimeye kesilince "İYİ GÜNLER, SİSTEM" — insan adı
  // değil, ham hesap adı gibi okunuyordu (Tur 5 P2 bulgusu). Adsız bir selamlama, yanlış bir isimden iyidir.
  const eyebrow = first && first.toLocaleLowerCase('tr-TR') !== 'sistem' ? `${greeting()}, ${first}` : greeting();

  const [kpis, today, expiring, approvals, receivables, lines] = await Promise.all([
    getCockpitKpis(),
    getCockpitToday(),
    getCockpitExpiringLots(),
    getCockpitApprovals(),
    getCockpitReceivablesToday(),
    getCockpitLineCards(),
  ]);

  // Dördü de aynı kart anatomisini paylaşır (sparkline yok). Dördü de artık "dünden" deltası taşır
  // (Tur 5 P1 bulgusu — önceden yalnızca "Bugünkü ciro" karşılaştırmalıydı, diğer üçü hep boş yer
  // tutucuydu; tek karşılaştırmalı kart "yarım kokpit" hissi veriyordu). Üçü `getCockpitKpis` içinde
  // MEVCUT tablolardaki gerçek iş tarihleriyle (orderDate/invoiceDate/moved_at <= dün) geriye dönük
  // türetilir — bu üçü BİRBİRİYLE aynı temeli (dün aynı saatteki gerçek durum) paylaştığından
  // /satis/net-ciro'daki "hepsi ya da hiçbiri" kuralı burada uygulanmaz: her KPI kendi payda/bölen
  // durumuna göre bağımsız değerlendirilir (`deltaPct`: bölen sıfırsa `null`). "Bugünkü ciro" ayrı bir
  // temel kullanır (postedAt — muhasebe kayıt anı, `getCockpitToday` listesiyle birebir aynı filtre,
  // Tur 2 bulgusu) ve dün hiç fatura kesilmemişse (revenueDeltaPct === null) kendi başına `undefined`
  // düşer; bu üçünü etkilemez — dördü FARKLI ölçümler, birinin payda sorunuyla diğer üçünü de
  // susturmak "hepsi ya da hiçbiri" kuralının yanlış uygulanışı olurdu (o kural yalnızca AYNI
  // karşılaştırma tabanını paylaşan bir KPI şeridi için anlamlıdır, bkz. net-ciro).
  // İkon alanı tamamen kaldırıldı (Tur 4 P1 bulgusu): Banknote/ShoppingCart/AlertTriangle/Clock
  // hiçbir bilgi taşımıyordu, başlıktaki metni birebir tekrarlıyordu ("ikon süs değildir" ihlali) —
  // ayrıca `variant="card"` (1px çerçeve + 133px yükseklik) /satis/net-ciro'nun `variant="strip"`
  // (kutusuz, ikonsuz, hairline'lı, 80px) anatomisiyle çelişiyordu; ürünün tek bir finans ekranı
  // dili konuşması için burada da strip kullanılıyor.
  const KPIS: Array<{ title: string; value: number | string; format: 'money' | 'int'; delta?: number | null; deltaLabel?: string; invertDelta?: boolean; href: string; hint?: string }> = [
    { title: 'Bugünkü ciro', value: kpis.revenueToday, format: 'money', delta: kpis.revenueDeltaPct ?? undefined, deltaLabel: 'dünden', href: '/satis/net-ciro' },
    { title: 'Açık siparişler', value: kpis.openOrders, format: 'int', delta: kpis.openOrdersDeltaPct ?? undefined, deltaLabel: 'dünden', href: '/satis/siparisler', hint: kpis.readyToShip > 0 ? `${kpis.readyToShip} sevkiyata hazır` : undefined },
    { title: 'Kritik stok kalemi', value: kpis.criticalStockCount, format: 'int', delta: kpis.criticalStockDeltaPct ?? undefined, deltaLabel: 'dünden', invertDelta: true, href: '/satin-alma/kritik-stok' },
    { title: 'Vadesi geçen alacak', value: kpis.overdueReceivable, format: 'money', delta: kpis.overdueReceivableDeltaPct ?? undefined, deltaLabel: 'dünden', invertDelta: true, href: '/finans/tahsilat' },
  ];

  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Kokpit" description={`${formatDateLong(new Date())} · Tire tesisi özeti`} />

      {/* KpiStripRow + variant="strip": /satis/net-ciro ile aynı KPI dili (kutusuz, ikonsuz, dikey
          hairline, sabit 80px/72px) — önceki `variant="card"` grid'i (260×133px, çerçeveli, dekoratif
          ikonlu) kaldırıldı; kazanılan dikey alan masaüstünde ~53px, mobilde şerit yatay kaydırılır
          (Tur 4 P1 bulgusu). */}
      <KpiStripRow>
        {KPIS.map((k) => (
          <KpiCard
            key={k.title}
            title={k.title}
            value={k.value}
            format={k.format}
            delta={k.delta}
            deltaLabel={k.deltaLabel}
            invertDelta={k.invertDelta}
            href={k.href}
            hint={k.hint}
            variant="strip"
          />
        ))}
      </KpiStripRow>

      {/* İki bağımsız dikey akış (grid yerine flex sütun) — CSS grid'in örtük satır hizalaması
          "Bugün + SKT" (2 kart) ile "Onay kuyruğu + Üretim + Bugünün tahsilatları" (3 kart)
          sütunlarını aynı satırlara zorluyor, üçüncü kart tek başına yeni bir grid satırı açıp
          karşı sütunda ~700×1050px boş bir hücre bırakıyordu (Tur 2 bulgusu). Flex sütunlarda her
          taraf yalnızca kendi içeriği kadar yükseklik kaplar, boş hücre oluşmaz. */}
      {/* min-w-0 (Tur 10 P0 shell-kokpit-overflow-01): grid item'ların varsayılan min-width:auto'su
          çocukların min-content genişliğini (uzun para/durum metinleri) track'e dayatıyordu — 390px'te
          her <section> 394px'e (viewport dışına 22px) çıkıp app-shell'in overflow-x-clip'i bunu
          sessizce KIRPIYOR, kaydırarak da erişilemiyordu (₺ tutarları/durum rozetleri/"Tümü" bağlantıları
          harf ortasından kesiliyordu). min-w-0 grid item'ın kendi içeriğine göre değil, track genişliğine
          göre küçülmesine izin verir — DataTable'ın kendi yatay kaydırma sarmalayıcıları zaten var,
          burada gerçek çözüm taşmayı normal responsive akışa (truncate/wrap) bırakmaktır. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 flex flex-col gap-4 lg:col-span-2">
        <Section title="Bugün" href="/satis/siparisler">
          {today.length === 0 ? (
            <EmptyState compact title="Bugün henüz belge yok" description="Sevkiyat, iş emri, mal kabul veya fatura oluştuğunda burada görünür." />
          ) : (
            <ul className="divide-y divide-border/50">
              {today.map((t) => (
                <li key={`${t.k}-${t.no}`} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <span className="shrink-0 text-xs text-muted-foreground sm:w-20">{t.kind}</span>
                      {/* max-sm:min-h-11: mobilde (satır flex-col, sm altı) bağlantının kendi kutusu
                          yalnızca 16px'lik metin satırıydı — dokunma hedefi 44px'in altındaydı. */}
                      <Link href={t.href} className="inline-flex items-center truncate font-mono text-xs hover:underline max-sm:min-h-11 sm:w-36 sm:shrink-0">{t.no}</Link>
                    </span>
                    <span className="shrink-0 sm:order-last">
                      <StatusBadge status={t.status} kind={t.k} />
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="min-w-0 flex-1 truncate">{t.partner}</span>
                    <span className="shrink-0">{t.amount !== undefined ? <MoneyCell value={t.amount} /> : <QtyCell value={t.qty} uom={t.uom} />}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="SKT yaklaşan lotlar" href="/depo/skt">
          {expiring.length === 0 ? (
            <EmptyState compact title="Yaklaşan SKT yok" description="Serbest, elde miktarı olan lotlardan SKT'si en yakın olanlar burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {expiring.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 text-[13px] sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:py-0">
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="flex min-w-0 items-center gap-2 sm:contents">
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <LotBadge lotNo={e.lotNo} status="released" />
                    </span>
                    <span className="shrink-0 sm:order-last">
                      <ExpiryBadge date={new Date(`${e.expiryDate}T00:00:00Z`)} showDate={false} />
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                    <span className="min-w-0 flex-1 truncate">{e.product}</span>
                    <QtyCell value={e.qty} uom={e.uom} className="shrink-0" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
        {approvals.length === 0 && receivables.length === 0 ? (
          // Onay kuyruğu VE Bugünün tahsilatları AYNI ANDA boşsa iki ayrı boş-durum kartı alt alta
          // gelip sağ rayın (~900px) neredeyse tamamını "1 birim bilgi" ile dolduruyordu (Tur 5 P2
          // bulgusu) — tek bir 72px'lik özet satırında birleştirilir, dolu bölüme (Üretim) dikey alan açılır.
          <div className="flex h-[72px] shrink-0 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 text-[13px]">
            <span className="shrink-0 text-muted-foreground">2 bölüm boş</span>
            <span className="flex shrink-0 items-center gap-3">
              <Link href="/satin-alma/onay-kuyrugu" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Onay kuyruğu <ArrowRight className="size-3" />
              </Link>
              <Link href="/finans/tahsilat" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Tahsilatlar <ArrowRight className="size-3" />
              </Link>
            </span>
          </div>
        ) : (
        <Section title="Onay kuyruğu" href="/satin-alma/onay-kuyrugu">
          {approvals.length === 0 ? (
            <EmptyState compact title="Onay bekleyen öğe yok" description="AI taslakları ve mutabakat önerileri burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {approvals.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                  <CheckSquare className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    {/* max-md:min-h-11: kısa (tek satır) başlıklarda bağlantı kutusu 44px altındaydı. */}
                    <Link href={a.href} className="line-clamp-2 hover:underline block max-md:min-h-11">{a.title}</Link>
                    {a.confidence !== null ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">AI güveni %{Math.round(a.confidence * 100)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        )}

        <Section title="Üretim" href="/uretim/is-emirleri">
          <div className="space-y-3 p-4 text-[13px]">
            {lines.map((l) => {
              const planned = Number(l.activeWorkOrder?.plannedQty ?? 0);
              const produced = Number(l.activeWorkOrder?.producedQty ?? 0);
              const pct = l.activeWorkOrder && planned > 0 ? Math.min(100, Math.round((produced / planned) * 100)) : 0;
              return (
                <div key={l.id}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Factory className="size-4 text-muted-foreground" strokeWidth={1.75} /> {l.name}
                    </span>
                    {/* Boşta hat: aynı rozet dili (StatusBadge, "Üretimde" ile aynı anatomi) — düz gri
                        metin iki farklı gösterim dili yaratıyordu (Tur 3 bulgusu). İlerleme çubuğu ve
                        "%0" da hatta iş emri yokken hiç render edilmez — hep boş/dolmayan bir çubuk
                        render hatası gibi okunuyordu; gerçekten aktif olan hatlarda ilerleme kalır. */}
                    {l.activeWorkOrder ? <StatusBadge status={l.activeWorkOrder.status} kind="work_order" /> : <StatusBadge status="idle" label="Boşta" tone="muted" />}
                  </div>
                  {l.activeWorkOrder && pct > 0 ? (
                    <>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                        <span className="font-mono">{l.activeWorkOrder.docNo}</span>
                        <span className="tabular-nums">%{pct}</span>
                      </div>
                    </>
                  ) : l.activeWorkOrder ? (
                    // pct === 0: tam genişlikte boş bir çubuk ("Toz Karıştırma & Dolum" ile WO no
                    // arasında bir AYRAÇ sanılıyordu, Tur 5 P2 bulgusu) — henüz üretim başlamamış bir
                    // iş emri için çubuk hiç çizilmez, yalnızca metin satırı kalır.
                    <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                      <span className="font-mono">{l.activeWorkOrder.docNo}</span>
                      <span className="tabular-nums">%{pct}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>

        {approvals.length === 0 && receivables.length === 0 ? null : (
        <Section title="Bugünün tahsilatları" href="/finans/tahsilat">
          {receivables.length === 0 ? (
            <EmptyState compact title="Bugün tahsilat yok" description="Bugün alınan tahsilatlar burada listelenir." />
          ) : (
            <ul className="divide-y divide-border/50">
              {receivables.map((r) => (
                <li key={r.id} className="flex h-11 items-center justify-between gap-3 px-4 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Wallet className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="min-w-0 truncate">{r.partnerName}</span>
                  </span>
                  <MoneyCell value={r.amount} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Section>
        )}
        </div>
      </div>
    </>
  );
}
