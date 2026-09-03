"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    // Tur 10 P1 shell-form-switch-01 kök neden: ölçüm betiği yalnızca `role=switch` elemanının KENDİ
    // rect'ine bakar (bir sarmalayıcı label/padding'i saymaz) — track her zaman 32×18.4 kaldığı için
    // "satırın tamamı tıklanabilir" bir dış çözüm bunu ASLA kapatmaz. Kök (`SwitchPrimitive.Root`)
    // artık yalnızca dokunma hedefidir (mobilde 44×44 — `max-md:size-11`); görsel track/thumb kökten
    // ayrılıp içteki `<span>`'e taşındı, `group-data-*/switch` ile kökün `data-size`/`data-state`'ini
    // okur (Thumb zaten aynı deseni kullanıyordu). Masaüstünde kök hâlâ içeriğine göre sarar (36×20/
    // 24×14) — hiçbir görsel/davranış farkı yok, yalnızca mobil hit-area büyüdü.
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 max-md:size-11",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          // transition-all yerine yalnızca gerçekten değişen özellikler (transition-all diğer paylaşılan
          // bileşenlerde de gereksiz layout animasyonlarına yol açıyordu, bkz. button.tsx/tabs.tsx).
          "pointer-events-none flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-[background-color,box-shadow] duration-150",
          "group-data-[size=default]/switch:h-[1.15rem] group-data-[size=default]/switch:w-8 group-data-[size=sm]/switch:h-3.5 group-data-[size=sm]/switch:w-6",
          "group-data-[state=checked]/switch:bg-primary group-data-[state=unchecked]/switch:bg-input dark:group-data-[state=unchecked]/switch:bg-input/80"
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
