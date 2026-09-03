'use client';

import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDate, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PARTNER_KIND_LABELS, PAYMENT_TERM_LABELS } from '../product-labels';
import type { getPartnerById, PartnerDocRow } from '../queries';

function Field({ label, children, empty }: { label: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className={cn('space-y-0.5', empty && 'opacity-60')}>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="border-t border-border/60 pt-3 text-[13px] font-semibold">{children}</h3>;
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'success' | 'danger' }) {
  return (
    <div className="flex-1 px-4 py-3 first:pl-0 last:pr-0">
      <div className={cn('num text-2xl font-semibold tracking-tight', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')}>{value}</div>
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
  const [showEmpty, setShowEmpty] = useState(false);

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

  const balanceTone = Number(partner.balance) > 0 ? 'success' : Number(partner.balance) < 0 ? 'danger' : undefined;

  type FieldRow = { label: string; value: unknown; node: React.ReactNode };

  const identity: FieldRow[] = [
    { label: 'Tip', value: PARTNER_KIND_LABELS[partner.kind] ?? partner.kind, node: PARTNER_KIND_LABELS[partner.kind] ?? partner.kind },
    { label: 'Durum', value: partner.isActive ? 'active' : 'inactive', node: <StatusBadge status={partner.isActive ? 'active' : 'inactive'} /> },
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

  const groups: { title: string; fields: FieldRow[] }[] = [
    { title: 'Kimlik & Vergi', fields: identity },
    { title: 'İletişim', fields: contact },
    { title: 'Ticari koşullar', fields: commercial },
  ];
  const hiddenCount = groups.reduce((acc, g) => acc + g.fields.filter((f) => !f.value).length, 0);

  return (
    <div className="space-y-6">
      {/* Stripe tarzı KPI şeridi — bu sekmenin manşet sayıları */}
      <div className="flex flex-wrap divide-x divide-border/60 rounded-lg border border-border/60 bg-muted/10">
        <Kpi label="Bakiye" value={<MoneyCell value={partner.balance} currency={partner.currency} className="text-2xl" />} tone={balanceTone} />
        {creditUsagePct !== null ? <Kpi label="Kredi limiti kullanımı" value={formatPct(creditUsagePct)} /> : null}
        <Kpi label="Açık sipariş" value={openOrdersCount} />
        <Kpi label="Açık fatura tutarı" value={<MoneyCell value={openInvoiceTotal.toFixed(4)} currency={partner.currency} className="text-2xl" />} />
      </div>

      <div className="space-y-4">
        {groups.map((g) => {
          const visible = g.fields.filter((f) => showEmpty || f.value);
          if (visible.length === 0) return null;
          return (
            <div key={g.title} className="space-y-3">
              <GroupHeading>{g.title}</GroupHeading>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                {visible.map((f) => (
                  <Field key={f.label} label={f.label} empty={!f.value}>
                    {f.node}
                  </Field>
                ))}
              </div>
            </div>
          );
        })}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowEmpty((s) => !s)}
            className="text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {showEmpty ? 'Boş alanları gizle' : `Boş alanları göster (${hiddenCount})`}
          </button>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 border-t border-border/60 pt-3 text-[13px] font-semibold">Son hareketler</h3>
        {recentTx.length === 0 ? (
          <EmptyState compact title="Hareket yok" description="Bu cari için henüz sipariş, fatura ya da tahsilat kaydı yok." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
            {/* Dar ekranda sıkışıp satırların sarmalanması yerine yatay kaydırma — sayfa gövdesi kaymaz. */}
            <div className="overflow-x-auto">
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
