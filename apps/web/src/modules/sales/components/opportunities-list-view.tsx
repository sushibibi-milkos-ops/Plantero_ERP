'use client';

import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { MoneyCell } from '@/components/money-cell';
import { formatDate } from '@/lib/format';
import type { OpportunityCardRow } from '../queries';
import type { opportunityStages } from '@plantero/db';

export function OpportunitiesListView({ rows, stages, onOpen }: { rows: OpportunityCardRow[]; stages: Array<typeof opportunityStages.$inferSelect>; onOpen: (id: string) => void }) {
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const columns = useMemo<ColumnDef<OpportunityCardRow, unknown>[]>(
    () => [
      { id: 'docNo', accessorFn: (r) => r.docNo, header: 'No', meta: { width: 110, mobile: 'hidden', className: 'font-mono text-xs' } },
      { id: 'title', accessorFn: (r) => r.title, header: 'Başlık', meta: { mobile: 'title' } },
      {
        // '—' tek başına eksik veriyi hata gibi okutuyordu (Tur 5 P1 bulgusu) — opportunity-card.tsx
        // (kanban kartı) ile AYNI ifade: "— cari bağlı değil". Mobil kart ile masaüstü kanban artık
        // aynı yer tutucu dilini konuşuyor.
        id: 'partnerName', accessorFn: (r) => r.partnerName ?? '', header: 'Cari', meta: { mobile: 'subtitle' },
        cell: ({ row }) => row.original.partnerName || <span className="text-muted-foreground/40">— cari bağlı değil</span>,
      },
      { id: 'stageId', accessorFn: (r) => stageById.get(r.stageId)?.name ?? r.stageId, header: 'Aşama', meta: { width: 140, mobile: 'badge' }, cell: ({ row }) => {
        const stage = stageById.get(row.original.stageId);
        return <StatusBadge status={row.original.stageId} label={stage?.name ?? '—'} tone={stage?.isWon ? 'success' : stage?.isLost ? 'danger' : 'info'} />;
      } },
      {
        // digits={0}: kanban kartıyla (opportunity-card.tsx) aynı hassasiyet — görünüm anahtarına
        // basınca aynı fırsatın tutarı "₺45.000" ↔ "₺45.000,00" arasında değişmemeli; fırsat tutarı
        // zaten tahmini bir büyüklük, kuruş hassasiyeti taşımıyor (Tur 4 P1 bulgusu). Genişlik
        // 130 → 110: ondalıksız gösterimde 130px gereğinden fazla boşluk bırakıyordu.
        id: 'expectedAmount', accessorFn: (r) => r.expectedAmount, header: 'Beklenen tutar', meta: { align: 'right', width: 110 }, cell: ({ row }) => <MoneyCell value={row.original.expectedAmount} currency={row.original.currency} digits={0} /> },
      { id: 'probability', accessorFn: (r) => r.probability, header: 'Olasılık', meta: { align: 'right', width: 90, mobile: 'hidden' }, cell: ({ row }) => `%${row.original.probability}` },
      {
        // mobile:'badge' (Tur 5 P0 bulgusu — önceden 'hidden'): kanban kartı 3 fırsatı kırmızı
        // "gecikti · 28.08" rozetiyle işaretlerken mobil liste bu TEK eylem sinyalini hiç göstermiyordu
        // — sahada (390px) ekranın eyleme dönük tek bilgisi kayboluyordu. Yalnızca gecikmiş fırsatlarda
        // rozet basılır (opportunity-card.tsx'teki kalıpla birebir aynı: h-4, text-[10px],
        // bg-destructive/10, CalendarClock size-2.5); gecikmemiş/tarihsiz fırsatlarda kart sessiz kalır.
        id: 'nextActivityDate', accessorFn: (r) => r.nextActivityDate ?? '', header: 'Sonraki aktivite', meta: { width: 130, mobile: 'badge' },
        cell: ({ row }) => {
          const { nextActivityDate, isOverdue } = row.original;
          if (nextActivityDate && isOverdue) {
            return (
              <span
                title={`Sonraki aktivite: ${formatDate(nextActivityDate)} (gecikti)`}
                className="inline-flex h-4 items-center gap-1 rounded bg-destructive/10 px-1 text-[10px] font-medium whitespace-nowrap text-destructive tabular-nums"
              >
                <CalendarClock className="size-2.5" /> gecikti · {formatDate(nextActivityDate).slice(0, 5)}
              </span>
            );
          }
          // Masaüstü tabloda gecikmemiş/tarihsiz fırsatlar için düz tarih/'—' kalır (bilgi kaybı yok);
          // mobil karttaki 'badge' slotunda yalnızca GECİKMİŞ rozeti anlamlı olduğundan orada hiç
          // basılmaz — dolu bir "badge" slotu her satırda tekrarlanan bir tarih değil, tek eylem
          // sinyali (gecikme) taşımalı.
          return <span className="hidden md:inline">{nextActivityDate ? formatDate(nextActivityDate) : '—'}</span>;
        },
      },
    ],
    [stageById],
  );

  const filters: DataTableFilter[] = [{ columnId: 'stageId', title: 'Aşama', options: stages.map((s) => ({ value: s.name, label: s.name })) }];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      searchPlaceholder="Başlık, cari ara…"
      filters={filters}
      emptyTitle="Henüz fırsat yok"
    />
  );
}

