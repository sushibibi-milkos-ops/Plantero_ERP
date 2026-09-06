'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, User as UserIcon } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { formatDateTime } from '@/lib/format';
import type { AuditRow } from '../queries';
import { AUDIT_ACTION_INFO } from '../audit-labels';
import { AuditDiff } from './audit-diff';

function tableLabel(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ');
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: 'Zaman',
        meta: { width: 150, mobile: 'meta' },
        cell: ({ getValue }) => <span className="num text-[12px] whitespace-nowrap text-muted-foreground">{formatDateTime(getValue<string>())}</span>,
      },
      {
        id: 'user',
        accessorFn: (r) => r.userFullName ?? r.userEmail ?? '',
        header: 'Kullanıcı',
        meta: { width: 160, mobile: 'row' },
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <UserIcon className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.userFullName ?? row.original.userEmail ?? 'Sistem'}</span>
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Eylem',
        meta: { width: 110, mobile: 'badge' },
        cell: ({ getValue }) => {
          const a = getValue<string>();
          const info = AUDIT_ACTION_INFO[a];
          return <StatusBadge status={a} label={info?.label ?? a} tone={info?.tone ?? 'neutral'} />;
        },
      },
      {
        accessorKey: 'tableName',
        header: 'Tablo',
        meta: { width: 150, mobile: 'subtitle' },
        cell: ({ getValue }) => <span className="code text-[12px] text-muted-foreground">{tableLabel(getValue<string>())}</span>,
      },
      {
        id: 'record',
        accessorFn: (r) => r.recordId ?? '',
        header: 'Kayıt',
        enableSorting: false,
        meta: { width: 120, mobile: 'hidden' },
        cell: ({ row }) => {
          const doc = row.original.document;
          if (doc) {
            return (
              <Link href={doc.href} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-[12px] text-primary hover:underline">
                {doc.docNo} <ArrowUpRight className="size-3" />
              </Link>
            );
          }
          const id = row.original.recordId;
          return id ? <span className="code text-[12px] text-muted-foreground/70">{id.slice(0, 8)}</span> : <span className="text-muted-foreground/40">—</span>;
        },
      },
      {
        accessorKey: 'summary',
        header: 'Özet',
        meta: { flex: true, mobile: 'title' },
        cell: ({ getValue }) => <span className="truncate">{getValue<string>() ?? '—'}</span>,
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
        searchable={false}
        filters={[]}
        columnToggle={false}
        pagination={false}
        onRowClick={setSelected}
        emptyTitle="Kayıt yok"
        emptyDescription="Seçili filtrelerle eşleşen bir denetim kaydı bulunamadı."
      />

      <Sheet open={Boolean(selected)} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {(() => {
                    const info = AUDIT_ACTION_INFO[selected.action];
                    return <StatusBadge status={selected.action} label={info?.label ?? selected.action} tone={info?.tone ?? 'neutral'} />;
                  })()}
                  <span className="code text-[13px] font-normal text-muted-foreground">{tableLabel(selected.tableName)}</span>
                </SheetTitle>
                <SheetDescription>{selected.summary ?? 'Özet yok'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                  <dt className="text-muted-foreground">Zaman</dt>
                  <dd className="num text-right">{formatDateTime(selected.at)}</dd>
                  <dt className="text-muted-foreground">Kullanıcı</dt>
                  <dd className="truncate text-right">{selected.userFullName ?? selected.userEmail ?? 'Sistem'}</dd>
                  <dt className="text-muted-foreground">Kayıt ID</dt>
                  <dd className="code truncate text-right text-[11px]">{selected.recordId ?? '—'}</dd>
                  {selected.document ? (
                    <>
                      <dt className="text-muted-foreground">Belge</dt>
                      <dd className="text-right">
                        <Link href={selected.document.href} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          {selected.document.typeLabel} {selected.document.docNo} <ArrowUpRight className="size-3" />
                        </Link>
                      </dd>
                    </>
                  ) : null}
                </dl>
                <div>
                  <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Değişiklik</h3>
                  <AuditDiff before={selected.before} after={selected.after} />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
