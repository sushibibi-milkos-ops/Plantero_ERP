import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // transition-all yerine yalnızca renk/gölge/kenarlık + transform: `transition-all` içerik
  // değişince (ikon eklenip çıkması, sayaç güncellenmesi) genişlik/yükseklik gibi layout
  // özelliklerini de animasyonluyor ve gereksiz reflow/compositing maliyeti getiriyordu. `transform`
  // listede kalmalı — globals.css'teki `:active { transform: scale(0.97) }` basma efekti bu listeye
  // bağımlı (yoksa geçişsiz aniden küçülür).
  // Kök neden (shell-button-active-state-01, kriter 8): basma geri bildirimi eskiden YALNIZCA
  // globals.css'teki gövde-genelindeki `button:active` seçicisinden geliyordu — bileşenin kendi
  // sınıf listesinde `active:` yoktu, bu yüzden statik denetim (ve Button'ı taklit eden başka bir
  // etkileşimli yüzey) bunu "geri bildirimi yok" sayıyordu. Aynı seçici (`:active:not(:focus-visible)`)
  // burada AÇIKÇA tekrarlanır — Tur 4 P2'de Enter/Boşluk'la klavye aktivasyonunun da `:active`'i
  // tetikleyip gereksiz küçülme oynattığı bug'ı geri getirmemek için guard KORUNUR (çıplak
  // `active:scale-[0.97]` klavye akışını yeniden bozar).
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none [&:active:not(:focus-visible)]:scale-[0.97] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // iPadOS: dolgulu tint (kapsül). Basınca hafif koyulaşır (scale 0.97 globals.css + zemin).
        // disabled: opacity yerine düz bg-muted/text-muted-foreground — bg-primary'nin %50 opaklığı
        // 2:1 kontrast veriyordu (WCAG AA eşiği 4,5:1).
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/25 dark:text-destructive-foreground disabled:opacity-50",
        // "Tinted" (iOS): tint %15 zemin + tint metin — ikincil ama belirgin eylemler.
        tinted:
          "bg-primary/15 text-(--ink-primary) hover:bg-primary/20 active:bg-primary/25 disabled:opacity-50",
        // iOS'ta çerçeveli düğme yoktur; beyaz kapsül + hairline + ince gölge (kart zemini üstünde okunur).
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:bg-accent active:bg-accent dark:bg-secondary dark:hover:bg-secondary/80 disabled:opacity-50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60 disabled:opacity-50",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent disabled:opacity-50",
        link: "text-primary underline-offset-4 hover:underline disabled:opacity-50 rounded-md",
      },
      size: {
        // h-11 md:h-10: mobilde 44px dokunma hedefi (iOS HIG / WCAG 2.5.8); masaüstünde 40px.
        default: "h-11 px-5 py-2 has-[>svg]:px-4 md:h-10",
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 px-7 text-base has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
