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
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none [&:active:not(:focus-visible)]:scale-[0.97] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // disabled: opacity yerine düz bg-muted/text-muted-foreground — bg-primary'nin %50 opaklığı
        // 2:1 kontrast veriyordu (WCAG AA eşiği 4,5:1); devre dışı olduğu artık renkle değil, "soluk yeşil
        // bozuk buton" değil düz gri ile anlaşılıyor.
        default: "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 disabled:opacity-50",
        // Zeminleri zaten background/transparan olduğu için opaklık düşüşü buralarda kontrastı AA eşiğinin altına düşürmüyor.
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50 disabled:opacity-50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 disabled:opacity-50",
        link: "text-primary underline-offset-4 hover:underline disabled:opacity-50",
      },
      size: {
        // h-11 md:h-9: 390px'te varsayılan boyut 36px'te kalıyordu — depo modülünün eldivenli/el
        // terminalli kullanım bağlamında (mal kabul, sevkiyat, transfer, sayım "Yeni …" ve "Kabul
        // et"/"Vazgeç" aksiyonları) WCAG 2.5.8/iOS 44px eşiğinin altına düşüyordu (Tur 5 P1 bulgusu).
        // Masaüstünde (md+) yoğun tablo/form ekranlarında 36px korunur — Linear kalıbı.
        default: "h-11 px-4 py-2 has-[>svg]:px-3 md:h-9",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
