'use client';

import { Toaster as SonnerToaster } from '@/components/ui/sonner';

/** Tek örnek: kök layout'ta bir kez konur; her yerden `toast()` çağrılır. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      duration={3500}
      toastOptions={{
        classNames: {
          toast: 'text-[13px] rounded-[14px] border-border/50 backdrop-blur-2xl shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.28)]',
          description: 'text-muted-foreground',
        },
      }}
    />
  );
}
