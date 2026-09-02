import { Star } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export function PartnerQualityTab({ score }: { score: string | null }) {
  if (score === null) {
    return <EmptyState compact icon={Star} title="Kalite skoru yok" description="Kalite modülü tedarikçi denetimlerine göre otomatik hesaplayacak." />;
  }
  const n = Number(score);
  return (
    <div className="max-w-xs rounded-lg border border-border/70 bg-card p-4">
      <div className="text-[12px] tracking-wide text-muted-foreground uppercase">Tedarikçi kalite skoru</div>
      <div className="num mt-1 text-3xl font-semibold tabular-nums">{n.toFixed(0)}<span className="text-base text-muted-foreground">/100</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${n >= 80 ? 'bg-success' : n >= 50 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${Math.min(100, Math.max(0, n))}%` }} />
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">Kalite modülündeki mal kabul denetimleri ve red oranlarına göre otomatik güncellenir.</p>
    </div>
  );
}
