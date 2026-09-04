import type { Metadata } from 'next';
import { requireUser, userCan } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { getApprovalQueue } from '@/modules/notifications/queries';
import { ApprovalQueue } from '@/modules/notifications/components/approval-queue';

export const metadata: Metadata = { title: 'Onay Merkezi' };
export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const user = await requireUser();
  const all = await getApprovalQueue();
  // Kullanıcı yalnızca kendi karar yetkisi olan türleri görür (approve/reject action'ları zaten
  // `requiredPermission`e göre kapılı — burada da göstermemek karar veremeyeceği kartlarla dolu bir
  // ekran yerine dürüst bir kuyruk sunar).
  const items = all.filter((i) => userCan(user, i.requiredPermission));

  return (
    <>
      <PageHeader title="Onay Merkezi" description={`${items.length} onay bekliyor — satın alma taslağı, sayım farkı, tahsilat hatırlatma, mutabakat önerisi tek kuyrukta`} />
      <ApprovalQueue items={items} />
    </>
  );
}
