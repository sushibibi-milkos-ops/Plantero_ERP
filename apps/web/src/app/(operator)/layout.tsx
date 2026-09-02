import Link from 'next/link';
import { LogOut, LayoutDashboard } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { Logotype } from '@/components/logotype';
import { OperatorClock } from '@/components/operator-clock';
import { logout } from '@/modules/auth/actions';

/**
 * Operatör düzeni: tam ekran tablet. Kenar çubuğu yok; büyük dokunma hedefleri,
 * üstte hat/saat şeridi, altta çıkış. Yatay ve dikey tablet için akışkan.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission('production.operate');
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-16 items-center gap-4 border-b border-border/60 bg-card px-4 sm:px-6">
        <Logotype size="md" />
        <span className="hidden text-sm text-muted-foreground sm:inline">Operatör terminali</span>
        <div className="ml-auto flex items-center gap-3">
          <OperatorClock />
          <span className="hidden max-w-[160px] truncate text-sm font-medium sm:inline">{user.fullName}</span>
          <Link
            href="/kokpit"
            className="grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Kokpit"
          >
            <LayoutDashboard className="size-5" />
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Çıkış"
            >
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 [&_button]:min-h-12">{children}</main>
    </div>
  );
}
