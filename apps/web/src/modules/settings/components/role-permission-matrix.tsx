'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, Loader2, Save, ShieldOff, ShieldCheck, Minus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { updateRolePermissionsAction, setRoleActiveAction } from '../actions';
import type { RoleOverview } from '../queries';
import { MODULE_LABELS, ACTION_LABELS, type PermissionMatrix } from '../permission-matrix';

function sameSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false;
  for (const c of b) if (!a.has(c)) return false;
  return true;
}

export function RolePermissionMatrix({ role, matrix }: { role: RoleOverview; matrix: PermissionMatrix }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role.permissionCodes));
  const [saving, startSaving] = useTransition();
  const [togglingActive, startTogglingActive] = useTransition();

  // Rol değişince (URL ?role=… ile) ya da sunucu yeniden doğrulayınca (router.refresh) yerel seçim
  // sunucudaki gerçek duruma sıfırlanır.
  useEffect(() => {
    setSelected(new Set(role.permissionCodes));
  }, [role.id, role.permissionCodes]);

  const dirty = !sameSet(selected, role.permissionCodes);
  const locked = role.isLocked;
  const editable = !locked && role.isActive;

  const toggle = (code: string) => {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleRow = (moduleKey: string) => {
    if (!editable) return;
    const rowCodes = Object.values(matrix.grid[moduleKey] ?? {})
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => c.code);
    const allChecked = rowCodes.every((c) => selected.has(c));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of rowCodes) {
        if (allChecked) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  };

  const rowCounts = useMemo(() => {
    const out: Record<string, { total: number; checked: number }> = {};
    for (const m of matrix.modules) {
      const codes = Object.values(matrix.grid[m] ?? {})
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => c.code);
      out[m] = { total: codes.length, checked: codes.filter((c) => selected.has(c)).length };
    }
    return out;
  }, [matrix, selected]);

  function save() {
    startSaving(async () => {
      const res = await updateRolePermissionsAction({ roleId: role.id, permissionCodes: Array.from(selected) });
      if (res.ok) {
        toast.success(res.message ?? 'İzinler kaydedildi');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function toggleActive(active: boolean) {
    const res = await setRoleActiveAction({ roleId: role.id, active });
    if (res.ok) {
      toast.success(res.message ?? 'Kaydedildi');
      router.refresh();
      return { ok: true };
    }
    return { ok: false, error: res.error };
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold">{role.name}</h2>
            <span className="code text-[12px] text-muted-foreground">{role.code}</span>
            {locked ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-muted px-2 text-[11px] font-medium text-muted-foreground">
                <Lock className="size-3" /> Kilitli
              </span>
            ) : null}
            {!role.isActive ? <StatusBadge status="inactive" label="Pasif" tone="warning" dot={false} /> : null}
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {role.userCount} kullanıcı · {role.permissionCodes.length} izin
            {role.description ? ` · ${role.description}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {locked ? null : role.isActive ? (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm" className="h-11 md:h-8">
                  <ShieldOff className="size-3.5" /> Pasifleştir
                </Button>
              }
              title={`"${role.name}" rolünü pasifleştir`}
              description="Bu rolün tüm izinleri kaldırılır (kullanıcılar rolü korur ama izinleri kaybeder). İzin kodları saklanır — istediğiniz zaman aktifleştirip geri yükleyebilirsiniz."
              confirmLabel="Pasifleştir"
              destructive
              onConfirm={() => toggleActive(false)}
            />
          ) : (
            <Button variant="outline" size="sm" className="h-11 md:h-8" disabled={togglingActive} onClick={() => startTogglingActive(async () => { const r = await toggleActive(true); if (!r.ok) toast.error(r.error); })}>
              {togglingActive ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} Aktifleştir
            </Button>
          )}
          {editable ? (
            <Button size="sm" className="h-11 md:h-8" disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Kaydet
            </Button>
          ) : null}
        </div>
      </div>

      {locked ? (
        <p className="mb-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          Sistem yöneticisi rolü her zaman tüm izinlere sahiptir; matris burada yalnızca bilgi amaçlıdır ve düzenlenemez.
        </p>
      ) : null}

      {/* Matris: kendi kabında yatay kaydırılır — sayfa yatay taşımaz (contain-paint aynı DataTable deseni). */}
      <div className="contain-paint scrollbar-thin scroll-fade-x max-h-[calc(100dvh-20rem)] overflow-auto rounded-lg border border-border/60">
        <table className="border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-[var(--muted)]">
            <tr className="border-b border-border/60">
              <th scope="col" className="sticky left-0 z-20 h-9 min-w-[168px] border-r border-border/60 bg-[var(--muted)] px-3 text-left align-middle text-[12px] font-medium text-muted-foreground">
                Modül
              </th>
              {matrix.actions.map((a) => (
                <th key={a} scope="col" className="h-9 min-w-[92px] px-2 text-center align-middle text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                  {ACTION_LABELS[a] ?? a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.modules.map((m) => {
              const counts = rowCounts[m];
              const rowAllChecked = counts && counts.total > 0 && counts.checked === counts.total;
              return (
                <tr key={m} className="h-10 border-b border-border/50 last:border-0 hover:bg-accent/30">
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 h-10 min-w-[168px] border-r border-border/60 bg-background px-3 text-left align-middle text-[13px] font-medium',
                      editable && 'cursor-pointer hover:bg-accent/40',
                    )}
                    onClick={() => toggleRow(m)}
                    title={editable ? 'Bu modülün tüm izinlerini aç/kapat' : undefined}
                  >
                    <span className="flex items-center justify-between gap-2">
                      {MODULE_LABELS[m] ?? m}
                      <span className={cn('tabular-nums text-[11px] font-normal', rowAllChecked ? 'text-primary' : 'text-muted-foreground')}>
                        {counts?.checked ?? 0}/{counts?.total ?? 0}
                      </span>
                    </span>
                  </th>
                  {matrix.actions.map((a) => {
                    const cell = matrix.grid[m]?.[a];
                    if (!cell) {
                      return (
                        <td key={a} className="h-10 px-2 text-center align-middle">
                          <Minus className="mx-auto size-3 text-muted-foreground/25" aria-hidden />
                        </td>
                      );
                    }
                    const checked = selected.has(cell.code);
                    return (
                      <td key={a} className="h-10 px-2 text-center align-middle">
                        <Checkbox
                          checked={checked}
                          disabled={!editable}
                          onCheckedChange={() => toggle(cell.code)}
                          aria-label={`${MODULE_LABELS[m] ?? m} — ${ACTION_LABELS[a] ?? a} (${cell.code})`}
                          className="mx-auto size-5 md:size-4"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
