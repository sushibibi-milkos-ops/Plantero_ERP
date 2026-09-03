import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // h-11 md:h-9: 390px'te 36px dokunma hedefi WCAG 2.5.8/iOS eşiğinin altındaydı — combobox.tsx
        // ve date-field.tsx'teki aynı deseni (Tur 2) buraya da uygular (Tur 3 bulgusu, P1): aynı
        // formda 44px açılır liste ile 36px sayı kutusu yan yana tutarsız duruyordu.
        "h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30",
        // Tek halka: `border-ring` + `ring` birlikte odaklı alanda çift daire oluşturuyordu
        // (Tur 2 bulgusu) — Linear tek ince halka kullanır, border rengi sabit kalır.
        "focus-visible:ring-[2px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
