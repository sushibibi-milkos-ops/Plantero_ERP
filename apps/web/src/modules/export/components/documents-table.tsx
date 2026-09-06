'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/form/date-field';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { updateExportDocumentAction } from '../actions';
import type { ExportDocRow } from '../queries';

const STATUS_LABEL: Record<string, string> = Object.fromEntries(statusOptions('export_doc').map((o) => [o.value, o.label]));

export function DocumentsTable({
  documents,
  responsibleUsers,
  showShipmentColumn = false,
}: {
  documents: ExportDocRow[];
  responsibleUsers: Array<{ id: string; fullName: string }>;
  showShipmentColumn?: boolean;
}) {
  const [editing, setEditing] = useState<ExportDocRow | null>(null);
  const [status, setStatus] = useState('required');
  const [docNo, setDocNo] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [responsibleId, setResponsibleId] = useState<string>('');

  function openEdit(row: ExportDocRow) {
    setEditing(row);
    setStatus(row.status);
    setDocNo(row.docNo ?? '');
    setDueDate(row.dueDate);
    setResponsibleId(responsibleUsers.find((u) => u.fullName === row.responsibleName)?.id ?? '');
  }

  const columns = useMemo<ColumnDef<ExportDocRow, unknown>[]>(() => {
    const base: ColumnDef<ExportDocRow, unknown>[] = [
      { accessorKey: 'name', header: 'Belge', meta: { mobile: 'title' } },
    ];
    if (showShipmentColumn) {
      base.push({ id: 'shipmentDocNo', accessorFn: (r) => r.shipmentDocNo, header: 'Sevkiyat', meta: { className: 'font-mono', mobile: 'subtitle' } });
      base.push({ id: 'partnerName', accessorFn: (r) => r.partnerName, header: 'Müşteri', meta: { mobile: 'hidden' } });
    }
    // `defaultHidden`: yalnızca tüm sevkiyatların ortak belge panosunda (/ihracat/belgeler) — burada
    // Belge no/Vade/Sorumlu satırların %80'inden fazlasında boş (Tur 1 P1, ihracat-belgeler-01: 30
    // satırın 30'u Vade'de, 30'u Sorumlu'da, 26'sı Belge no'da '—'), üç sütun birlikte tablo
    // genişliğinin %35'ini hiç bilgi taşımadan tüketiyordu. Sütun görünürlüğü menüsünden açılabilir;
    // varsayılan kapatma yalnızca İLK ekranı yoğunlaştırır. Tek bir sevkiyatın kendi belge sekmesinde
    // (showShipmentColumn=false) doluluk çok daha yüksek olduğundan bu davranış uygulanmaz.
    const sparseDefault = showShipmentColumn ? ({ defaultHidden: true } as const) : {};
    base.push(
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: 130, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="export_doc" /> },
      { accessorKey: 'docNo', header: 'Belge no', meta: { width: 140, mobile: 'hidden', ...sparseDefault }, cell: ({ getValue }) => getValue<string | null>() || <span className="text-muted-foreground">—</span> },
      // `mobile: 'meta'` (Tur 1 P1, ihracat-belgeler-02 kök neden): önceden bu sütun mobil kartta
      // varsayılan 'row' (= `rest`) sayılıyordu — docNo/responsibleName zaten 'hidden' olduğundan
      // `rest`in TEK/SON elemanı bu oluyor, mobile-cards.tsx onu METRİK yuvasına koyuyordu; sütun boş
      // olduğunda (30/30 satırda) yuva anlamsız bir '—' ile doluyordu. 'meta' işaretiyle boş değer hiç
      // eklenmiyor (mobile-cards.tsx `isEmptyValue` filtresi), dolu olduğunda da metrik değil bağlam
      // ipucu olarak görünür.
      { accessorKey: 'dueDate', header: 'Vade', meta: { width: 100, mobile: 'meta', ...sparseDefault }, cell: ({ getValue }) => { const v = getValue<string | null>(); return v ? formatDate(v) : <span className="text-muted-foreground">—</span>; } },
      { accessorKey: 'responsibleName', header: 'Sorumlu', meta: { width: 140, mobile: 'hidden', ...sparseDefault }, cell: ({ getValue }) => getValue<string | null>() || <span className="text-muted-foreground">—</span> },
    );
    return base;
  }, [showShipmentColumn]);

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('export_doc') }];

  return (
    <>
      <DataTable
        columns={columns}
        data={documents}
        getRowId={(r) => r.id}
        searchPlaceholder="Belge, sevkiyat, müşteri ara…"
        filters={filters}
        rowActions={(r) => [{ label: 'Düzenle', icon: Pencil, onSelect: () => openEdit(r) }]}
        emptyTitle="Belge yok"
        emptyDescription="Sevkiyat oluşturulunca rejime göre belge takip listesi otomatik kurulur."
      />

      <ConfirmDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing?.name ?? ''}
        description={editing ? `${editing.shipmentDocNo} sevkiyatı` : undefined}
        confirmLabel="Kaydet"
        onConfirm={async () => {
          if (!editing) return { ok: false, error: 'Belge bulunamadı' };
          const res = await updateExportDocumentAction({
            documentId: editing.id, shipmentId: editing.shipmentId,
            status: status as 'required' | 'in_progress' | 'ready' | 'sent' | 'received' | 'not_required',
            docNo: docNo || null, dueDate: dueDate || null, responsibleId: responsibleId || null,
          });
          if (res.ok) toast.success('Belge güncellendi');
          return res.ok ? undefined : { ok: false, error: res.error };
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[13px]">Durum</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions('export_doc').map((o) => <SelectItem key={o.value} value={o.value}>{STATUS_LABEL[o.value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Belge no</Label>
            <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Vade</Label>
            <DateInput value={dueDate} onChange={setDueDate} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">Sorumlu</Label>
            <Select value={responsibleId} onValueChange={setResponsibleId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Sorumlu seçin" /></SelectTrigger>
              <SelectContent>
                {responsibleUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
