"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Mobil (md altı): düğmenin kendisi 44x44 dokunma alanıdır, görünen kutu `after` ile 22px çizilir
        // (iOS onay kutusu); masaüstünde eski 18px kutu aynen kalır.
        "peer relative grid size-11 shrink-0 place-items-center rounded-full border-0 bg-transparent transition-[box-shadow,background-color] outline-none after:absolute after:size-[22px] after:rounded-[7px] after:border after:border-input after:bg-card after:transition-[background-color,border-color] data-[state=checked]:text-primary-foreground data-[state=checked]:after:border-primary data-[state=checked]:after:bg-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:after:border-destructive md:size-[18px] md:rounded-[6px] md:border md:border-input md:bg-card md:after:hidden md:aria-invalid:border-destructive md:aria-invalid:ring-destructive/20 md:data-[state=checked]:border-primary md:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
