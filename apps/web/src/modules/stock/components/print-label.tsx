'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

export type LabelPayload =
  | { kind: 'lot'; lotNo: string; qrText: string; productName: string; sku: string; expiryDate: string | null; qty: string; uom: string; supplierLotNo: string | null }
  | { kind: 'location'; code: string; qrText: string; name: string; warehouseCode: string | null };

export function PrintLabel({ label }: { label: LabelPayload }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(label.qrText, { type: 'svg', margin: 0, width: 220 }).then((s) => {
      if (alive) setSvg(s);
    });
    return () => {
      alive = false;
    };
  }, [label.qrText]);

  return (
    <div className="mx-auto max-w-sm py-6">
      <style>{`
        @media print {
          @page { size: 105mm 148mm; margin: 4mm; }
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Etiket önizleme</h1>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Yazdır
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-foreground/80 bg-white p-5 text-black">
        {svg ? <div className="[&>svg]:size-40" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="size-40 animate-pulse rounded bg-black/5" />}

        {label.kind === 'lot' ? (
          <div className="w-full space-y-1 text-center">
            <div className="truncate text-base font-semibold">{label.productName}</div>
            <div className="text-xs text-black/60">{label.sku}</div>
            <div className="mt-2 font-mono text-lg font-bold tracking-wide">{label.lotNo}</div>
            {label.supplierLotNo ? <div className="text-xs text-black/60">Tedarikçi lotu: {label.supplierLotNo}</div> : null}
            <div className="mt-2 flex items-center justify-center gap-4 text-sm">
              <span>{label.qty} {label.uom}</span>
              {label.expiryDate ? <span className="font-medium">SKT: {formatDate(label.expiryDate)}</span> : null}
            </div>
          </div>
        ) : (
          <div className="w-full space-y-1 text-center">
            <div className="font-mono text-xl font-bold tracking-wide">{label.code}</div>
            <div className="text-sm text-black/70">{label.name}</div>
            {label.warehouseCode ? <div className="text-xs text-black/50">{label.warehouseCode}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
