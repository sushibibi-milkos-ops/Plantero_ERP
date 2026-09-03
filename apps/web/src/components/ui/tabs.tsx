"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // Tur 10 P1 shell-tabs-touch-01: mobilde (md altı) liste artık `h-auto` — 44px'lik TabsTrigger'ı
  // 36px'e sıkıştırmaz; masaüstünde `md:h-9` eski kompakt yüksekliği korur. `max-w-full overflow-x-auto`:
  // taşan sekme sayısı (ör. cari detayında 7 sekme, 677.5px > 390px viewport) artık DIŞARIYA (app-shell'in
  // `overflow-x-clip`'i tarafından sessizce kırpılıp erişilemez hale gelen) değil, LİSTENİN KENDİSİNE
  // taşar — dokunarak/sürükleyerek kaydırılabilir olur (bkz. TabsList altındaki kaydırma ipucu overlay'i).
  "group/tabs-list relative inline-flex w-fit max-w-full items-center justify-center overflow-x-auto rounded-lg p-[3px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-[orientation=horizontal]/tabs:h-auto group-data-[orientation=horizontal]/tabs:md:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const ref = React.useRef<HTMLDivElement>(null)
  // Kaydırma ipucu: sağda/solda daha fazla sekme varken ince bir iç gölge belirir, kaydırıldıkça
  // kaybolur (Tur 10 P1 — önceden hiçbir görsel ipucu yoktu, son sekmeler "hiç yokmuş" gibi
  // görünüyordu). `background-color`'a bağlı `scroll-fade-x` ile aynı işi yapmak yerine `box-shadow`
  // kullanılır: TabsList sayfa zemininde de kart zemininde de durabiliyor (product-detail-tabs.tsx,
  // work-order-tabs.tsx, lotlar/[id]) — gölge hangi zeminin üstünde olursa olsun eşit çalışır, `scroll-
  // fade-x`'in aksine çağıran başına `--scroll-fade-bg` eşleştirmesi gerekmez.
  const [edge, setEdge] = React.useState({ left: false, right: false })
  const updateEdge = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdge({ left: el.scrollLeft > 1, right: max > 1 && el.scrollLeft < max - 1 })
  }, [])
  React.useEffect(() => {
    updateEdge()
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(updateEdge)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateEdge])

  return (
    <div className="relative min-w-0">
      <TabsPrimitive.List
        ref={ref}
        onScroll={updateEdge}
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
      {edge.left ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-4 shadow-[inset_10px_0_8px_-8px_rgba(0,0,0,0.16)] dark:shadow-[inset_10px_0_8px_-8px_rgba(0,0,0,0.5)]" />
      ) : null}
      {edge.right ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-4 shadow-[inset_-10px_0_8px_-8px_rgba(0,0,0,0.16)] dark:shadow-[inset_-10px_0_8px_-8px_rgba(0,0,0,0.5)]" />
      ) : null}
    </div>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // transition-all yerine yalnızca renk/arka plan/gölge (bkz. button.tsx/switch.tsx aynı gerekçe).
        // group-data-[variant=line]/tabs-list:flex-none: "line" varyantı (doküman içi sekmeler,
        // ör. iş emri detayının Malzemeler/Tüketimler/… şeridi) sola dayalı olmalı — `flex-1` her
        // sekmeyi eşit esnetip geniş ekranlarda 200px+'lik boşluklara yayıyordu (Linear/Stripe
        // sekmeleri sola dayalı, TabsList'in `gap-*` sınıfıyla 24-32px aralıklıdır). Varsayılan
        // (pill) varyant flex-1'i korur.
        // h-11 (mobil) / md:h-[calc(100%-1px)] (masaüstü, eski davranış): dokunma hedefi önceden
        // 28px'e (üstündeki TabsList'in h-9'undan pay alıyordu) düşüyordu — 44px'in çok altında,
        // üstelik bu sekmeler ürün/cari/reçete detayının BİRİNCİL gezinmesi (Tur 10 P1 shell-tabs-touch-01).
        "relative inline-flex h-11 shrink-0 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-[color,background-color,box-shadow] duration-150 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none group-data-[variant=line]/tabs-list:flex-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 md:h-[calc(100%-1px)]",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
