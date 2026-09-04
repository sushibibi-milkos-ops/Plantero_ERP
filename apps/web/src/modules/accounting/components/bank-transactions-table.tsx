'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EyeOff } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter, type RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { ignoreBankTransactionAction } from '../actions';
import { SignedAmount } from './signed-amount';
import type { BankTransactionRow } from '../queries';

export function BankTransactionsTable({ rows }: { rows: BankTransactionRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function ignore(id: string) {
    const res = await ignoreBankTransactionAction({ bankTransactionId: id });
    if (res.ok) {
      toast.success('Hareket mutabakat dışı bırakıldı');
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<BankTransactionRow, unknown>[]>(
    () => [
      { accessorKey: 'txDate', header: 'Tarih', meta: { width: 110, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.txDate) },
      // Tek satır düz metin (tur 2 P1 muhasebe-banka-02 kök nedeni): önceden bu hücrenin İÇİNDE
      // ikinci bir katman (karşı taraf) vardı — DataTable'ın mobil kalıbı en fazla 2 satır varsayar,
      // gizli 3. katman kartı 68.5→83.5px'e taşırıyordu. Karşı taraf artık ayrı bir sütun (aşağıda).
      // width + inline-block truncate (kök neden — DÜZELTME 2, muhasebe-yevmiye-01 ile aynı sınıf
      // hata): `flex:true` TEK BAŞINA bir üst sınır koymaz — td'ye hiç `width` verilmeyince (widthStyle
      // flex sütunu için stil DÖNDÜRMEZ) içerik ne kadar uzunsa td o kadar büyür; uzun ekstre
      // açıklamaları ("Trendyol Hakediş — tanımsız dönem") tabloyu 1152px'ten taşırıyordu (ölçüldü:
      // 1264px). `md:w-[356px]` (td toplamı ~380px, px-3 dolgu dahil) içeriği gerçekten sabitler.
      { accessorKey: 'description', header: 'Açıklama', meta: { mobile: 'title', flex: true, width: 380 }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[356px]" title={row.original.description}>{row.original.description}</span> },
      // Ayrı sütun + `meta.mobile:'meta'` (boş değerler DataTable tarafından otomatik elenir —
      // `apps/web/src/components/data-table/mobile-cards.tsx`), 'subtitle' değil: karşı taraf her
      // hareket için dolu değildir, 'subtitle' boş olsa bile satırı işgal ederdi. Aynı inline-block
      // truncate deseni: uzun cari adları (ör. "Kahve Dünyası Yeşil Kahve ve Egzotik Ürünler Ltd. Şti.")
      // width hint'ini yoksayıp td'yi büyütüyordu.
      { accessorKey: 'counterpartyName', header: 'Karşı taraf', meta: { width: 170, mobile: 'meta' }, cell: ({ row }) => row.original.counterpartyName ? <span className="inline-block max-w-full truncate align-bottom md:w-[146px]" title={row.original.counterpartyName}>{row.original.counterpartyName}</span> : <span className="text-muted-foreground">—</span> },
      { accessorKey: 'bankAccountCode', header: 'Hesap', meta: { width: 110, mobile: 'hidden' } },
      { accessorKey: 'amount', header: 'Tutar', meta: { align: 'right', width: 130 }, cell: ({ row }) => <SignedAmount value={row.original.amount} currency={row.original.currency} /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 120, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="bank_tx" /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('bank_tx') }];

  const rowActions = (row: BankTransactionRow): RowAction<BankTransactionRow>[] => {
    const actions: RowAction<BankTransactionRow>[] = [];
    if (row.status === 'suggested') actions.push({ label: 'Mutabakatta incele', href: '/muhasebe/mutabakat' });
    if (row.status === 'unmatched' || row.status === 'suggested') actions.push({ label: 'Yok say', icon: EyeOff, destructive: true, onSelect: () => ignore(row.id) });
    return actions;
  };

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Açıklama, karşı taraf ara…"
      filters={filters}
      initialSorting={[{ id: 'txDate', desc: true }]}
      rowActions={rowActions}
      emptyTitle="Henüz banka hareketi yok"
      emptyDescription="Ekstre içe aktarın."
    />
  );
}
