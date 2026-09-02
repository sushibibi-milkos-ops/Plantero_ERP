'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Form altı eylem şeridi: Kaydet + Vazgeç; mobilde yapışkan */
export function FormActions({
  submitLabel = 'Kaydet',
  cancelLabel = 'Vazgeç',
  onCancel,
  pending,
  disabled,
  sticky = true,
  children,
  className,
}: {
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  pending?: boolean;
  disabled?: boolean;
  sticky?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-border/60 pt-4',
        sticky && 'sticky bottom-16 -mx-4 bg-background/90 px-4 pb-3 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:backdrop-blur-none',
        className,
      )}
    >
      {children}
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" disabled={pending || disabled}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
