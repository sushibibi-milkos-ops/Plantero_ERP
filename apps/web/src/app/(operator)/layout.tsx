import Link from 'next/link';
import { LogOut, LayoutDashboard } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { Logotype } from '@/components/logotype';
import { OperatorClock } from '@/components/operator-clock';
import { operatorLogout } from '@/modules/production/actions';

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
          {/* h-14 min-w-14 (h-11 w-11 idi): eldivenli parmakla, hareketli üretim ortamında 44px WCAG
              asgarisine yapışmak yanlış dokunma riskini artırıyordu; çıkış ayrıca yalnızca ikon
              taşıyıp etiketsizdi — iki düğme de metinle adlandırılıp 56×56'ya büyütüldü (Tur 4
              bulgusu, P2). */}
          <Link
            href="/kokpit"
            className="flex h-14 min-w-14 items-center justify-center gap-1.5 rounded-lg border px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Kokpite dön"
          >
            <LayoutDashboard className="size-5 shrink-0" />
            <span className="hidden text-sm sm:inline">Kokpit</span>
          </Link>
          <form action={operatorLogout}>
            <button
              type="submit"
              className="flex h-14 min-w-14 items-center justify-center gap-1.5 rounded-lg border px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Çıkış"
            >
              <LogOut className="size-5 shrink-0" />
              <span className="hidden text-sm sm:inline">Çıkış</span>
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6 [&_button]:min-h-12">{children}</main>
    </div>
  );
}
