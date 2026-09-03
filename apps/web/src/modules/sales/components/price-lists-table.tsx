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
        //
        // Tur 11 P2 satis-fiyat-06: `flex:true` ölü alanı YOK ETMEDİ, TAŞIDI — artan genişlik hâlâ
        // 'Liste'de toplanıyordu (645px, en uzun içerik ≈300px → ~345px boşluk), yalnızca hangi
        // sütunda biriktiği değişmişti (satis-kanallar-03 ile aynı kök neden — `flex:true` üst SINIR
        // koymaz, yalnızca DİĞER width'siz sütunları sıkıştırır). Sabit `meta.width` + eşleşen içerik
        // `max-w-[…] truncate` üst sınırı gerçekten kurar (bkz. channels-table.tsx 'Kanal' ile aynı
        // düzeltme — kanallar-03 kapatılırken doğrulanan teknik).
        id: 'name', accessorFn: (r) => r.name, header: 'Liste', meta: { width: 380, mobile: 'title', className: 'max-w-[380px] truncate' },
        cell: ({ row }) => <span className="block max-w-[380px] truncate font-medium" title={row.original.name}>{row.original.name}</span>,
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
        //
        // Tur 11 P2 satis-fiyat-05 (kök neden): `mobile:'row'` mobile-cards.tsx'in özel rollerinden
        // (title/subtitle/badge/meta) biri DEĞİL — bu sütun sessizce `rest`e düşüyor ve tabloda TEK
        // `rest` alanı olduğu için mobil kartın TEK metrik yuvasını dolduruyor, ama `cell` masaüstünde
        // "Satır" başlığının altında anlamlı olan ÇIPLAK sayıyı basıyor (mobilde başlık yok — "33" ne
        // olduğu belirsiz). Hücre artık birimi kendi taşıyor ("33 satır") — masaüstünde "Satır" başlığı
        // altında hafif tekrar ama belirsizlik yok, mobilde tek başına anlamlı.
        id: 'items', accessorFn: (r) => r.itemCount, header: 'Satır', meta: { align: 'right', width: 76, mobile: 'row' },
        cell: ({ row }) => <span className="num tabular-nums">{row.original.itemCount} satır</span>,
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
