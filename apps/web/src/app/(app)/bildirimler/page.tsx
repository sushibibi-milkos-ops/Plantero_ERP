import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { listMyNotifications } from '@/modules/notifications/queries';
import { NotificationsList } from '@/modules/notifications/components/notifications-list';

export const metadata: Metadata = { title: 'Bildirimler' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await listMyNotifications(user.userId);

  return (
    <>
      <PageHeader title="Bildirimler" description="Size gönderilen uygulama içi bildirimler" />
      <NotificationsList notifications={rows} />
    </>
  );
}
