'use client';

import { useMemo } from 'react';
import Decimal from 'decimal.js';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { DetailFieldGroups, type DetailFieldGroup } from '@/components/detail-fields';
import { formatDate, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PARTNER_KIND_LABELS, PAYMENT_TERM_LABELS } from '../product-labels';
import type { getPartnerById, PartnerDocRow } from '../queries';

/** Stripe tarzı KPI şeridi — bom-detail-form.tsx'teki ızgara deseniyle birebir aynı (hücreler eşit,
    hairline ayraçlar dolgulu bir kutu içinde). Tutar nötr: bir alacak bakiyesi "iyi" anlamı taşımaz —
    renk yalnızca gerçek risk sinyalinde (negatif/borç) kullanılır (Tur 3 P2 bulgusu). */
function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="px-4 py-3">
      <div className={cn('num text-2xl font-semibold tracking-tight', tone === 'danger' && 'text-destructive')}>{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{label}</div>
    </div>
  );
}

const OPEN_ORDER_STATUSES = new Set(['draft', 'sent', 'accepted', 'confirmed', 'partially_delivered', 'partially_invoiced']);
const OPEN_INVOICE_STATUSES = new Set(['draft', 'sent', 'partially_paid', 'pending']);

export function PartnerGeneralTab({
  partner,
  channelName,
  lastOrder,
  orders,
  invoices,
  payments,
}: {
  partner: NonNullable<Awaited<ReturnType<typeof getPartnerById>>>;
  channelName: string | null;
  lastOrder: PartnerDocRow | null;
  orders: PartnerDocRow[];
  invoices: PartnerDocRow[];
  payments: PartnerDocRow[];
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

  const recentTx = useMemo(() => {
    const all = [
      ...orders.map((r) => ({ ...r, kind: 'Sipariş' as const })),
      ...invoices.map((r) => ({ ...r, kind: 'Fatura' as const })),
      ...payments.map((r) => ({ ...r, kind: 'Tahsilat' as const })),
    ];
    return all.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  }, [orders, invoices, payments]);

  // Alacak bakiyesi "iyi" bir olay değil, yalnızca bir durum — yeşil yalnızca gerçek risk sinyalinde
  // (borç/negatif) kullanılır (Tur 3 P2 bulgusu; bkz. Kpi bileşeni yorumu).
  const balanceTone = Number(partner.balance) < 0 ? 'danger' : undefined;

  type FieldRow = DetailFieldGroup['fields'][number];

  // "Durum" burada tekrar edilmez — sayfa başlığındaki rozet zaten aynı bilgiyi taşıyor.
  const identity: FieldRow[] = [
    { label: 'Tip', value: PARTNER_KIND_LABELS[partner.kind] ?? partner.kind, node: PARTNER_KIND_LABELS[partner.kind] ?? partner.kind },
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

  // KPI sayısı 3 (varsayılan) ya da 4 (kredi limiti tanımlıysa) — ızgara sütun sayısı buna göre
  // sabitlenir (flex-wrap yerine grid: az sayıda hücre eşit genişlikte kalır, ayraçlar bozulmaz).
  const kpiCount = creditUsagePct !== null ? 4 : 3;

  return (
    <div className="max-w-[1080px] space-y-6">
      {/* Stripe tarzı KPI şeridi — bom-detail-form.tsx'teki reçete maliyet şeridiyle aynı desen. */}
      <div className={cn('grid grid-cols-2 divide-x divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/10 sm:divide-y-0', kpiCount === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
        <Kpi label="Bakiye" value={formatMoney(partner.balance, partner.currency)} tone={balanceTone} />
        {creditUsagePct !== null ? <Kpi label="Kredi limiti kullanımı" value={formatPct(creditUsagePct)} /> : null}
        <Kpi label="Açık sipariş" value={openOrdersCount} />
        <Kpi label="Açık fatura tutarı" value={formatMoney(openInvoiceTotal.toFixed(4), partner.currency)} />
      </div>

      <DetailFieldGroups groups={groups} />

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
