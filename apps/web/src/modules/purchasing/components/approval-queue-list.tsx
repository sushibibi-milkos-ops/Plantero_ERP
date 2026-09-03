'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime } from '@/lib/format';
import { approvePurchaseOrderAction, rejectPurchaseOrderAction } from '../actions';
import type { ApprovalQueueRow } from '../queries';

export function ApprovalQueueList({ items }: { items: ApprovalQueueRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!items.length) {
    return <EmptyState icon={Sparkles} title="Onay bekleyen taslak yok" description="Kritik stok motoru yeni bir taslak önerdiğinde burada görünür." />;
  }

  async function approve(orderId: string) {
    setBusyId(orderId);
    const res = await approvePurchaseOrderAction({ id: orderId });
    setBusyId(null);
    if (res.ok) toast.success('Taslak onaylandı');
    else toast.error(res.error);
  }

  async function reject(orderId: string) {
    setBusyId(orderId);
    const res = await rejectPurchaseOrderAction({ id: orderId, reason: null });
    setBusyId(null);
    if (res.ok) toast.success('Taslak reddedildi');
    else toast.error(res.error);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.approvalId} className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                <Link href={`/satin-alma/siparisler/${item.orderId}`} className="truncate font-mono text-sm font-medium hover:underline">{item.docNo}</Link>
              </div>
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{item.partnerName} · {item.lineCount} kalem</div>
            </div>
            <MoneyCell value={item.grandTotal} className="shrink-0 text-base font-semibold" />
          </div>

          {item.aiRationale ? <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.aiRationale}</p> : null}

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}{item.aiConfidence ? ` · %${Math.round(Number(item.aiConfidence) * 100)} güven` : ''}</span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busyId === item.orderId} onClick={() => reject(item.orderId)}>
                <XCircle className="size-3.5" /> Reddet
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/satin-alma/siparisler/${item.orderId}`}>Düzenle <ArrowRight className="size-3.5" /></Link>
              </Button>
              <Button size="sm" disabled={busyId === item.orderId} onClick={() => approve(item.orderId)}>
                <CheckCircle2 className="size-3.5" /> Onayla
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
