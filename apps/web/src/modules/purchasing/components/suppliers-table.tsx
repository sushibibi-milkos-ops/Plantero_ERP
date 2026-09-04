'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { Building2 } from 'lucide-react';
import { setSupplierWhitelistAction } from '../actions';
import type { SupplierCardRow } from '../queries';

export function SuppliersTable({ suppliers, canManageWhitelist }: { suppliers: SupplierCardRow[]; canManageWhitelist: boolean }) {
  if (!suppliers.length) {
    return <EmptyState icon={Building2} title="Tedarikçi yok" description="Ana veri'den tedarikçi tanımlayın." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {suppliers.map((s) => (
        <SupplierCard key={s.id} supplier={s} canManageWhitelist={canManageWhitelist} />
      ))}
    </div>
  );
}

function SupplierCard({ supplier, canManageWhitelist }: { supplier: SupplierCardRow; canManageWhitelist: boolean }) {
  const [whitelisted, setWhitelisted] = useState(supplier.isPurchaseWhitelisted);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setWhitelisted(next);
    startTransition(async () => {
      const res = await setSupplierWhitelistAction({ supplierId: supplier.id, whitelisted: next });
      if (res.ok) toast.success(`${supplier.name}: beyaz liste ${next ? 'açıldı' : 'kapatıldı'}`);
      else {
        setWhitelisted(!next);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{supplier.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{supplier.code}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-border/60 pt-3 text-center">
        <div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.leadTimeDays ?? '—'}</div>
          <div className="text-[11px] text-muted-foreground uppercase">Lead time</div>
        </div>
        <div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.qualityScore ? `${Math.round(Number(supplier.qualityScore))}` : '—'}</div>
          <div className="text-[11px] text-muted-foreground uppercase">Kalite skoru</div>
        </div>
        <div>
          <div
            className={`font-mono text-sm font-semibold tabular-nums ${
              supplier.onTimeDeliveryPct === null ? '' : supplier.onTimeDeliveryPct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : supplier.onTimeDeliveryPct >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
            }`}
            title={supplier.deliveryCount > 0 ? `Son ${supplier.deliveryCount} mal kabul` : 'Henüz mal kabul yok'}
          >
            {supplier.onTimeDeliveryPct === null ? '—' : `%${supplier.onTimeDeliveryPct}`}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase">Zamanında</div>
        </div>
        <div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.productCount}</div>
          <div className="text-[11px] text-muted-foreground uppercase">Ürün</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[13px]">
        <span className="text-muted-foreground">{supplier.openPoCount} açık sipariş</span>
        <MoneyCell value={supplier.openPoValue} />
      </div>

      {canManageWhitelist ? (
        <label className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[13px]">
          <span>Satın alma beyaz listesi</span>
          <Switch checked={whitelisted} onCheckedChange={toggle} disabled={pending} />
        </label>
      ) : (
        <div className="border-t border-border/60 pt-3 text-[13px] text-muted-foreground">
          {whitelisted ? 'Beyaz listede' : 'Beyaz listede değil'}
        </div>
      )}
    </div>
  );
}
