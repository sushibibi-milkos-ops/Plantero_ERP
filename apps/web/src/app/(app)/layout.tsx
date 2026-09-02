import { cookies } from 'next/headers';
import { requireUser } from '@/lib/auth';
import { AppShell, SIDEBAR_COOKIE } from '@/components/app-shell/app-shell';

/** Uygulama düzeni: oturum zorunlu; kenar çubuğu + üst bar kabuğu */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const jar = await cookies();
  const collapsed = jar.get(SIDEBAR_COOKIE)?.value === 'collapsed';

  return (
    <AppShell
      user={{
        userId: user.userId,
        userEmail: user.userEmail,
        fullName: user.fullName,
        roles: user.roles,
        permissions: user.permissions,
      }}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
