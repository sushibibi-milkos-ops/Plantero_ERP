'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Settings2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { updateAssumptionAction } from '../cashflow-actions';
import type { AssumptionRow, ChannelAssumptionRow } from '../cashflow-queries';
import { formatMoney, formatPct } from '@/lib/format';

const PCT_KEYS = new Set(['weighted_margin_pct', 'net_vat_pct', 'corporate_tax_rate', 'monthly_growth_pct', 'fixed_cost_increase_pct']);

function AssumptionField({ row }: { row: AssumptionRow }) {
  const router = useRouter();
  const [value, setValue] = useState(row.value);
  const [pending, startTransition] = useTransition();
  const isPct = PCT_KEYS.has(row.key);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={row.key} className="text-[13px] font-medium">{row.label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={row.key}
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              if (value === row.value || value.trim() === '') {
                setValue(row.value);
                return;
              }
              const n = Number(value.replace(',', '.'));
              if (!Number.isFinite(n)) {
                toast.error('Geçersiz sayı');
                setValue(row.value);
                return;
              }
              startTransition(async () => {
                const res = await updateAssumptionAction({ key: row.key, value: String(n) });
                if (res.ok) {
                  toast.success(`${row.label} güncellendi`);
                  router.refresh();
                } else {
                  toast.error(res.error);
                  setValue(row.value);
                }
              });
            }}
            className="pr-8 font-mono tabular-nums"
          />
          {isPct ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">%</span> : null}
        </div>
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>
      {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
    </div>
  );
}

export function AssumptionsDrawer({ assumptions, channels }: { assumptions: AssumptionRow[]; channels: ChannelAssumptionRow[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="size-3.5" />
          Varsayımlar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 px-5 py-4">
          <SheetTitle>Nakit akışı varsayımları</SheetTitle>
          <SheetDescription>Değişiklik anında tüm projeksiyona yansır (36 ay).</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-5 py-5">
          {assumptions.map((a) => <AssumptionField key={a.key} row={a} />)}

          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-3 text-[13px] font-semibold">Kanal tablosu</h3>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] text-muted-foreground uppercase">
                    <th className="px-2.5 py-1.5 font-medium">Kanal</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Ciro</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Marj</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">Vade</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.channelId} className="border-b border-border/40 last:border-0">
                      <td className="px-2.5 py-1.5">{c.name}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{formatMoney(c.monthlyRevenue, 'TRY', { digits: 0 })}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{formatPct(c.contributionMarginPct, 0)}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{c.collectionLagMonths} ay</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Kanal tablosu şu an salt-okunur — kanal cirosunu değiştirmek için nakit akışı tablosundaki ilgili ay hücresini (mavi kenarlıklı) düzenleyin.</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
