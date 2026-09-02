'use client';

import { useState, useTransition } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Onay diyaloğu. Kontrollü (`open`/`onOpenChange`) ya da `trigger` ile kontrolsüz.
 * `onConfirm` async olabilir; bekleme sırasında buton kilitlenir, hata diyalogda gösterilir.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  destructive = false,
  onConfirm,
  children,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void | { ok: boolean; error?: string }>;
  /** Ek içerik (örn. not alanı) */
  children?: React.ReactNode;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOpen = open ?? innerOpen;
  const setOpen = (v: boolean) => {
    setError(null);
    onOpenChange?.(v);
    if (open === undefined) setInnerOpen(v);
  };

  const confirm = () => {
    startTransition(async () => {
      try {
        const res = await onConfirm();
        if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
          setError(res.error ?? 'İşlem başarısız.');
          return;
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'İşlem başarısız.');
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="space-y-2">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full',
                destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
              )}
            >
              <AlertTriangle className="size-4" />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-base">{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </div>
          </div>
        </DialogHeader>
        {children ? <div>{children}</div> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={pending} autoFocus>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
