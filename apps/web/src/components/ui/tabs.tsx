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
  "group/tabs-list relative inline-flex w-fit max-w-full items-center justify-center overflow-x-auto rounded-[10px] p-0.5 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden group-data-[orientation=horizontal]/tabs:h-auto group-data-[orientation=horizontal]/tabs:md:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        // iOS segmented control: gri kapsül (tertiary fill), seçili parça beyaz ve KAYAR (aşağıdaki gösterge)
        default: "bg-fill",
        // `line` (belge içi sekme şeritleri) da artık aynı iOS segmented görünümünde; modüllerin
        // `gap-6 border-b` gibi çizgi-sekme sınıfları `!` ile etkisizleştirilir (modül dosyalarına dokunmadan).
        line: "gap-0.5! border-0! bg-fill",
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
  children,
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
  // Segmented control göstergesi: seçili sekmenin ölçüsü. `shown`: gösterge ilk ölçümden sonra
  // görünür (öncesinde seçili sekmenin kendi zemini devrede — SSR/ilk boyama boş kalmaz);
  // `animate`: ilk konumlandırma animasyonsuz, sonraki seçimler kayarak gider.
  const [ind, setInd] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [animate, setAnimate] = React.useState(false)
  const updateEdge = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdge({ left: el.scrollLeft > 1, right: max > 1 && el.scrollLeft < max - 1 })
  }, [])
  const measure = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]')
    if (!active) {
      setInd(null)
      return
    }
    setInd((prev) => {
      const next = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
      return prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next
    })
  }, [])
  React.useEffect(() => {
    updateEdge()
    measure()
    const el = ref.current
    if (!el) return
    const raf = requestAnimationFrame(() => setAnimate(true))
    const mo = new MutationObserver(measure)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ["data-state"] })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateEdge()
        measure()
      })
      ro.observe(el)
      el.querySelectorAll('[data-slot="tabs-trigger"]').forEach((n) => ro!.observe(n))
    }
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      ro?.disconnect()
    }
  }, [updateEdge, measure])

  return (
    <div className="relative min-w-0">
      <TabsPrimitive.List
        ref={ref}
        onScroll={updateEdge}
        data-slot="tabs-list"
        data-variant={variant}
        data-ready={ind ? "true" : "false"}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      >
        {ind ? (
          <span
            aria-hidden
            data-slot="tabs-indicator"
            className={cn(
              "pointer-events-none absolute top-0 left-0 rounded-[8px] bg-card shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0.5px_1px_rgb(0_0_0/0.08)] dark:bg-[oklch(0.46_0.004_286)]",
              animate && "transition-[transform,width,height] duration-[250ms] ease-drawer"
            )}
            style={{ width: ind.w, height: ind.h, transform: `translate(${ind.x}px, ${ind.y}px)` }}
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
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
        // iOS segmented: iki varyant (default/line) da aynı görünür; seçili parçayı list içindeki kayan
        // gösterge taşır (data-ready), öncesinde sekmenin kendi zemini devrede.
        // h-11 (mobil) / md:h-[calc(100%-1px)] (masaüstü, eski davranış): dokunma hedefi önceden
        // 28px'e (üstündeki TabsList'in h-9'undan pay alıyordu) düşüyordu — 44px'in çok altında,
        // üstelik bu sekmeler ürün/cari/reçete detayının BİRİNCİL gezinmesi (Tur 10 P1 shell-tabs-touch-01).
        "relative z-[1] inline-flex h-11 shrink-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-transparent px-3.5 py-1 text-sm font-medium whitespace-nowrap text-foreground/65 transition-[color,background-color,box-shadow] duration-150 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 md:h-full",
        // Seçili: gösterge (list) zemin görevini üstlenince (data-ready) sekmenin kendi zemini şeffaf.
        "data-[state=active]:text-foreground data-[state=active]:bg-card data-[state=active]:shadow-[0_3px_8px_rgb(0_0_0/0.12)] dark:data-[state=active]:bg-[oklch(0.46_0.004_286)] group-data-[ready=true]/tabs-list:data-[state=active]:bg-transparent! group-data-[ready=true]/tabs-list:data-[state=active]:shadow-none!",
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
