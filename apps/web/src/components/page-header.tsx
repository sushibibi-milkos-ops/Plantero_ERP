import { cn } from '@/lib/utils';

/**
 * Sayfa başlığı: başlık + açıklama solda, eylemler sağda.
 * Mobilde eylemler alt satıra iner ve tam genişlik alır.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Başlığın üstünde küçük etiket (örn. belge no) */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Başlık altına ek şerit (sekmeler, filtreler) */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mb-5 md:mb-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div> : null}
          <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
          {/* <p> DEĞİL: yükleniyor iskeletleri description'a <Skeleton/> (bir <div>) geçiriyor —
              <div>, <p> içinde geçersiz HTML + hydration hatası üretiyordu (Tur 10 P1). Tipografi
              aynı kalır, yalnızca sarmalayıcı etiket değişti. */}
          {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
