import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth';
import { listOpportunityStages, listOpportunityCards, getSalesFunnel, listCustomers, listChannels } from '@/modules/sales/queries';
import { KanbanBoard } from '@/modules/sales/components/kanban-board';
import { NewOpportunityDialog } from '@/modules/sales/components/new-opportunity-dialog';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Fırsatlar' };
export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const user = await requirePermission('sales.view');
  const [stages, cards, funnelRaw, customers, channels] = await Promise.all([listOpportunityStages(), listOpportunityCards(), getSalesFunnel(), listCustomers(), listChannels()]);
  // Sunucu → istemci sınırında Decimal serileştirilemez; yalnızca ekranda kullanılan alanlar aktarılır.
  const funnel = { stages: funnelRaw.stages.map((s) => ({ stageId: s.stage.id, name: s.stage.name, count: s.count })), winRate: funnelRaw.winRate };

  return (
    <>
      <PageHeader
        title="Fırsatlar"
        description={`${cards.length} fırsat · huni ve kazanma oranı`}
        actions={userCan(user, 'sales.quote') ? <NewOpportunityDialog stages={stages} customers={customers} channels={channels} /> : undefined}
      />
      <KanbanBoard stages={stages} cards={cards} funnel={funnel} />
    </>
  );
}
