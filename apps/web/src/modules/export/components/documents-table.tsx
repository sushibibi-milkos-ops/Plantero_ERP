'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import { DataTable, DataTableRowActions, type ColumnDef, type DataTableFilter } from '@/components/data-table';
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

// Tur 3 P1 ihracat-detay-10 kök neden düzeltmesi: mobil kartın 2. satırı önceden HER ZAMAN `r.code`
// (ham veritabanı enum anahtarı, ör. 'PACKING_LIST') basıyordu. Gerçek ticaret kısaltması taşıyan
// kodlar (ATR, EUR1, BL, CMR, AWB, ETGB) bilgi verir ve kısaltmalı hâliyle kalır; kalan 6 kod
// (PROFORMA/INVOICE/PACKING_LIST/ORIGIN/HEALTH/INSURANCE) kartın Türkçe başlığında (`r.name`) zaten
// yazan bilgiyi birebir tekrar ettiği için hiç basılmaz — bunlar için varsa Belge no/Vade/Sorumlu
// gösterilir, o da yoksa 2. satır hiç render edilmez (kart `min-h-14` ile 56px'de sabit kalır).
const DOC_SHORT_LABEL: Partial<Record<string, string>> = { ATR: 'ATR', EUR1: 'EUR.1', BL: 'B/L', CMR: 'CMR', AWB: 'AWB', ETGB: 'ETGB' };

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
    // Tur 7 P2 ihracat-belgeler-03 kök neden düzeltmesi (ortak belge panosu, showShipmentColumn=true):
    // bu üç sütun (Belge, Sevkiyat, Müşteri) meta.width taşımıyordu — DataTable'ın auto table-layout'u
    // kalan 982px'i bunlara yığıyordu. satis modülünün Tur 11 kalıbı (channels-table.tsx 'Kanal'): hem
    // TD'ye SABİT `meta.width` hem içerik span'ine BİREBİR aynı piksel değerinde `max-w-[…] truncate`
    // verilir.
    //
    // ÖNEMLİ (Tur 8'de deneysel olarak doğrulandı — bkz. `docs/DESIGN-SCORECARD.md` ölçüm notları):
    // tarayıcının auto table-layout algoritması `meta.width` değerlerini BASİT, tek bir ortak çarpanla
    // orantılı ÖLÇEKLEMEZ. Bir sütunun `width`'i, o sütunun kendi hücre İÇERİĞİNİN doğal (nowrap)
    // genişliğinin ALTINDA kaldığı sürece SONUÇ ÜZERİNDE NEREDEYSE HİÇ ETKİSİ OLMAZ (izole
    // Playwright deneyi: 60px'ten 150px'e kadar hiçbir ara değer render genişliğini kıpırdatmadı) —
    // yalnızca o eşiği (yaklaşık: sütunun kendi içerik genişliği + komşu sütunların "kullanılmayan"
    // payı) AŞTIĞINDA sütun genişliği spesifiye edilen değere doğru tepki vermeye başlıyor, bu da
    // TÜM DİĞER sütunları geri itiyor. Bu yüzden `max-w-[…] truncate` yalnızca görsel taşma/kırpma
    // sınırıdır, sütunun gerçek render genişliğini SABİTlemez; ve aşağıdaki `width` değerleri
    // matematiksel bir formülden değil, gerçek tarayıcıda ÖLÇÜLEREK (scripts/probe-ihracat-r8c-fix.ts,
    // 1440x900, EXP-2026-000002) bulunmuş, her sütunun slack'ini (render genişliği − en uzun içerik)
    // hedefin altında tutan TABAN değerlerdir — bu dosyadaki herhangi bir `width` değiştirilirse
    // probe-ihracat-r8c-fix.ts YENİDEN çalıştırılıp TÜM sütunların slack'i kontrol edilmeli.
    //
    // Sevkiyat detayının KENDİ Belgeler sekmesinde (showShipmentColumn=false, ihracat-detay-18/-19):
    // Tur 7'de bu bağlamda görünür sütun sayısı yalnızca 3'e (Belge/Durum/Eylemler) düştüğü için
    // 'Belge'ye sabit width vermek 'Durum'u da aynı oransal esnemeye sokup YENİ bir P2 doğuruyordu
    // (130px→384px, slack 293px) — o turda kök neden yerine geçici çözüm olarak tablo `[&_table]:
    // !w-auto !min-w-0` ile 1152px'lik panelin GERÇEK içerik genişliğine (~365px) küçültüldü; bu
    // ölü alanı sütunun İÇİNDEN tablonun SAĞINA taşıdı, ORTADAN KALDIRMADI (ihracat-detay-19, P1,
    // panel 1152px / tablo 365px → 787px ölü blok). Tur 8 kök neden düzeltmesi: `docNo` (Belge no)
    // ve `dueDate` (Vade) VARSAYILAN GÖRÜNÜR yapılıp (aşağıdaki `sparseDefault` artık yalnızca
    // showShipmentColumn=true dalında uygulanıyor — panodaki doluluk oranı burada geçersiz, bu dar
    // bağlamda GERÇEK bilgi taşıyan sütun sayısını 3'ten 5'e çıkarmak gerekiyordu) tabloyu 5 gerçek
    // sütuna (Belge/Durum/Belge no/Vade/Eylemler) yayıyor — genişlik kilidi kaldırılıyor. Ölçülen
    // sonuç (1440x900, 8 satır): Belge 448/320→slack128, Durum 198/91→107, Belge no 281/139→142,
    // Vade 155/57→98, Eylemler 69/50→19 — beşi de ≤150px hedefinin altında, panel/tablo farkı 0px.
    const base: ColumnDef<ExportDocRow, unknown>[] = [
      showShipmentColumn
        ? {
            accessorKey: 'name', header: 'Belge', meta: { mobile: 'title', width: 220, className: 'max-w-[220px] truncate' },
            cell: ({ row }) => <span className="block max-w-[220px] truncate" title={row.original.name}>{row.original.name}</span>,
          }
        : {
            accessorKey: 'name', header: 'Belge', meta: { mobile: 'title', width: 260, className: 'max-w-[320px] truncate' },
            cell: ({ row }) => <span className="block max-w-[320px] truncate" title={row.original.name}>{row.original.name}</span>,
          },
    ];
    if (showShipmentColumn) {
      base.push({
        id: 'shipmentDocNo', accessorFn: (r) => r.shipmentDocNo, header: 'Sevkiyat', meta: { width: 150, className: 'max-w-[150px] truncate font-mono', mobile: 'subtitle' },
        cell: ({ getValue }) => <span className="block max-w-[150px] truncate font-mono" title={getValue<string>() ?? undefined}>{getValue<string>()}</span>,
      });
      base.push({
        id: 'partnerName', accessorFn: (r) => r.partnerName, header: 'Müşteri', meta: { width: 228, mobile: 'hidden', className: 'max-w-[228px] truncate' },
        cell: ({ getValue }) => <span className="block max-w-[228px] truncate text-muted-foreground" title={getValue<string>() ?? undefined}>{getValue<string>()}</span>,
      });
    }
    // `defaultHidden` (Tur 2 P1 ihracat-detay-06 kök neden düzeltmesi): Tur 3'te ortak belge panosu
    // (showShipmentColumn=true) VE sevkiyatın kendi Belgeler sekmesi (showShipmentColumn=false) için
    // KOŞULSUZ uygulanmıştı — panoda Belge no 26/30 boş, burada 7/8; Vade ve Sorumlu HER İKİ bağlamda
    // %100 boş idi. Tur 8'de bu, showShipmentColumn=false dalı için YENİDEN gözden geçirildi: o dar
    // bağlamda (yalnızca 3 gerçek sütun: Belge/Durum/Eylemler) doluluk oranı düşük olsa da Belge no ve
    // Vade'yi gizli tutmanın matematiksel bedeli, tabloyu panelin (1152px) yalnızca %32'sine sıkıştırıp
    // sağda 787px ölü blok bırakmaktı (ihracat-detay-19, P1 — kriter 5). Doluluk oranı (kriter 3/12)
    // düşük kalsa da (Belge no ~1-2/8 dolu) genişlik ölü alanı (kriter 5, P1) daha ağır basıyor —
    // `sparseDefault` bu YÜZDEN artık yalnızca showShipmentColumn=true dalında (ortak panoda, 30
    // satırlık daha büyük örneklemde gerçekten sparse) uygulanıyor; Sorumlu HER İKİ bağlamda da
    // (ikisinde de %100 boş, doldurucu bir sütun değil) gizli kalır — sütun görünürlüğü menüsünden
    // her iki bağlamda da açılabilir.
    const sparseDefault = { defaultHidden: true } as const;
    base.push(
      { id: 'status', accessorFn: (r) => r.status, header: 'Durum', meta: { width: showShipmentColumn ? 130 : 110, mobile: 'badge' }, cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="export_doc" /> },
      {
        accessorKey: 'docNo', header: 'Belge no',
        meta: { width: showShipmentColumn ? 140 : 120, mobile: 'hidden', ...(showShipmentColumn ? sparseDefault : {}) },
        cell: ({ getValue }) => getValue<string | null>() || <span className="text-muted-foreground">—</span>,
      },
      // `mobile: 'meta'` (Tur 1 P1, ihracat-belgeler-02 kök neden): önceden bu sütun mobil kartta
      // varsayılan 'row' (= `rest`) sayılıyordu — docNo/responsibleName zaten 'hidden' olduğundan
      // `rest`in TEK/SON elemanı bu oluyor, mobile-cards.tsx onu METRİK yuvasına koyuyordu; sütun boş
      // olduğunda (30/30 satırda) yuva anlamsız bir '—' ile doluyordu. 'meta' işaretiyle boş değer hiç
      // eklenmiyor (mobile-cards.tsx `isEmptyValue` filtresi), dolu olduğunda da metrik değil bağlam
      // ipucu olarak görünür.
      {
        accessorKey: 'dueDate', header: 'Vade',
        meta: { width: showShipmentColumn ? 100 : 90, mobile: 'meta', ...(showShipmentColumn ? sparseDefault : {}) },
        cell: ({ getValue }) => { const v = getValue<string | null>(); return v ? formatDate(v) : <span className="text-muted-foreground">—</span>; },
      },
      { accessorKey: 'responsibleName', header: 'Sorumlu', meta: { width: 140, mobile: 'hidden', ...sparseDefault }, cell: ({ getValue }) => getValue<string | null>() || <span className="text-muted-foreground">—</span> },
    );
    return base;
  }, [showShipmentColumn]);

  const filters: DataTableFilter[] = [{ columnId: 'status', title: 'Durum', options: statusOptions('export_doc') }];
  const rowActions = (r: ExportDocRow) => [{ label: 'Düzenle', icon: Pencil, onSelect: () => openEdit(r) }];

  return (
    <>
      <DataTable
        columns={columns}
        data={documents}
        getRowId={(r) => r.id}
        searchPlaceholder="Belge, sevkiyat, müşteri ara…"
        filters={filters}
        rowActions={rowActions}
        // ihracat-detay-18/-19 kök neden düzeltmesi (sevkiyatın kendi Belgeler sekmesi,
        // showShipmentColumn=false): Tur 7'de bu dar (3 sütun) bağlamda DataTable'ın <table>
        // öğesinün kapsayıcıyı DOLDURMAYA zorlanması (`min-w-full`/`w-full`) tek esnek sütuna
        // (Belge) 762px'e varan ölü alan yığdığı için `[&_table]:!w-auto [&_table]:!min-w-0` ile bu
        // zorlama iptal edilmişti — ama bu, ölü alanı sütunun İÇİNDEN tablonun SAĞINA taşımaktan
        // başka bir şey yapmıyordu (panel 1152px, küçültülmüş tablo 365px → 787px ölü blok,
        // ihracat-detay-19, P1). Tur 8'de kök neden düzeltildi: yukarıdaki sütun tanımlarında
        // Belge no/Vade varsayılan görünür yapılıp (5 gerçek sütun artık 1152px'i orantılı
        // dolduruyor) BU KİLİT KALDIRILDI — DataTable yine kapsayıcıyı dolduruyor, ama artık
        // dolduracak gerçek sütun sayısı yeterli.
        emptyTitle="Belge yok"
        emptyDescription="Sevkiyat oluşturulunca rejime göre belge takip listesi otomatik kurulur."
        // Sevkiyat detayının KENDİ Belgeler sekmesinde (showShipmentColumn=false) özel kart — Tur 2 P1
        // ihracat-detay-08 kök neden düzeltmesi: yukarıdaki `sparseDefault` Belge no/Vade/Sorumlu'yu
        // varsayılan gizleyince bu bağlamda ikinci satıra düşecek HİÇBİR alan kalmıyordu (docNo zaten
        // `mobile:'hidden'`, dueDate `mobile:'meta'` ama boş) — kart 42px'e düşüp KENDİ 44px'lik
        // satır-eylem düğmesinden bile kısa kalıyordu. Paylaşılan `mobile-cards.tsx` değiştirilmeden
        // (kural 2) ikinci satıra HER ZAMAN dolu olan `code` (belge tipi anahtarı) + varsa Belge no/Vade
        // konur; kabın `min-h-14` (56px) ile bant garanti altına alınır.
        renderMobileCard={!showShipmentColumn ? (r) => {
          const shortLabel = DOC_SHORT_LABEL[r.code];
          const info = r.docNo ? `Belge no ${r.docNo}` : r.dueDate ? `Vade ${formatDate(r.dueDate)}` : r.responsibleName ? `Sorumlu ${r.responsibleName}` : null;
          const hasSubtitle = Boolean(shortLabel || info);
          return (
            <div className="min-h-14 rounded-lg border border-border/70 bg-card p-2.5">
              <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium">{r.name}</div>
                <StatusBadge status={r.status} kind="export_doc" />
                <DataTableRowActions row={r} actions={rowActions(r)} />
              </div>
              {hasSubtitle ? (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {shortLabel ? <span className="font-mono">{shortLabel}</span> : null}
                  {shortLabel && info ? ' · ' : ''}
                  {info ?? null}
                </div>
              ) : null}
            </div>
          );
        } : undefined}
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
