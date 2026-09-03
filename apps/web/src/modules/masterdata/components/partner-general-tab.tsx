'use client';

import { useMemo } from 'react';
import Decimal from 'decimal.js';
import { ArrowDownRight, ArrowUpRight, MapPin, Minus, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';
import type { StatusTone } from '@/lib/status';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import { formatDate } from '@/lib/format';
import { formatPctFixed } from '../format-pct';
import { PAYMENT_TERM_LABELS } from '../product-labels';
import type { getPartnerById, PartnerDocRow } from '../queries';
import type { AddressRow } from './partner-addresses-tab';
import type { ContactRow } from './partner-contacts-tab';

const OPEN_ORDER_STATUSES = new Set(['draft', 'sent', 'accepted', 'confirmed', 'partially_delivered', 'partially_invoiced']);
const OPEN_INVOICE_STATUSES = new Set(['draft', 'sent', 'partially_paid', 'pending']);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Önceki döneme göre yüzde değişim — önceki dönem sıfırsa (yeni aktivite) %100 kabul edilir, ikisi de
    sıfırsa `null` (delta chip'i "—" gösterir, KpiCard bunu zaten destekler). */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

/** Adresler/Kişiler sekmelerinin varsayılan kaydını Genel sekmesinde küçük bir özet olarak gösterir —
    kullanıcı sekme değiştirmeden cariyi tanır (Tur 5 P1 bulgusu: sayfanın %58'i boştu). Salt okunur
    önizleme; ekleme/düzenleme kendi sekmelerinde kalır. */
function AddressSummary({ addresses }: { addresses: AddressRow[] }) {
  const a = addresses.find((x) => x.isDefault) ?? addresses[0] ?? null;
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <MapPin className="size-3" /> Adres
      </div>
      {a ? (
        <p className="mt-1 text-[13px]">
          {a.line1}
          {a.district ? `, ${a.district}` : ''}
          {a.city ? ` / ${a.city}` : ''}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">Kayıtlı adres yok — Adresler sekmesinden ekleyin.</p>
      )}
      {addresses.length > 1 ? <p className="mt-0.5 text-[12px] text-muted-foreground">+{addresses.length - 1} adres daha</p> : null}
    </div>
  );
}

function ContactSummary({ contacts }: { contacts: ContactRow[] }) {
  const c = contacts.find((x) => x.isPrimary) ?? contacts[0] ?? null;
  return (
    <div className="rounded-lg border border-border/70 bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <User className="size-3" /> Yetkili kişi
      </div>
      {c ? (
        <p className="mt-1 text-[13px]">
          <span className="font-medium">{c.fullName}</span>
          {[c.title, c.phone].some(Boolean) ? <span className="ml-1.5 text-muted-foreground">{[c.title, c.phone].filter(Boolean).join(' · ')}</span> : null}
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">Kayıtlı kişi yok — Kişiler sekmesinden ekleyin.</p>
      )}
      {contacts.length > 1 ? <p className="mt-0.5 text-[12px] text-muted-foreground">+{contacts.length - 1} kişi daha</p> : null}
    </div>
  );
}

export function PartnerGeneralTab({
  partner,
  channelName,
  lastOrder,
  orders,
  invoices,
  payments,
  addresses,
  contacts,
}: {
  partner: NonNullable<Awaited<ReturnType<typeof getPartnerById>>>;
  channelName: string | null;
  lastOrder: PartnerDocRow | null;
  orders: PartnerDocRow[];
  invoices: PartnerDocRow[];
  payments: PartnerDocRow[];
  addresses: AddressRow[];
  contacts: ContactRow[];
}) {
  const openOrdersCount = useMemo(() => orders.filter((o) => OPEN_ORDER_STATUSES.has(o.status)).length, [orders]);

  const openInvoiceTotal = useMemo(
    () => invoices.filter((i) => OPEN_INVOICE_STATUSES.has(i.status)).reduce((acc, i) => acc.plus(new Decimal(i.amount || '0')), new Decimal(0)),
    [invoices],
  );

  const creditUsagePct = useMemo(() => {
    const limit = new Decimal(partner.creditLimit || '0');
    if (limit.isZero()) return null;
    const balance = new Decimal(partner.balance || '0');
    return balance.div(limit).mul(100).toFixed(1);
  }, [partner.creditLimit, partner.balance]);

  // Tur 5 P1 bulgusu: KPI şeridinde hiçbir karşılaştırma deltası yoktu (Stripe finans şeritleri her
  // zaman "son 30 gün / önceki 30 gün" gibi bir trend taşır). "Açık sipariş" sayısı için en yakın
  // anlamlı yaklaşıklık, belge TARİHİNE göre son 30 gün içinde açılan sipariş SAYISINI bir önceki 30
  // günle karşılaştırmaktır (durum anlık "açık" olsa da, trend olarak aktivite yönünü gösterir).
  //
  // Tur 9/10 P1 bulgusu: "Açık fatura tutarı" için aynı yaklaşıklık YANLIŞ sonuç veriyordu — KPI değeri
  // AÇIK (ödenmemiş) fatura toplamı iken delta, son 30 gündeki TÜM fatura tutarını (ödenmiş dahil) bir
  // önceki 30 günle kıyaslıyordu; iki sayı farklı metrikti. S-000005 gibi bir cari faturasını tahsil
  // ettiğinde açık toplam 0'a düşüyor ama delta yine de +%100 basıyordu — sıfırın yanında yeşil artış
  // rozeti yanıltıcıydı. Açık fatura toplamının kendi geçmiş anlık değeri (30 gün önceki "açık" durumu)
  // olay bazlı durum geçmişi olmadan hesaplanamaz — o yüzden bu KPI için delta HİÇ hesaplanmıyor/
  // basılmıyor (aşağıda `openInvoiceTotal` KPI'ına `delta` prop'u verilmiyor). Bakiye tek bir anlık
  // değerdir, doğal bir "önceki dönem"i yoktur — delta yerine tonuyla (borç/alacak) bırakılır.
  const orderDelta = useMemo(() => {
    const now = Date.now();
    const cutoff30 = now - 30 * DAY_MS;
    const cutoff60 = now - 60 * DAY_MS;
    const inWindow = (dateStr: string, from: number, to: number) => {
      const t = new Date(dateStr).getTime();
      return Number.isFinite(t) && t >= from && t < to;
    };

    const ordersLast30 = orders.filter((o) => inWindow(o.date, cutoff30, now)).length;
    const ordersPrev30 = orders.filter((o) => inWindow(o.date, cutoff60, cutoff30)).length;
    return pctDelta(ordersLast30, ordersPrev30);
  }, [orders]);

  const recentTx = useMemo(() => {
    const all = [
      ...orders.map((r) => ({ ...r, kind: 'Sipariş' as const })),
      ...invoices.map((r) => ({ ...r, kind: 'Fatura' as const })),
      ...payments.map((r) => ({ ...r, kind: 'Tahsilat' as const })),
    ];
    return all.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  }, [orders, invoices, payments]);

  // Alacak bakiyesi "iyi" bir olay değil, yalnızca bir durum — yeşil yalnızca gerçek risk sinyalinde
  // (borç/negatif) kullanılır (Tur 3 P2 bulgusu).
  const balanceNegative = Number(partner.balance) < 0;
  const balanceIsZero = new Decimal(partner.balance || '0').isZero();

  // Tur 11 P1 bulgusu (ana-veri-cari-detay-03): "Aktif" (başlıkta) ve "Kaydedildi" (aşağıdaki "Son
  // hareketler" tablosunda `posted` durumu) `lib/status.ts`'te `tone: 'success'` — sayfada yeşil dört
  // ayrı anlam taşıyordu (marka/birincil buton, "Aktif", "Kaydedildi", "Tahsil edildi"). `lib/status.ts`
  // paylaşılan bir dosya (değiştirilmedi) — `StatusBadge`'in kendi `tone` prop'u burada, ÇAĞRI
  // NOKTASINDA ezilir. "Kaydedildi" (posted) nötrleşir; "Tahsil edildi" (paid) gerçek terminal başarı
  // olduğu için yeşil kalır — ekranda yeşil taşıyan bileşen sayısı ikiye iner (marka/birincil buton +
  // "Tahsil edildi").
  const recentTxTone = (status: string): StatusTone | undefined => (status === 'posted' ? 'muted' : undefined);

  type FieldRow = DetailFieldGroup['fields'][number];

  // "Tip" burada tekrar edilmez (Tur 5 P1 bulgusu) — sayfa başlığının hemen üstündeki eyebrow zaten
  // aynı bilgiyi taşıyor. "Durum" da aynı nedenle burada yok (rozet başlıkta).
  //
  // Tur 11 P1 bulgusu (ana-veri-cari-detay-06): her alan `value: <gerçek veri>` taşıyordu — VKN/vergi
  // dairesi kaydı olmayan (çoğu perakende müşteri) bir caride "Kimlik & Vergi" grubu tek alana
  // ("e-Fatura mükellefi") düşüyor, `DetailFieldGroupsGrid`'in sabit 4 sütunluk rayında 3 hücre boş
  // kalıyor, ilk ekranda toplam 6 veri noktası görünüyordu. Kök neden bu SAYFANIN kendi alan listesi —
  // paylaşılan `DetailFieldGroupsGrid` (varsayılan gizli + "Boş alanları göster" sabit rayı diğer
  // rotalarda doğru çalışıyor, değiştirilmedi). Burada her alan artık `value: true` — VKN'si olmayan
  // bir cari "VKN / TCKN: —" olarak GÖRÜNÜR kalır (Stripe/Linear müşteri kartı deseni: sabit alan seti
  // hep basılır, boş olan da bilgi taşır — "kayıtlı değil"). Sonuç: 3+3+6(-9) = 12-15 veri noktası
  // garanti, veri durumundan bağımsız.
  const identity: FieldRow[] = [
    { label: 'VKN / TCKN', value: true, node: partner.taxNumber ?? '—' },
    { label: 'Vergi dairesi', value: true, node: partner.taxOffice ?? '—' },
    { label: 'e-Fatura mükellefi', value: true, node: partner.isEInvoiceRegistered ? 'Evet' : 'Hayır' },
  ];
  const contact: FieldRow[] = [
    { label: 'E-posta', value: true, node: partner.email ?? '—' },
    { label: 'Telefon', value: true, node: partner.phone ?? '—' },
    { label: 'WhatsApp', value: true, node: partner.whatsapp ?? '—' },
  ];
  const commercial: FieldRow[] = [
    { label: 'Ülke / Para birimi', value: true, node: `${partner.country} / ${partner.currency}` },
    {
      label: 'Vade',
      value: true,
      node: partner.paymentTermKind === 'cash' ? PAYMENT_TERM_LABELS.cash : `${partner.paymentTermDays} gün (${PAYMENT_TERM_LABELS[partner.paymentTermKind]})`,
    },
    { label: 'Kredi limiti', value: true, node: partner.creditLimit ? <MoneyCell value={partner.creditLimit} currency={partner.currency} /> : '—' },
    { label: 'Kanal', value: true, node: channelName ?? '—' },
    ...(partner.kind === 'supplier' || partner.kind === 'both'
      ? [
          { label: 'Tedarik süresi', value: true, node: partner.supplierLeadTimeDays ? `${partner.supplierLeadTimeDays} gün` : '—' },
          { label: 'Satın almaya onaylı', value: true, node: partner.isPurchaseWhitelisted ? 'Evet' : 'Hayır' },
          { label: 'Kalite skoru', value: true, node: partner.supplierQualityScore ? Number(partner.supplierQualityScore).toFixed(0) : '—' },
        ]
      : []),
    { label: 'Son sipariş', value: true, node: lastOrder ? `${lastOrder.docNo} · ${formatDate(lastOrder.date)}` : '—' },
    { label: 'Oluşturma', value: true, node: formatDate(partner.createdAt) },
  ];

  const groups: DetailFieldGroup[] = [
    { title: 'Kimlik & Vergi', fields: identity },
    { title: 'İletişim', fields: contact },
    { title: 'Ticari koşullar', fields: commercial },
  ];

  // Tur 11 P1 bulgusu (ana-veri-cari-detay-05): paylaşılan `KpiCard variant="strip"` + `KpiStripRow`
  // mobilde yatay kaydırma carousel'i üretir (140-152px sabit genişlikli kartlar) — duruşta (scrollLeft=0)
  // 4. kart yarım kesik kalıyordu, Stripe mobilde KPI'ları asla kırpmaz, 2 sütunlu ızgaraya düşürür.
  // Kök neden paylaşılan `kpi-card.tsx`/`kpi-strip.tsx`'in mobil kalıbında (sabit `w-[152px] shrink-0
  // snap-start`) — dosyalar değiştirilmedi (bkz. rapor "sharedComponentRequests"). Bu sayfa bunun yerine
  // reçete detayında (`bom-detail-form.tsx`) zaten doğrulanmış Stripe şeridini kullanır: çerçeveli tek
  // blok + `divide-x`/`divide-y` hairline, `grid-cols-2` mobilde DOĞAL akışla sarar (kaydırma yok, hiç
  // kırpma olmaz), `sm:grid-cols-4`'te tek satır. Sıfır değerler `MoneyCell`in kendi soluklaştırma
  // kuralıyla basılır (Tur 11 P1 ana-veri-cari-detay-07 — liste ekranlarındaki sıfır ile aynı ağırlık).
  const kpiCount = 3 + (creditUsagePct !== null ? 1 : 0);
  const lastKpiFullWidth = kpiCount % 2 === 1; // tek sayıda kart: son kart mobilde 2. satırda tam genişlik
  // `sm:grid-cols-4` sabit olsaydı 3 kartlı durumda (kredi limiti yoksa — bu partner gibi) 4. sütun boş
  // kalır, `bom-detail-form.tsx`'teki aynı desenin `KpiCard`'ın eski `stripCompact`'ının önlediği tam
  // problem: az kartlı bir şeritte anlamsız geniş bir boşluk. Sütun sayısı kart sayısına göre ayarlanır.
  const kpiDesktopCols = kpiCount === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3';

  return (
    <div className="max-w-[1080px] space-y-6">
      <div className={cn('grid grid-cols-2 divide-x divide-y divide-border/60 rounded-lg border border-border/60 bg-card sm:divide-y-0', kpiDesktopCols)}>
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bakiye</div>
          <div className="num mt-1 text-[19px] leading-tight font-semibold">
            <MoneyCell value={partner.balance} currency={partner.currency} className={cn('text-[19px]', balanceNegative && 'text-destructive')} />
          </div>
          {/* Sıfırken "Borç/Alacak" etiketi de basılmaz — nötr bir sıfır için "iyi/kötü" yönü yok
              (Tur 11 P1 ana-veri-cari-detay-07 hedefi). */}
          {!balanceIsZero ? <div className="mt-0.5 text-[11px] text-muted-foreground">{balanceNegative ? 'Borç' : 'Alacak'}</div> : null}
        </div>
        {creditUsagePct !== null ? (
          <div className="px-4 py-3">
            <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Kredi limiti kullanımı</div>
            <div className="num mt-1 text-[19px] leading-tight font-semibold">{formatPctFixed(creditUsagePct, 1)}</div>
          </div>
        ) : null}
        <div className="px-4 py-3">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Açık sipariş</div>
          <div className={cn('num mt-1 text-[19px] leading-tight font-semibold', openOrdersCount === 0 && 'text-muted-foreground')}>{openOrdersCount}</div>
          {openOrdersCount !== 0 && orderDelta !== null ? (
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium tabular-nums',
                  orderDelta > 0 ? 'bg-success/12 text-success' : orderDelta < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
                )}
              >
                {orderDelta > 0 ? <ArrowUpRight className="size-3" /> : orderDelta < 0 ? <ArrowDownRight className="size-3" /> : <Minus className="size-3" />}
                %{Math.abs(orderDelta).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">önceki 30 gün</span>
            </div>
          ) : (
            <div className="mt-1 h-[15px]" aria-hidden />
          )}
        </div>
        {/* Tur 9/10 P1 bulgusu: bu KPI'ın delta'sı yok. Gösterilen değer (açık/ödenmemiş fatura
            toplamı) ile hesaplanabilecek tek delta (son 30 gün TÜM fatura hacmi) farklı metrikler
            olduğu için, özellikle değer ₺0,00 iken yanıltıcı bir "+%100" rozeti basılmasın diye bu
            KPI'a hiç delta verilmiyor. */}
        <div className={cn('px-4 py-3', lastKpiFullWidth && 'col-span-2 sm:col-span-1')}>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Açık fatura tutarı</div>
          <div className="num mt-1 text-[19px] leading-tight font-semibold">
            <MoneyCell value={openInvoiceTotal.toFixed(4)} currency={partner.currency} className="text-[19px]" />
          </div>
        </div>
      </div>

      <DetailFieldGroupsGrid groups={groups} />

      {/* Tur 5 P1 bulgusu: 1440×900'ün ~%58'i boştu — "Kimlik & Vergi" grubunda yalnızca 2 alan vardı,
          "Son hareketler" sık sık boş durumla ~200px kaplıyordu. Adresler/Kişiler sekmelerinin varsayılan
          kaydı burada iki küçük özet blok olarak görünür — kullanıcı sekme değiştirmeden cariyi tanır. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AddressSummary addresses={addresses} />
        <ContactSummary contacts={contacts} />
      </div>

      <div>
        <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Son hareketler</h3>
        {recentTx.length === 0 ? (
          <EmptyState compact title="Hareket yok" description="Bu cari için henüz sipariş, fatura ya da tahsilat kaydı yok." />
        ) : (
          <>
            {/* Tur 11 P1 bulgusu (ana-veri-cari-detay-04): 390px'te bu tablo `overflow-x-auto` yatay
                kaydırmaya düşüyordu ve "Tutar" sütunu 31px kırpılıyordu — aynı modülün liste tabloları
                (`DataTable`) 390px'te satır başına 2 katmanlı bir karta düşer, burada tek istisna buydu
                (Kriter 11 tutarlılık). Paylaşılan `DataTableMobileCards` bir tanstack `Table` örneği
                bekliyor (bu blok statik/yerel bir dizi) — burada aynı görsel kalıp (rozet+aksiyon üstte,
                alt başlık+tek metrik altta) elle uygulanır: satır 1 Tür + Belge No, satır 2 tarih+durum
                solda, Tutar sağda; ≥sm'de eski tablo geri döner. */}
            <ul className="space-y-2 sm:hidden">
              {recentTx.map((r, i) => (
                <li key={`${r.kind}-${r.docNo}-${i}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] leading-5 font-medium">{r.kind}</span>
                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{r.docNo}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <span className="whitespace-nowrap">{formatDate(r.date)}</span>
                      <span aria-hidden className="text-muted-foreground/40">
                        ·
                      </span>
                      <StatusBadge
                        status={r.status}
                        kind={r.kind === 'Sipariş' ? 'sales_order' : r.kind === 'Fatura' ? 'invoice' : 'payment'}
                        tone={recentTxTone(r.status)}
                      />
                    </div>
                    <div className="shrink-0 text-[13px] tabular-nums">
                      <MoneyCell value={r.amount} currency={r.currency || partner.currency} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-lg border border-border/70 bg-card sm:block">
              {/* `scroll-fade-x`: taşan içerik varsa kaydırma affordance'ı (Tur 3 P0 — önceden hiç yoktu);
                  ≥sm'de artık yalnızca çok dar `sm` genişliklerinde (Belge No sütunu dahil) devreye girer. */}
              <div className="scrollbar-thin scroll-fade-x overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                      <th className="h-9 px-3 text-left font-medium">Tür</th>
                      <th className="h-9 px-3 text-left font-medium">Belge No</th>
                      <th className="h-9 px-3 text-left font-medium">Tarih</th>
                      <th className="h-9 px-3 text-left font-medium">Durum</th>
                      <th className="h-9 px-3 text-right font-medium">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTx.map((r, i) => (
                      <tr key={`${r.kind}-${r.docNo}-${i}`} className="h-9 border-b border-border/50 last:border-0">
                        <td className="px-3 whitespace-nowrap text-muted-foreground">{r.kind}</td>
                        <td className="px-3 whitespace-nowrap font-mono text-[12px]">{r.docNo}</td>
                        <td className="px-3 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="px-3 whitespace-nowrap">
                          <StatusBadge
                            status={r.status}
                            kind={r.kind === 'Sipariş' ? 'sales_order' : r.kind === 'Fatura' ? 'invoice' : 'payment'}
                            tone={recentTxTone(r.status)}
                          />
                        </td>
                        <td className="px-3 text-right whitespace-nowrap">
                          <MoneyCell value={r.amount} currency={r.currency || partner.currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {partner.note ? (
        <div>
          <div className="mb-1 text-[12px] text-muted-foreground">Not</div>
          <p className="text-[13px] whitespace-pre-wrap text-muted-foreground">{partner.note}</p>
        </div>
      ) : null}
    </div>
  );
}
