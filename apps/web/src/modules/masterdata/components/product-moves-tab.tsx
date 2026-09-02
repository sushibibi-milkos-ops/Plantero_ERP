import { LotBadge } from '@/components/lot-badge';
import { QtyCell } from '@/components/qty-cell';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { formatDateTime } from '@/lib/format';

const KIND_LABELS: Record<string, string> = {
  receipt: 'Mal kabul', delivery: 'Sevkiyat', consumption: 'Tüketim (iş emri)', production: 'Üretim çıktısı',
  byproduct: 'Yan ürün', transfer: 'Transfer', count_gain: 'Sayım fazlası', count_loss: 'Sayım eksiği',
  scrap: 'Fire', opening: 'Açılış', return_in: 'Müşteri iadesi', return_out: 'Tedarikçiye iade',
  quarantine_release: 'Karantina → serbest', quarantine_reject: 'Karantina → red', recall_return: 'Geri çağırma iadesi',
};

export type MoveRow = {
  m: { id: string; moveNo: string; kind: string; qty: string; unitCost: string; value: string; movedAt: string; refType: string; refNo: string | null; uomId: string };
  fromCode: string | null;
  toCode: string | null;
  lotNo: string | null;
};

export function ProductMovesTab({ rows, uomCode }: { rows: MoveRow[]; uomCode: string }) {
  if (rows.length === 0) return <EmptyState compact title="Hareket yok" description="Bu ürün için henüz bir stok hareketi kaydedilmedi." />;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-[12px] whitespace-nowrap text-muted-foreground">
              <th className="h-9 px-3 text-left font-medium">Tarih</th>
              <th className="h-9 px-3 text-left font-medium">Hareket No</th>
              <th className="h-9 px-3 text-left font-medium">Tür</th>
              <th className="h-9 px-3 text-left font-medium">Kaynak → Hedef</th>
              <th className="h-9 px-3 text-left font-medium">Lot</th>
              <th className="h-9 px-3 text-right font-medium">Miktar</th>
              <th className="h-9 px-3 text-right font-medium">Değer</th>
              <th className="h-9 px-3 text-left font-medium">Belge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.id} className="h-9 border-b border-border/50 whitespace-nowrap last:border-0">
                <td className="px-3 text-muted-foreground">{formatDateTime(r.m.movedAt)}</td>
                <td className="px-3 font-mono text-[12px]">{r.m.moveNo}</td>
                <td className="px-3">{KIND_LABELS[r.m.kind] ?? r.m.kind}</td>
                <td className="px-3 font-mono text-[11px] text-muted-foreground">
                  {r.fromCode ?? '—'} → {r.toCode ?? '—'}
                </td>
                <td className="px-3">
                  <LotBadge lotNo={r.lotNo} />
                </td>
                <td className="px-3">
                  <QtyCell value={r.m.qty} uom={uomCode} />
                </td>
                <td className="px-3">
                  <MoneyCell value={r.m.value} />
                </td>
                <td className="px-3 text-muted-foreground">{r.m.refNo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
