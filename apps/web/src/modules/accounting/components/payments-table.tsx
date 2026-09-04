'use client';

import { useMemo } from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Undo2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter, type RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { unapplyAccountingPaymentAction } from '../actions';
import type { AccountingPaymentRow } from '../queries';

const METHOD_LABELS: Record<string, string> = { bank_transfer: 'Havale/EFT', cash: 'Kasa', credit_card: 'Kredi kartı', cheque: 'Çek', marketplace_payout: 'Pazaryeri', other: 'Diğer' };

export function PaymentsTable({ rows, canManage }: { rows: AccountingPaymentRow[]; canManage: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function unapply(id: string, docNo: string) {
    const res = await unapplyAccountingPaymentAction({ id });
    if (res.ok) {
      toast.success(`${docNo} geri alındı`);
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  const columns = useMemo<ColumnDef<AccountingPaymentRow, unknown>[]>(
    () => [
      // width (kök neden — pnpm measure ile kanıtlandı: masaüstünde scrollWidth 1172 > clientWidth
      // 1152): iki genişliksiz sütun (Belge no + Cari) auto table-layout'ta içeriğe göre büyüyordu.
      // journal-entries-table.tsx / bank-transactions-table.tsx ile aynı desen: sabit genişlik +
      // inline-block truncate uzun cari adlarını (ör. "Kahve Dünyası Yeşil Kahve ve Egzotik Ürünler
      // Ltd. Şti.") gerçekten sınırlar.
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'Belge no', meta: { width: 150, mobile: 'title', className: 'font-mono' } },
      { accessorKey: 'partnerName', header: 'Cari', meta: { width: 260, mobile: 'subtitle' }, cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[236px]" title={row.original.partnerName}>{row.original.partnerName}</span> },
      // Kök neden (tur 2 P2 muhasebe-tahsilatlar-02): yeşil metin burada aynı ekranda birincil eylem
      // düğmesi ve "Kaydedildi" durum rozetiyle ÜÇÜNCÜ bir anlam taşıyordu — Yön bir durum değil bir
      // sınıflandırma. Nötr foreground + yön oku (14px) ile ayrışır, yeşil yalnızca StatusBadge'te kalır.
      { id: 'direction', accessorFn: (r) => r.direction, header: 'Yön', meta: { width: 110, mobile: 'meta' }, cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          {row.original.direction === 'inbound' ? <ArrowDownLeft className="size-3.5 text-muted-foreground" /> : <ArrowUpRight className="size-3.5 text-muted-foreground" />}
          {row.original.direction === 'inbound' ? 'Tahsilat' : 'Ödeme'}
        </span>
      ) },
      // defaultHidden (kritik bulgu, kriter 3 — muhasebe-tahsilatlar-03): bu seeddeki 17 kaydın
      // 17'si de "Havale/EFT" ve "Tahsissiz ₺0,00" — bilgi taşımayan iki sütun tabloyu genişletiyordu.
      // Sütun seçiciden istenirse açılır; "Durum" tek değerli 3. sütun olarak KALIR (ölçüt ≤1 ile
      // uyumlu — StatusBadge farklı durumlar (iptal/beklemede) gerçekleştiğinde bağlam taşır).
      { id: 'method', accessorFn: (r) => METHOD_LABELS[r.method] ?? r.method, header: 'Yöntem', meta: { width: 120, mobile: 'hidden', defaultHidden: true } },
      { accessorKey: 'unallocatedAmount', header: 'Tahsissiz', meta: { align: 'right', width: 110, mobile: 'hidden', defaultHidden: true }, cell: ({ row }) => <MoneyCell value={row.original.unallocatedAmount} currency={row.original.currency} muted={Number(row.original.unallocatedAmount) <= 0} /> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="payment" /> },
      // paymentDate mobile:'meta' (tur 2 P1 muhasebe-tahsilatlar-01 kök nedeni): tarih önceden "rest"
      // grubunun SONUNCUSUYDU, mobil kalıp tek metriği oradan alıyordu — 17/17 kartta tutar hiç
      // görünmüyordu. Artık "rest" grubunda yalnız amountTry kalır → o tek metrik olur.
      { accessorKey: 'paymentDate', header: 'Tarih', meta: { width: 110, mobile: 'meta' }, cell: ({ row }) => formatDate(row.original.paymentDate) },
      { accessorKey: 'amountTry', header: 'Tutar (₺)', meta: { align: 'right', width: 130 }, cell: ({ row }) => <MoneyCell value={row.original.amountTry} /> },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'status', title: 'Durum', options: statusOptions('payment') },
    { columnId: 'direction', title: 'Yön', options: [{ value: 'inbound', label: 'Tahsilat' }, { value: 'outbound', label: 'Ödeme' }] },
  ];

  const rowActions: (row: AccountingPaymentRow) => RowAction<AccountingPaymentRow>[] = (row) =>
    canManage && row.status === 'posted'
      ? [{ label: 'Geri al', icon: Undo2, destructive: true, onSelect: () => unapply(row.id, row.docNo) }]
      : [];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="Belge no, cari ara…"
      filters={filters}
      initialSorting={[{ id: 'paymentDate', desc: true }]}
      rowActions={canManage ? rowActions : undefined}
      emptyTitle="Henüz tahsilat/ödeme yok"
      emptyDescription="Yeni tahsilat/ödeme kaydedin."
    />
  );
}
