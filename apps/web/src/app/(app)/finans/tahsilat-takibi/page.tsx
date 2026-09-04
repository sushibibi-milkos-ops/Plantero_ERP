import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/kpi-card';
import { KpiStripRow } from '@/components/kpi-strip';
import { getDunningPage, listDunningRules } from '@/modules/finance/dunning-queries';
import { DunningTable, DunningHistoryList } from '@/modules/finance/components/dunning-panel';

export const metadata: Metadata = { title: 'Tahsilat Takibi' };
export const dynamic = 'force-dynamic';

// Kriter 12 kök neden düzeltmesi (Tur 2, P1): `dunning_rules.channels`/`tone` DB'de ham İngilizce
// enum olarak tutulur (seed: packages/db/src/seed/finance.ts) — Türkçe arayüzde ham basılıyordu
// ('email', 'friendly'...). Ekranda basılmadan önce her zaman bu sözlükten Türkçe etikete çevrilir.
const CHANNEL_LABEL: Record<string, string> = { email: 'E-posta', whatsapp: 'WhatsApp' };
// Kriter 4 kök neden düzeltmesi (Tur 4, P1 — finans-dunning-10): TON kendi rozet/renk sistemini
// kuruyordu (SEVİYE rozetinden bağımsız 3 ayrı ton), ekranda toplam 5 farklı rozet tonu +
// "N gün" kırmızı metniyle birlikte >4 durum tonu üretiyordu. TON artık rozetsiz düz metin —
// tek renk sistemi SEVİYE'de (gecikme yaşı) kalır.
const TONE_LABEL: Record<string, string> = { friendly: 'Nazik', firm: 'Sert', legal: 'Hukuki' };

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

      {/* Kriter 11 kök neden düzeltmesi (Tur 4, P1 — finans-dunning-08): sayfadaki 3 bölümün ilk
          ikisinde h2 kart dışındaydı, burada kart içindeydi — tek kalıba (h2 hep kart dışında)
          çekildi. Kriter 9 kök neden düzeltmesi (Tur 4, P1 — finans-dunning-09): tablo 390px'te
          TON/ONAY görünür alanın dışında kalıyordu, sayfanın diğer bölümü (DunningTable) gibi
          <md'de kart görünümüne düşer — hiçbir sütun gizlenmez/kırpılmaz. */}
      <div className="mt-6 mb-3">
        <h2 className="text-[13px] font-semibold">Kural tablosu</h2>
      </div>

      <ul className="space-y-2 md:hidden">
        {rules.map((r) => (
          <li key={r.level} className="rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-medium">{r.level}. {r.name}</div>
              <div className="shrink-0 text-[11px] text-muted-foreground">{r.daysOffset > 0 ? '+' : ''}{r.daysOffset} gün</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase">Kanal</div>
                <div>{r.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase">Ton</div>
                <div>{TONE_LABEL[r.tone] ?? r.tone}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] text-muted-foreground uppercase">Onay</div>
                <div>{r.requiresApproval ? 'Gerekli' : 'Gerekmiyor'}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card p-4 md:block">
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
                <td className="py-1.5 pr-4 whitespace-nowrap text-muted-foreground">{TONE_LABEL[r.tone] ?? r.tone}</td>
                <td className="py-1.5 whitespace-nowrap text-muted-foreground">{r.requiresApproval ? 'Gerekli' : 'Gerekmiyor'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
