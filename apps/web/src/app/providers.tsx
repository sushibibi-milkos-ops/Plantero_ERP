'use client';

import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300} skipDelayDuration={600}>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
