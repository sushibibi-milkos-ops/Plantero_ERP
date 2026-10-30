import { cn } from '@/lib/utils';

/**
 * iPadOS "inset grouped" liste: beyaz yuvarlak kart içinde satırlar, satır arası hairline
 * (sol 16px boşlukla başlar — iOS ayraç davranışı). Üstte küçük gri bölüm başlığı.
 * Detay alanları (`DetailFieldGroups`) ve diğer salt-okunur özet listeleri için ortak yapı.
 */
export function InsetSection({
  title,
  children,
  className,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-5 break-inside-avoid', className)}>
      {title ? <h3 className="mb-1.5 px-4 text-[13px] font-medium tracking-[0.2px] text-muted-foreground uppercase">{title}</h3> : null}
      <dl className="grouped-card border border-border/50">{children}</dl>
    </section>
  );
}

/** Tek satır: solda etiket (gri), sağda değer. Dar ekranda uzun değerler alta sarar. */
export function InsetRow({
  label,
  children,
  empty,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  empty?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5',
        // Ayraç: sol 16px boşluklu hairline, son satırda yok
        'after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-border last:after:hidden',
        empty && 'opacity-60',
        className,
      )}
    >
      <dt className="shrink-0 text-[15px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-[15px] break-words">{children}</dd>
    </div>
  );
}