/**
 * Yalnızca sahada (390px, kanban hiç render edilmez) kullanılan gruplu liste (Tur 5 P1 bulgusu):
 * masaüstü kanban aşamaya göre gruplu, mobil düz liste gruplamasızdı — iki farklı ürün gibi
 * davranıyordu. Aşama başlıkları sticky grup ayracı olarak geri getirilir, kanban'ın aşama modeli
 * sahada da korunur. DataTable'ın gruplama desteği olmadığından (mobil kart üretici düz liste
 * varsayar) burada kendi hafif kart/gruplama kurulur — arama/filtre bilgi çubuğu barındırmaz,
 * masaüstündeki "Liste" görünümü (yukarıdaki `OpportunitiesListView`, DataTable) değişmez kalır.
 */
export function OpportunitiesMobileGroupedList({ rows, stages, onOpen }: { rows: OpportunityCardRow[]; stages: Array<typeof opportunityStages.$inferSelect>; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const byStage = new Map<string, OpportunityCardRow[]>();
    for (const s of stages) byStage.set(s.id, []);
    for (const r of rows) byStage.get(r.stageId)?.push(r);
    return stages.map((s) => ({ stage: s, rows: byStage.get(s.id) ?? [] })).filter((g) => g.rows.length > 0);
  }, [rows, stages]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border/70 bg-card py-10 text-center text-sm text-muted-foreground">Henüz fırsat yok</div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(({ stage, rows: stageRows }) => (
        <div key={stage.id}>
          {/* top-12: sayfa üst çubuğunun (h-12, sticky top-0) hemen altına sabitlenir — DataTable'ın
              kendi thead sticky konumuyla aynı kalıp (bkz. data-table.tsx). */}
          <div className="sticky top-12 z-10 flex items-center gap-1.5 bg-background/95 py-1.5 text-[12px] font-medium text-muted-foreground backdrop-blur-sm">
            {stage.name}
            <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tabular-nums">{stageRows.length}</span>
          </div>
          <ul className="space-y-2 pt-1">
            {stageRows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left">
                  <div className="rounded-lg border border-border/70 bg-card p-3 active:bg-accent/50">
                    <div className="line-clamp-2 text-[13px] font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.partnerName || <span className="text-muted-foreground/40">— cari bağlı değil</span>}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-baseline gap-1.5">
                        <MoneyCell value={r.expectedAmount} currency={r.currency} digits={0} className="text-[13px] font-semibold text-foreground" />
                        <span className="font-mono text-[11px] text-muted-foreground">%{r.probability}</span>
                      </span>
                      {r.nextActivityDate && r.isOverdue ? (
                        <span className="inline-flex h-4 shrink-0 items-center gap-1 rounded bg-destructive/10 px-1 text-[10px] font-medium whitespace-nowrap text-destructive tabular-nums">
                          <CalendarClock className="size-2.5" /> gecikti · {formatDate(r.nextActivityDate).slice(0, 5)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
