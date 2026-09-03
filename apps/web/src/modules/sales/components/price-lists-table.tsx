'use client';

import { useMemo, useState } from 'react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { PriceListDrawer } from './price-list-drawer';
import { formatDate } from '@/lib/format';
import type { listPriceListsWithCounts, SellableProductRow } from '../queries';

type Row = Awaited<ReturnType<typeof listPriceListsWithCounts>>[number];

export function PriceListsTable({ rows, products }: { rows: Row[]; products: SellableProductRow[] }) {
  // Drawer tek örnek olarak yukarı taşındı: "Satırlar (33)" hem sayaç hem kalıcı çerçeveli eylem
  // düğmesiydi — artık düz sağa hizalı rakam, açma eylemi satır tıklamasına devredildi.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        // Liste kodu (IHRACAT/PERAKENDE/TOPTAN) satır içi mono çip olmaktan çıkarıldı (Tur 5 P1
        // bulgusu): ad uzunlukları farklı olan satırlarda çipler üç ayrı x'te başlayıp sütunu
        // tırtıklı okutuyordu — artık kendi 110px'lik sütununda, tek bir x'te hizalı.
        // Tur 10 P1 satis-fiyat-01 (kök: shell-datatable-slack-01): sabit width kaldırılıp `flex:true`
        // verildi — artan genişlik artık meta.width'i olmayan 'Geçerlilik' sütununa değil (393px ölü
        // alan) kasıtlı olarak büyümesi istenen 'Liste' adı sütununa akar.
        id: 'name', accessorFn: (r) => r.name, header: 'Liste', meta: { flex: true, mobile: 'title' },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        // Tur 10 P2 satis-fiyat-03: mobil karttaki tek meta ipucu para birimiydi, ama liste adı zaten
        // parantez içinde para birimini taşıyor ("İhracat Fiyat Listesi (EUR)") — kart aynı bilgiyi
        // iki kez basıyordu. Kod (masaüstünde zaten gösterilen kimlik alanı) daha yeni bilgi taşır.
        id: 'code', accessorFn: (r) => r.code, header: 'Kod', meta: { width: 110, className: 'font-mono text-[11px] text-muted-foreground', mobile: 'meta' },
      },
      // Boş "Kanal" sütunu kaldırıldı (Tur 5 P1 bulgusu): 3 fiyat listesinin 3'ü de tek bir kanala
      // değil, bir kanal GRUBUNA bağlı (channel_id null) — sütun ~370px kaplayıp 3 satırın 3'ünde de
      // '—' basıyordu, tablodaki en geniş sütun sıfır bilgi taşıyordu.
      { id: 'currency', accessorFn: (r) => r.currency, header: 'Para birimi', meta: { width: 100, className: 'font-mono text-xs', mobile: 'hidden' } },
      { id: 'includesVat', header: 'KDV', meta: { width: 80, mobile: 'hidden' }, cell: ({ row }) => (row.original.includesVat ? 'Dahil' : 'Hariç') },
      {
        id: 'validity', header: 'Geçerlilik', meta: { width: 150, mobile: 'hidden', className: 'text-xs text-muted-foreground' },
        cell: ({ row }) => (row.original.validFrom ? formatDate(row.original.validFrom) : 'Süresiz') + (row.original.validTo ? ` → ${formatDate(row.original.validTo)}` : ''),
      },
      {
        // Sayaç: düz sağa hizalı rakam (Linear deseni) — eylem satır tıklamasında.
        id: 'items', accessorFn: (r) => r.itemCount, header: 'Satır', meta: { align: 'right', width: 64, mobile: 'row' },
        cell: ({ row }) => <span className="num tabular-nums">{row.original.itemCount}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => setSelectedId(r.id)}
        searchPlaceholder="Liste adı, kod, kanal ara…"
        emptyTitle="Henüz fiyat listesi yok"
        emptyDescription="Kanal bazlı fiyat listesi seed ile yüklenir."
      />
      {selected ? (
        <PriceListDrawer
          listId={selected.id}
          listName={selected.name}
          currency={selected.currency}
          itemCount={selected.itemCount}
          products={products}
          open={selectedId !== null}
          onOpenChange={(v) => !v && setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
