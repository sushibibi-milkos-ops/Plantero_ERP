'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { MoneyCell } from '@/components/money-cell';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { cn } from '@/lib/utils';
import { setSupplierWhitelistAction } from '../actions';
import type { SupplierCardRow } from '../queries';

/**
 * Tur 4 P1 tedarik-tedarikciler-08/09/10 kök neden: bu ekran modülün TEK liste ekranıydı ama kendi
 * kart ızgarasını (arama/filtre/sayaç YOK, kayıt başına ~58.000px²) elle çiziyordu — modülün geri
 * kalanı (`/satin-alma/kritik-stok`, `/satin-alma/siparisler`) zaten paylaşılan `DataTable`'ı
 * kullanıyor. Kök çözüm YENİ bir kart tasarımı İCAT ETMEK değil, ekranı da aynı ortak bileşene
 * taşımak: araç çubuğu (arama+filtre+sayaç), satır yoğunluğu (36px) ve tipografi (13px tek gövde
 * kademesi) otomatik gelir; "ayraçla başlayan sarılmış satır" (tedarikciler-10) sorunu da kendiliğinden
 * ortadan kalkar (artık flex-wrap bir metrik şeridi yok — tablo hücreleri).
 */
export function SuppliersTable({ suppliers, canManageWhitelist }: { suppliers: SupplierCardRow[]; canManageWhitelist: boolean }) {
  const columns = useMemo<ColumnDef<SupplierCardRow, unknown>[]>(
    () => [
      { id: 'name', accessorFn: (r) => r.name, header: 'Tedarikçi', meta: { width: 220, mobile: 'title' } },
      { id: 'code', accessorFn: (r) => r.code, header: 'Kod', meta: { width: 110, mobile: 'subtitle', className: 'font-mono text-xs' } },
      {
        // Beyaz liste hem bir FİLTRE hem bir sütun — değer 'true'/'false' (arrIncludesSome ile
        // eşleşen filtre seçenekleri), hücre canManageWhitelist'e göre ya Switch ya salt-okunur rozet.
        id: 'whitelisted', accessorFn: (r) => (r.isPurchaseWhitelisted ? 'true' : 'false'), header: 'Beyaz liste', meta: { width: 110, align: 'center', mobile: 'hidden', noSort: true },
        cell: ({ row }) => <WhitelistCell supplier={row.original} canManage={canManageWhitelist} />,
      },
      { accessorKey: 'leadTimeDays', header: 'Tedarik süresi', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.leadTimeDays !== null ? `${row.original.leadTimeDays} gün` : '—'}</span> },
      { accessorKey: 'qualityScore', header: 'Kalite', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.qualityScore ? `${Math.round(Number(row.original.qualityScore))}/100` : <span className="text-muted-foreground">—</span>}</span> },
      {
        accessorKey: 'onTimeDeliveryPct', header: 'Zamanında', meta: { align: 'right', width: 100, mobile: 'hidden' },
        cell: ({ row }) => {
          const v = row.original.onTimeDeliveryPct;
          return (
            <span
              title={row.original.deliveryCount > 0 ? `Son ${row.original.deliveryCount} mal kabul` : 'Henüz mal kabul yok'}
              className={cn(
                'font-mono text-[13px] tabular-nums',
                v === null ? 'text-muted-foreground' : v >= 90 ? 'text-success' : v >= 70 ? 'text-warning' : 'text-destructive',
              )}
            >
              {v === null ? '—' : `%${v}`}
            </span>
          );
        },
      },
      { accessorKey: 'productCount', header: 'Ürün', meta: { align: 'right', width: 80, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.productCount}</span> },
      { accessorKey: 'openPoCount', header: 'Açık sipariş', meta: { align: 'right', width: 100, mobile: 'meta' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.openPoCount}</span> },
      { accessorKey: 'openPoValue', header: 'Açık tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.openPoValue} muted={Number(row.original.openPoValue) === 0} /> },
    ],
    [canManageWhitelist],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'whitelisted', title: 'Beyaz liste', options: [{ value: 'true', label: 'Beyaz listede' }, { value: 'false', label: 'Beyaz listede değil' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={suppliers}
      getRowId={(r) => r.id}
      rowHref={(r) => `/ana-veri/cariler/${r.id}`}
      searchPlaceholder="Tedarikçi, kod ara…"
      filters={filters}
      initialSorting={[{ id: 'name', desc: false }]}
      emptyTitle="Tedarikçi yok"
      emptyDescription="Ana veri'den tedarikçi tanımlayın."
    />
  );
}

function WhitelistCell({ supplier, canManage }: { supplier: SupplierCardRow; canManage: boolean }) {
  const [whitelisted, setWhitelisted] = useState(supplier.isPurchaseWhitelisted);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <span className={cn('text-[13px]', whitelisted ? 'text-success' : 'text-muted-foreground')}>
        {whitelisted ? 'Evet' : 'Hayır'}
      </span>
    );
  }

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
    // Satır tıklanabilir (cari detayına gider) — switch'in kendi tıklaması satır navigasyonunu
    // TETİKLEMEMELİ (stopPropagation), aksi halde beyaz liste her değiştirildiğinde cari detayına
    // yönlenirdi (suppliers-table.tsx'in önceki kart sürümüyle aynı kök çözüm).
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Switch size="sm" checked={whitelisted} onCheckedChange={toggle} disabled={pending} aria-label={`${supplier.name} beyaz liste`} />
    </span>
  );
}
