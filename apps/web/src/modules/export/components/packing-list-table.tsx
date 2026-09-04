import { formatQty } from '@/lib/format';
import { LotBadge } from '@/components/lot-badge';
import { EmptyState } from '@/components/empty-state';
import { Package } from 'lucide-react';
import type { getShipmentDetail } from '../queries';

type Packages = NonNullable<Awaited<ReturnType<typeof getShipmentDetail>>>['packages'];

/** Çeki listesi (packing list): kap/koli bazında ürün+lot+ağırlık+GTİP — `buildPackingList`'in ürettiği taslak. */
export function PackingListTable({ packages }: { packages: Packages }) {
  if (packages.length === 0) {
    return <EmptyState compact icon={Package} title="Çeki listesi henüz kurulmadı" description="Sevkiyat bir irsaliyeye bağlandıktan sonra “Çeki listesi oluştur” ile üretilir." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2 font-medium">Kap no</th>
            <th className="px-3 py-2 font-medium">Ürün</th>
            <th className="px-3 py-2 font-medium">Lot</th>
            <th className="px-3 py-2 text-right font-medium">Miktar</th>
            <th className="px-3 py-2 font-medium">GTİP</th>
            <th className="px-3 py-2 text-right font-medium">Net kg</th>
            <th className="px-3 py-2 text-right font-medium">Brüt kg</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p) => (
            <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
              <td className="px-3 py-2.5 font-mono tabular-nums text-muted-foreground">#{p.packageNo}</td>
              <td className="px-3 py-2.5">
                <div className="font-medium">{p.productName}</div>
                <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
              </td>
              <td className="px-3 py-2.5">{p.lotId ? <LotBadge lotNo={p.lotNo} status={p.lotStatus} id={p.lotId} /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatQty(p.qty)}</td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{p.hsCode ?? '—'}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{p.netWeightKg ? formatQty(p.netWeightKg) : '—'}</td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{p.grossWeightKg ? formatQty(p.grossWeightKg) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
