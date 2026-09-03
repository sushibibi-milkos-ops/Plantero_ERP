'use client';

import { useMemo } from 'react';
import Decimal from 'decimal.js';
import { MapPin, User } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import type { DetailFieldGroup } from '@/components/detail-fields';
import { DetailFieldGroupsGrid } from '@/components/detail-field-groups-grid';
import { formatDate } from '@/lib/format';
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
  // zaman "son 30 gün / önceki 30 gün" gibi bir trend taşır). Cari bazında bir bakiye geçmişi tablosu
  // yok — "Açık sipariş"/"Açık fatura tutarı" için en yakın anlamlı yaklaşıklık, belge TARİHİNE göre
  // son 30 gün içindeki aktiviteyi bir önceki 30 günle karşılaştırmaktır (durum anlık "açık" olsa da,
  // trend olarak aktivite yönünü gösterir). Bakiye tek bir anlık değerdir, doğal bir "önceki dönem"i
  // yoktur — delta yerine tonuyla (borç/alacak) bırakılır.
  const { orderDelta, invoiceDelta } = useMemo(() => {
    const now = Date.now();
    const cutoff30 = now - 30 * DAY_MS;
    const cutoff60 = now - 60 * DAY_MS;
    const inWindow = (dateStr: string, from: number, to: number) => {
      const t = new Date(dateStr).getTime();
      return Number.isFinite(t) && t >= from && t < to;
    };

    const ordersLast30 = orders.filter((o) => inWindow(o.date, cutoff30, now)).length;
    const ordersPrev30 = orders.filter((o) => inWindow(o.date, cutoff60, cutoff30)).length;

    const sumAmount = (rows: PartnerDocRow[]) => rows.reduce((acc, r) => acc.plus(new Decimal(r.amount || '0')), new Decimal(0));
    const invLast30 = sumAmount(invoices.filter((i) => inWindow(i.date, cutoff30, now)));
    const invPrev30 = sumAmount(invoices.filter((i) => inWindow(i.date, cutoff60, cutoff30)));

    return {
      orderDelta: pctDelta(ordersLast30, ordersPrev30),
      invoiceDelta: pctDelta(invLast30.toNumber(), invPrev30.toNumber()),
    };
  }, [orders, invoices]);

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

  type FieldRow = DetailFieldGroup['fields'][number];

  // "Tip" burada tekrar edilmez (Tur 5 P1 bulgusu) — sayfa başlığının hemen üstündeki eyebrow zaten
  // aynı bilgiyi taşıyor. "Durum" da aynı nedenle burada yok (rozet başlıkta).
  const identity: FieldRow[] = [
    { label: 'VKN / TCKN', value: partner.taxNumber, node: partner.taxNumber ?? '—' },
    { label: 'Vergi dairesi', value: partner.taxOffice, node: partner.taxOffice ?? '—' },
    { label: 'e-Fatura mükellefi', value: true, node: partner.isEInvoiceRegistered ? 'Evet' : 'Hayır' },
  ];
  const contact: FieldRow[] = [
    { label: 'E-posta', value: partner.email, node: partner.email ?? '—' },
    { label: 'Telefon', value: partner.phone, node: partner.phone ?? '—' },
    { label: 'WhatsApp', value: partner.whatsapp, node: partner.whatsapp ?? '—' },
  ];
  const commercial: FieldRow[] = [
    { label: 'Ülke / Para birimi', value: true, node: `${partner.country} / ${partner.currency}` },
    {
      label: 'Vade',
      value: true,
      node: partner.paymentTermKind === 'cash' ? PAYMENT_TERM_LABELS.cash : `${partner.paymentTermDays} gün (${PAYMENT_TERM_LABELS[partner.paymentTermKind]})`,
    },
    { label: 'Kredi limiti', value: partner.creditLimit, node: partner.creditLimit ? <MoneyCell value={partner.creditLimit} currency={partner.currency} /> : '—' },
    { label: 'Kanal', value: channelName, node: channelName ?? '—' },
    ...(partner.kind === 'supplier' || partner.kind === 'both'
      ? [
          { label: 'Tedarik süresi', value: partner.supplierLeadTimeDays, node: partner.supplierLeadTimeDays ? `${partner.supplierLeadTimeDays} gün` : '—' },
          { label: 'Satın almaya onaylı', value: true, node: partner.isPurchaseWhitelisted ? 'Evet' : 'Hayır' },
          { label: 'Kalite skoru', value: partner.supplierQualityScore, node: partner.supplierQualityScore ? Number(partner.supplierQualityScore).toFixed(0) : '—' },
        ]
      : []),
    { label: 'Son sipariş', value: lastOrder, node: lastOrder ? `${lastOrder.docNo} · ${formatDate(lastOrder.date)}` : '—' },
    { label: 'Oluşturma', value: true, node: formatDate(partner.createdAt) },
  ];

  const groups: DetailFieldGroup[] = [
    { title: 'Kimlik & Vergi', fields: identity },
    { title: 'İletişim', fields: contact },
    { title: 'Ticari koşullar', fields: commercial },
  ];

  return (
    <div className="max-w-[1080px] space-y-6">
      {/* Stripe tarzı KPI şeridi — paylaşılan `KpiCard variant="strip"` + `KpiStripRow` (Tur 5 P1
          bulgusu: yerel bir `Kpi()` bileşeni bg-card + border ile çevrelenmiş bir kutu çiziyordu; Stripe
          KPI blokları çerçevesiz/gölgesizdir, bloklar yalnızca dikey hairline ile ayrılır — paylaşılan
          bileşen bunu zaten doğru yapıyor, `/satis/net-ciro` ile aynı dil). Bakiye tonu artık ayrı bir
          `Kpi` prop'u değil, `.tabular-nums` seçicisi üzerinden (bkz. net-ciro/page.tsx'teki aynı desen). */}
      <KpiStripRow>
        <KpiCard
          variant="strip"
          title="Bakiye"
          value={partner.balance}
          format="money"
          currency={partner.currency}
          fractionDigits={2}
          className={balanceNegative ? '[&_.tabular-nums]:text-destructive' : undefined}
          hint={balanceNegative ? 'Borç' : 'Alacak'}
        />
        {creditUsagePct !== null ? <KpiCard variant="strip" title="Kredi limiti kullanımı" value={creditUsagePct} format="pct" /> : null}
        <KpiCard variant="strip" title="Açık sipariş" value={openOrdersCount} format="int" delta={orderDelta ?? undefined} deltaLabel="önceki 30 gün" />
        <KpiCard
          variant="strip"
          title="Açık fatura tutarı"
          value={openInvoiceTotal.toFixed(4)}
          format="money"
          currency={partner.currency}
          fractionDigits={2}
          delta={invoiceDelta ?? undefined}
          deltaLabel="önceki 30 gün"
        />
      </KpiStripRow>

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
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            {/* Dar ekranda sıkışıp satırların sarmalanması yerine yatay kaydırma — sayfa gövdesi kaymaz.
                `min-w-0 sm:min-w-[520px]`: 390px'te "Belge No" gizlenince Tür+Tarih+Durum+Tutar zaten
                358px'e sığar (min-w dayatılmaz); ≥sm'de beş sütunun tamamı 520px'in altına sıkışmaz.
                `scroll-fade-x`: taşan içerik varsa kaydırma affordance'ı (Tur 3 P0 — önceden hiç yoktu). */}
            <div className="scrollbar-thin scroll-fade-x overflow-x-auto">
              <table className="w-full min-w-0 border-collapse text-[13px] sm:min-w-[520px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
                    <th className="h-9 px-3 text-left font-medium">Tür</th>
                    <th className="hidden h-9 px-3 text-left font-medium sm:table-cell">Belge No</th>
                    <th className="h-9 px-3 text-left font-medium">Tarih</th>
                    <th className="h-9 px-3 text-left font-medium">Durum</th>
                    <th className="h-9 px-3 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTx.map((r, i) => (
                    <tr key={`${r.kind}-${r.docNo}-${i}`} className="h-9 border-b border-border/50 last:border-0">
                      <td className="px-3 whitespace-nowrap text-muted-foreground">{r.kind}</td>
                      <td className="hidden px-3 whitespace-nowrap font-mono text-[12px] sm:table-cell">{r.docNo}</td>
                      <td className="px-3 whitespace-nowrap text-muted-foreground">{formatDate(r.date)}</td>
                      <td className="px-3 whitespace-nowrap">
                        <StatusBadge status={r.status} kind={r.kind === 'Sipariş' ? 'sales_order' : r.kind === 'Fatura' ? 'invoice' : 'payment'} />
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
