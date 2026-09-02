'use client';

import { useMemo } from 'react';
import { KeyRound, UserX, UserCheck, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDateTime, relativeTime, initials } from '@/lib/format';
import { roleLabel } from '@/components/app-shell/user-menu';
import type { UserRow } from '../queries';

const ROLE_ORDER = ['admin', 'genel_mudur', 'muhasebe', 'finans', 'satis', 'satin_alma', 'depo', 'uretim_sefi', 'uretim_operatoru', 'kalite', 'bakim', 'arge', 'ihracat'];

export function UsersTable({ users }: { users: UserRow[] }) {
  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Ad Soyad',
        meta: { mobile: 'title' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2.5">
            <Avatar className="size-6 border">
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(row.original.fullName)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.fullName}</span>
          </span>
        ),
      },
      { accessorKey: 'email', header: 'E-posta', meta: { mobile: 'subtitle', className: 'text-muted-foreground' } },
      {
        id: 'roles',
        accessorFn: (r) => r.roles,
        header: 'Roller',
        enableSorting: false,
        filterFn: (row, _id, value: string[]) => row.original.roles.some((r) => value.includes(r)),
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.length ? (
              row.original.roles.map((r) => (
                <Badge key={r} variant="secondary" className="h-5 px-1.5 text-[11px] font-medium">
                  {roleLabel(r)}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => (r.isActive ? 'active' : 'inactive'),
        header: 'Durum',
        meta: { mobile: 'badge', width: 110 },
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} kind="user" />,
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Son giriş',
        meta: { width: 150 },
        sortingFn: (a, b) => (a.original.lastLoginAt ?? '').localeCompare(b.original.lastLoginAt ?? ''),
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? (
            <span title={formatDateTime(v)} className="text-muted-foreground">
              {relativeTime(v)}
            </span>
          ) : (
            <span className="text-muted-foreground/60">Hiç girmedi</span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Oluşturma',
        meta: { width: 150, mobile: 'hidden' },
        cell: ({ getValue }) => <span className="num text-xs text-muted-foreground">{formatDateTime(getValue<string>())}</span>,
      },
    ],
    [],
  );

  const filters: DataTableFilter[] = [
    {
      columnId: 'status',
      title: 'Durum',
      options: [
        { value: 'active', label: 'Aktif', tone: 'success' },
        { value: 'inactive', label: 'Pasif', tone: 'muted' },
      ],
    },
    {
      columnId: 'roles',
      title: 'Rol',
      options: ROLE_ORDER.map((r) => ({ value: r, label: roleLabel(r) })),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      getRowId={(u) => u.id}
      searchPlaceholder="Ad veya e-posta ara…"
      filters={filters}
      initialSorting={[{ id: 'fullName', desc: false }]}
      emptyTitle="Henüz kullanıcı yok"
      emptyDescription="Seed çalıştırıldığında test hesapları burada listelenir (pnpm db:seed)."
      rowActions={(u) => [
        { label: 'Düzenle', icon: Pencil, onSelect: () => toast.info('Kullanıcı düzenleme yakında.') },
        { label: 'Şifre sıfırla', icon: KeyRound, onSelect: () => toast.info('Şifre sıfırlama yakında.') },
        u.isActive
          ? { label: 'Pasifleştir', icon: UserX, destructive: true, separatorBefore: true, onSelect: () => toast.info('Pasifleştirme yakında.') }
          : { label: 'Aktifleştir', icon: UserCheck, separatorBefore: true, onSelect: () => toast.info('Aktifleştirme yakında.') },
      ]}
    />
  );
}
