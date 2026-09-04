import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { StatusBadge } from '@/components/status-badge';
import { getDunningPage, listDunningRules } from '@/modules/finance/dunning-queries';
import { DunningTable, DunningHistoryList } from '@/modules/finance/components/dunning-panel';

export const metadata: Metadata = { title: 'Tahsilat Takibi' };
export const dynamic = 'force-dynamic';

// Kriter 12 kök neden düzeltmesi (Tur 2, P1): `dunning_rules.channels`/`tone` DB'de ham İngilizce
// enum olarak tutulur (seed: packages/db/src/seed/finance.ts) — Türkçe arayüzde ham basılıyordu
// ('email', 'friendly'...). Ekranda basılmadan önce her zaman bu sözlükten Türkçe etikete çevrilir.
const CHANNEL_LABEL: Record<string, string> = { email: 'E-posta', whatsapp: 'WhatsApp' };
const TONE_LABEL: Record<string, string> = { friendly: 'Nazik', firm: 'Sert', legal: 'Hukuki' };
const TONE_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = { friendly: 'neutral', firm: 'warning', legal: 'danger' };

export default async function DunningPage() {
  await requirePermission('finance.view');
  const [{ due, aging, actions }, rules] = await Promise.all([getDunningPage(), listDunningRules()]);

  return (
    <>
      <PageHeader title="Tahsilat Takibi" description="Vadesi geçmiş faturalar — kademeli hatırlatma (AI taslak → onay → gönderim)" />

      <KpiStripRow>
        <KpiCard variant="strip" title="0-30 gün" value={aging.b0_30} format="money" />
        <KpiCard variant="strip" title="31-60 gün" value={aging.b31_60} format="money" />
        <KpiCard variant="strip" title="61-90 gün" value={aging.b61_90} format="money" />
        <KpiCard variant="strip" title="90+ gün" value={aging.b90plus} format="money" />
      </KpiStripRow>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Vadesi geçen faturalar ({due.length})</h2>
      </div>
      <DunningTable due={due} actions={actions} />

      <div className="mt-6 mb-4">
        <h2 className="text-[13px] font-semibold">Gönderim geçmişi</h2>
      </div>
      <DunningHistoryList actions={actions} />

      <div className="mt-6 overflow-x-auto rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Kural tablosu</h2>
        <table className="w-full min-w-max text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] text-muted-foreground uppercase">
              <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Seviye</th>
              <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Ad</th>
              <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Gün</th>
              <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Kanal</th>
              <th className="py-1.5 pr-4 font-medium whitespace-nowrap">Ton</th>
              <th className="py-1.5 font-medium whitespace-nowrap">Onay</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.level} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-4 font-mono whitespace-nowrap tabular-nums">{r.level}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">{r.name}</td>
                <td className="py-1.5 pr-4 font-mono whitespace-nowrap tabular-nums">{r.daysOffset > 0 ? '+' : ''}{r.daysOffset}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground">{r.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}</td>
                <td className="py-1.5 pr-4 whitespace-nowrap">
                  <StatusBadge status={r.tone} label={TONE_LABEL[r.tone] ?? r.tone} tone={TONE_TONE[r.tone] ?? 'neutral'} size="sm" />
                </td>
                <td className="py-1.5 whitespace-nowrap text-muted-foreground">{r.requiresApproval ? 'Gerekli' : 'Gerekmiyor'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
