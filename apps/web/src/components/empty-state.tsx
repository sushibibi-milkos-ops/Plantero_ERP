import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Boş durum: ikon + başlık + açıklama + opsiyonel eylem. `compact` tablo içi kullanım. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        // Kök neden (shell-emptystate-compact-height-01, kriter 3): `py-10` (40px üst+alt) kart içi
        // boş durumu 257-277px'e çıkarıyordu — kokpitin katlama-üstü satır sayısını (foldRows) hedefin
        // (≥15) altına düşürüyordu (admin 11, muhasebe 12, üretim şefi 13). `py-6` (24px) + `size-8`
        // ikon yüksekliği ≤160px'e indirir, üç modülün de aynı kök nedenle tıkanan foldRows'unu açar.
        compact ? 'gap-2 px-4 py-6' : 'gap-3 rounded-xl border border-dashed px-6 py-16',
        className,
      )}
    >
      <div
        className={cn(
          'grid place-items-center rounded-full bg-muted text-muted-foreground',
          compact ? 'size-8' : 'size-12',
        )}
      >
        <Icon className={compact ? 'size-4' : 'size-5'} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <div className={cn('font-medium', compact ? 'text-sm' : 'text-base')}>{title}</div>
        {description ? <div className="mx-auto max-w-sm text-[13px] text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
