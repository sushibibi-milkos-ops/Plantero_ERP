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
        'flex items-center justify-end gap-2 border-t border-border pt-4',
        // Mobilde alt tab bar'ın üstünde yapışkan (bottom-16) — "Kaydet" hep görünür kalır (Tur 1
        // bulgusu: md:static'te uzun formlarda düğme gözden kayboluyordu). Masaüstünde ise md:static:
        // Tur 2-4 P0 bulgusu — md:bottom-0 sticky, kısa/orta boy formlarda (form içeriği toplam
        // sayfa yüksekliğine göre erken "yapışıyor") kendi doğal konumundan önce görsel olarak
        // önceki alan satırlarının üstüne biniyordu (ör. `pnpm shot` tam sayfa yakalamasında Ambalaj
        // satırını ortadan kesiyordu — sticky+bottom:0 elemanların CDP tam sayfa yakalamasında bilinen
        // bir tuzağı). Masaüstünde geniş boşluk zaten var; düğme formun gerçek sonunda, akışta durur.
        // z-20 + tam opak arka plan + ince gölge: mobildeki yapışkan halde altındaki içerik hiçbir
        // zaman sızmasın (Tur 2 bulgusu — önceki `/95` yarı saydamdı, z-index de tanımsızdı).
        sticky &&
          'sticky bottom-16 -mx-4 z-20 bg-background px-4 pb-3 shadow-[0_-1px_2px_rgb(0_0_0/0.04)] md:static md:bottom-auto md:z-auto md:mx-0 md:px-0 md:pb-0 md:shadow-none',
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
