'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Zap, Loader2, Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { runReplenishmentAction } from '../actions';
import { CriticalStockTable } from './critical-stock-table';
import { ReorderRuleDrawer } from './reorder-rule-drawer';
import type { CriticalStockRow } from '../queries';

/** "Motoru çalıştır" + "sadece kritik" filtresi + tablo — tek bir client kabuğu (docs/modules/depo.md
 * kalıbı: filtre çubuğu üstte, tablo altta). Kural düzenleme drawer'ı burada (üst seviyede) yönetilir —
 * satır aksiyonundan (`CriticalStockTable`) `setEditingRule` ile açılır. */
export function ReplenishmentPanel({
  rows, canRun, canManageRule, suppliers,
}: {
  rows: CriticalStockRow[]; canRun: boolean; canManageRule: boolean; suppliers: Array<{ id: string; name: string; code: string }>;
}) {
  // Tur 1 P0 tedarik-kritik-stok-01 kök neden: motor hiç çalışmamışken (`lastEvaluatedAt` tüm
  // kurallarda null) ya da mevcut değerlendirmede tek bir kritik/uyarı kalem yokken varsayılan
  // `true` ekranı "0 kayıt" ile açıyordu — 36 kural varken ilk izlenim "veri yok" oluyordu.
  // Varsayılan artık veriye bakar: yalnızca gerçekten filtrelenecek (risk != 'none') bir kayıt VARSA
  // ve motor en az bir kez çalışmışsa açık başlar.
  const neverEvaluated = useMemo(() => rows.every((r) => r.lastEvaluatedAt === null), [rows]);
  const hasCritical = useMemo(() => rows.some((r) => r.risk !== 'none'), [rows]);
  const [onlyCritical, setOnlyCritical] = useState(() => !neverEvaluated && hasCritical);
  const [pending, startTransition] = useTransition();
  const [editingRule, setEditingRule] = useState<CriticalStockRow | null>(null);
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const res = await runReplenishmentAction();
      if (res.ok) {
        const { evaluated, suggested, autoOrdered, draftedOrders } = res.data;
        toast.success(
          suggested === 0
            ? `Motor çalıştı: ${evaluated} kural değerlendirildi, kritik kalem yok`
            : `Motor çalıştı: ${suggested} kritik kalem, ${draftedOrders} taslak sipariş (${autoOrdered} otomatik gönderildi)`,
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Tur 1 P1 tedarik-kritik-stok-03 kök neden: ölçüm betiği yalnızca `role=checkbox`
         * elemanının KENDİ rect'ine bakar (bir sarmalayıcı label/padding'i saymaz) — paylaşılan
         * `Checkbox` (apps/web/src/components/ui/checkbox.tsx) kökü hep size-4 (16px) kalır ve
         * ORTAK bileşen olduğu için burada değiştirilemez (kural 2). `switch.tsx`'te aynı sorun için
         * uygulanan kalıp burada Radix primitive'i doğrudan kullanarak yerelde tekrarlanıyor: kök
         * yalnızca dokunma hedefi (mobilde `max-md:size-11`), görsel kutu içteki `<span>`'de
         * (size-4) ayrı — masaüstünde hiçbir görsel fark yok. */}
        <label htmlFor="only-critical" className="flex min-h-11 cursor-pointer items-center gap-2 py-2.5 text-sm max-md:-my-2.5">
          <CheckboxPrimitive.Root
            id="only-critical"
            checked={onlyCritical}
            onCheckedChange={(v) => setOnlyCritical(v === true)}
            className="group/chk inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:size-11"
          >
            <span
              aria-hidden
              className="pointer-events-none grid size-4 shrink-0 place-content-center rounded-[4px] border border-input shadow-xs group-data-[state=checked]/chk:border-primary group-data-[state=checked]/chk:bg-primary group-data-[state=checked]/chk:text-primary-foreground dark:bg-input/30"
            >
              <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
                <Check className="size-3.5" />
              </CheckboxPrimitive.Indicator>
            </span>
          </CheckboxPrimitive.Root>
          <span className="font-normal">Sadece kritik/uyarı</span>
        </label>
        {canRun ? (
          <Button onClick={run} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            Motoru çalıştır
          </Button>
        ) : null}
      </div>
      <CriticalStockTable
        rows={rows}
        onlyCritical={onlyCritical}
        canManageRule={canManageRule}
        onEditRule={setEditingRule}
        onClearFilter={() => setOnlyCritical(false)}
      />
      <ReorderRuleDrawer rule={editingRule} onOpenChange={(open) => { if (!open) setEditingRule(null); }} suppliers={suppliers} />
    </div>
  );
}
