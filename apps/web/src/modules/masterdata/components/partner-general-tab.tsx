import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import { PARTNER_KIND_LABELS, PAYMENT_TERM_LABELS } from '../product-labels';
import type { getPartnerById, PartnerDocRow } from '../queries';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

export function PartnerGeneralTab({
  partner,
  channelName,
  lastOrder,
}: {
  partner: NonNullable<Awaited<ReturnType<typeof getPartnerById>>>;
  channelName: string | null;
  lastOrder: PartnerDocRow | null;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Tip">{PARTNER_KIND_LABELS[partner.kind] ?? partner.kind}</Field>
        <Field label="Durum">
          <StatusBadge status={partner.isActive ? 'active' : 'inactive'} />
        </Field>
        <Field label="VKN / TCKN">{partner.taxNumber ?? '—'}</Field>
        <Field label="Vergi dairesi">{partner.taxOffice ?? '—'}</Field>
        <Field label="e-Fatura mükellefi">{partner.isEInvoiceRegistered ? 'Evet' : 'Hayır'}</Field>
        <Field label="E-posta">{partner.email ?? '—'}</Field>
        <Field label="Telefon">{partner.phone ?? '—'}</Field>
        <Field label="WhatsApp">{partner.whatsapp ?? '—'}</Field>
        <Field label="Ülke / Para birimi">
          {partner.country} / {partner.currency}
        </Field>
        <Field label="Vade">{partner.paymentTermKind === 'cash' ? PAYMENT_TERM_LABELS.cash : `${partner.paymentTermDays} gün (${PAYMENT_TERM_LABELS[partner.paymentTermKind]})`}</Field>
        <Field label="Kredi limiti">{partner.creditLimit ? <MoneyCell value={partner.creditLimit} currency={partner.currency} /> : '—'}</Field>
        <Field label="Kanal">{channelName ?? '—'}</Field>
        {partner.kind === 'supplier' || partner.kind === 'both' ? (
          <>
            <Field label="Tedarik süresi">{partner.supplierLeadTimeDays ? `${partner.supplierLeadTimeDays} gün` : '—'}</Field>
            <Field label="Satın almaya onaylı">{partner.isPurchaseWhitelisted ? 'Evet' : 'Hayır'}</Field>
            <Field label="Kalite skoru">{partner.supplierQualityScore ? Number(partner.supplierQualityScore).toFixed(0) : '—'}</Field>
          </>
        ) : null}
        <Field label="Bakiye">
          <MoneyCell value={partner.balance} currency={partner.currency} className="font-semibold" />
        </Field>
        {lastOrder ? (
          <Field label="Son sipariş">
            {lastOrder.docNo} · {formatDate(lastOrder.date)}
          </Field>
        ) : null}
        <Field label="Oluşturma">{formatDate(partner.createdAt)}</Field>
      </div>
      {partner.note ? (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Not</div>
          <p className="text-[13px] whitespace-pre-wrap text-muted-foreground">{partner.note}</p>
        </div>
      ) : null}
    </div>
  );
}
