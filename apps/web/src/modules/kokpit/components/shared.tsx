import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Kokpit'in tüm rol panolarının paylaştığı kart iskeleti: başlık + opsiyonel "Tümü" bağlantısı. */
export function Section({ title, href, children, className }: { title: string; href?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card', className)}>
      <header className="flex h-11 items-center justify-between border-b border-border/60 px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          // max-md:min-h-11: mobil dokunma hedefi 44px.
          <Link href={href} className="inline-flex items-center gap-1 max-md:min-h-11 text-xs text-muted-foreground hover:text-foreground">
            Tümü <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** Tıklanabilir liste satırı — tüm panolardaki "Bugün/SKT/Onay/..." listeleri aynı hover/odak/dokunma dilini paylaşır. */
export function RowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col gap-1 px-4 py-2.5 text-[13px] outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:py-0',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** İnce ilerleme çubuğu (break-even, OEE, iş emri yüzdesi) — tüm panolarda aynı anatomi. */
export function ProgressBar({ pct, tone = 'primary' }: { pct: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneClass = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', toneClass)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** İki sütunlu (masaüstü) / tek sütunlu (mobil) pano ızgarası — tüm rol panoları bunu kullanır. */
export function DashboardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mt-4 grid gap-4 lg:grid-cols-2 lg:items-start', className)}>{children}</div>;
}
