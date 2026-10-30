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
    // artık yalnızca dokunma hedefidir (mobilde 44×44 — `max-md:min-h-11 max-md:min-w-[51px]`); görsel track/thumb kökten
    // ayrılıp içteki `<span>`'e taşındı, `group-data-*/switch` ile kökün `data-size`/`data-state`'ini
    // okur (Thumb zaten aynı deseni kullanıyordu). Masaüstünde kök hâlâ içeriğine göre sarar (36×20/
    // 24×14) — hiçbir görsel/davranış farkı yok, yalnızca mobil hit-area büyüdü.
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-11 max-md:min-w-[51px]",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          // iOS anahtarı: 51×31 kapsül, 27px beyaz düğme (2px iç boşluk), açıkken Plantero yeşili.
          // Yalnızca gerçekten değişen özellikler animasyonlanır (bkz. button.tsx).
          "pointer-events-none flex shrink-0 items-center rounded-full border border-transparent transition-[background-color] duration-200",
          "group-data-[size=default]/switch:h-[31px] group-data-[size=default]/switch:w-[51px] group-data-[size=sm]/switch:h-[24px] group-data-[size=sm]/switch:w-[40px]",
          "group-data-[state=checked]/switch:bg-primary group-data-[state=unchecked]/switch:bg-[oklch(0.9_0.003_286)] dark:group-data-[state=unchecked]/switch:bg-[oklch(0.36_0.004_286)]"
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.22),0_0_0_0.5px_rgb(0_0_0/0.04)] ring-0 transition-transform duration-[250ms] ease-drawer group-data-[size=default]/switch:size-[27px] group-data-[size=sm]/switch:size-5 group-data-[size=default]/switch:data-[state=checked]:translate-x-[22px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-0.5 group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0.5"
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
