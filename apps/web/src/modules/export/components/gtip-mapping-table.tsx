'use client';

import { useMemo, useTransition } from 'react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assignHsCodeAction } from '../actions';
import type { GtipProductRow } from '../queries';
import type { hsCodes } from '@plantero/db';

type HsCode = typeof hsCodes.$inferSelect;

const TYPE_LABEL: Record<string, string> = {
  raw_material: 'Hammadde', packaging: 'Ambalaj', semi_finished: 'Yarı mamul', finished: 'Mamul', merchandise: 'Ticari mal',
};

function HsCodeCell({ row, hsCodeOptions, editable }: { row: GtipProductRow; hsCodeOptions: HsCode[]; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const selected = row.hsCode ? hsCodeOptions.find((h) => h.code === row.hsCode) : undefined;

  if (!editable) {
    return row.hsCode ? (
      <span className="block truncate font-mono" title={selected?.description}>{row.hsCode}</span>
    ) : (
      <span className="text-muted-foreground">Eşlenmedi</span>
    );
  }

  return (
    <Select
      value={row.hsCode ?? '__none'}
      disabled={pending}
      onValueChange={(value) => {
        const hsCode = value === '__none' ? null : value;
        startTransition(async () => {
          const res = await assignHsCodeAction({ productId: row.id, hsCode });
          if (res.ok) toast.success(`${row.sku} → ${hsCode ?? 'GTİP kaldırıldı'}`);
          else toast.error(res.error);
        });
      }}
    >
      {/* Tur 1 P1 ihracat-gtip-01 kök neden: bu tetikleyici DURAĞAN hâlde her zaman 1px çerçeveli bir
          kutuydu — 39 satırda 39 kutu alt alta Linear'ın sessiz satırı yerine "form ızgarası"na
          dönüşüyordu. Çerçeve/arka plan artık yalnızca hover/focus-visible/açık durumda görünür;
          durağan hâlde düz metin (eşlenmemişse muted) gibi okunur — tek fark GTİP kodunun kendisi.
          `data-[size=default]:h-11 md:...:h-9` (ihracat-gtip-02): taban sınıf `data-[size=default]:h-9`
          bir ATTRIBUTE selector taşıdığı için düz `h-9`/`md:h-9` override'ından daha yüksek özgüllüğe
          sahip — 390px'te bu ekranın TEK birincil eylemi 36px'te (44px dokunma hedefinin altında)
          kalıyordu (fields.tsx'teki aynı kök nedenin ikinci örneği).
          `-my-3.5 md:my-0` (Tur 2 P2 ihracat-gtip-06 kök neden): bu hücre mobil kartın "badge" satırında
          (row-actions.tsx'teki `DataTableRowActions` ile AYNI kalıp — bkz. o dosyadaki yorum) başlıkla
          aynı `items-center` flex satırında oturuyor; 44px'lik gerçek dokunma kutusu satırın çapraz-eksen
          yüksekliğini 44px'e zorlayıp kartı 84px'e (56-72 bandının üstüne) taşıyordu. Negatif dikey
          margin dokunma kutusunu (`getBoundingClientRect`, marj'dan etkilenmez) 44x44 aynen KORURKEN
          satıra katkısını rozet satırının kendi ölçeğine (11px/leading-4=16px) indirir; masaüstünde
          (`md:my-0`) etkisizdir.
          Tur 3 P1 ihracat-gtip-07 kök neden: `SelectValue` varsayılan olarak seçilen `SelectItem`'ın
          TÜM içeriğini (kod + tarife açıklaması) tetikleyiciye kopyalıyordu; açıklama kırpılmadığından
          tetikleyicinin (dolayısıyla `min-w-[9rem]` dışında hiçbir üst sınırı olmayan) doğal genişliği
          eşlenen ürün sayısı arttıkça büyüyor, sabit `meta.width` sütun genişliğini (260→408px) aşıyordu.
          `SelectValue`'ya AÇIK children verilince (Radix: children sağlanırsa seçili öğenin içeriği
          yerine bunlar basılır, placeholder mantığı bozulmaz) yalnızca kodu, `truncate` ile kırparak
          basıyoruz; açıklama artık yalnızca açılır listede ve tetikleyicinin `title` özniteliğinde. */}
      <SelectTrigger
        title={selected?.description}
        className="w-full min-w-[9rem] overflow-hidden border-transparent bg-transparent px-2 font-mono text-[13px] shadow-none data-[size=default]:h-11 -my-3.5 md:my-0 hover:border-input focus-visible:border-ring data-[state=open]:border-input md:data-[size=default]:h-9 dark:bg-transparent dark:hover:bg-input/30 dark:data-[state=open]:bg-input/30"
      >
        <SelectValue placeholder="GTİP seçin">
          {row.hsCode ? <span className="truncate">{row.hsCode}</span> : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">
          <span className="text-muted-foreground">Eşlenmedi</span>
        </SelectItem>
        {hsCodeOptions.map((h) => (
          <SelectItem key={h.code} value={h.code}>
            <span className="font-mono">{h.code}</span>
            <span className="ml-1.5 text-muted-foreground">{h.description}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GtipMappingTable({ products, hsCodeOptions, editable }: { products: GtipProductRow[]; hsCodeOptions: HsCode[]; editable: boolean }) {
  const columns = useMemo<ColumnDef<GtipProductRow, unknown>[]>(
    () => [
      { accessorKey: 'sku', header: 'SKU', meta: { width: 130, className: 'font-mono', mobile: 'subtitle' } },
      { accessorKey: 'name', header: 'Ürün', meta: { mobile: 'title' } },
      { id: 'category1', accessorFn: (r) => r.category1 ?? '', header: 'Kategori', meta: { width: 160, mobile: 'hidden' }, cell: ({ getValue }) => getValue<string>() || <span className="text-muted-foreground">—</span> },
      { id: 'type', accessorFn: (r) => r.type, header: 'Tip', meta: { width: 110, mobile: 'hidden' }, cell: ({ getValue }) => TYPE_LABEL[getValue<string>()] ?? getValue<string>() },
      {
        id: 'hsCode', accessorFn: (r) => r.hsCode ?? '', header: 'GTİP', meta: { width: 220, mobile: 'badge' },
        cell: ({ row }) => <HsCodeCell row={row.original} hsCodeOptions={hsCodeOptions} editable={editable} />,
      },
    ],
    [hsCodeOptions, editable],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'hsCode', title: 'Eşleme', options: [{ value: '', label: 'Eşlenmemiş' }] },
    { columnId: 'type', title: 'Tip', options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={products}
      getRowId={(r) => r.id}
      searchPlaceholder="SKU veya ürün adı ara…"
      filters={filters}
      emptyTitle="Satılabilir ürün yok"
      emptyDescription="GTİP eşlemesi yalnızca satılabilir (isSellable) ürünler için yapılır."
    />
  );
}
