import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Plantero logotype: yaprak işareti + kelime markası.
 * `compact` yalnızca işareti gösterir (daraltılmış kenar çubuğu).
 */
export function Logotype({
  size = 'md',
  compact = false,
  href,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  href?: string;
  className?: string;
}) {
  const dims = { sm: 'size-6', md: 'size-7', lg: 'size-10' }[size];
  const text = { sm: 'text-[15px]', md: 'text-base', lg: 'text-2xl' }[size];
  const content = (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <span
        className={cn(dims, 'grid shrink-0 place-items-center rounded-[30%] bg-primary text-primary-foreground shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]')}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
          <path d="M5 19c3-4 6-7 9-9" />
        </svg>
      </span>
      {!compact ? <span className={cn(text, 'font-semibold tracking-tight')}>Plantero</span> : null}
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label="Plantero">
        {content}
      </Link>
    );
  }
  return content;
}
