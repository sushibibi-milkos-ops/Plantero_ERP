import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import type { MachineFormOption } from './report-breakdown-form';

const STATUS_ORDER: Record<string, number> = { down: 0, maintenance: 1, running: 2, idle: 3, retired: 4 };

/**
 * "Arıza Bildir" yan panelinin ikinci kartı (bakim-yeni-02): tüm aktif makineler, dikkat gerektiren
 * (arızalı/bakımda) önce. Sabit yükseklik + iç kaydırma — panel viewport'u büyütmeden gerçek bir
 * bağlam alanı (36 makine) sağlar, sahadaki telefon akışına dokunmaz (yalnızca `lg:` görünür).
 */
export function MachineQuickList({ machines }: { machines: MachineFormOption[] }) {
  const sorted = [...machines].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.code.localeCompare(b.code));
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <h2 className="mb-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Makineler ({machines.length})</h2>
      <ul className="max-h-[420px] space-y-0.5 overflow-y-auto">
        {sorted.map((m) => (
          <li key={m.id}>
            <Link href={`/bakim/makineler/${m.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
              <span className="min-w-0 truncate text-[13px]">
                <span className="font-mono text-[11px] text-muted-foreground">{m.code}</span> {m.name}
              </span>
              <StatusBadge status={m.status} kind="machine" size="sm" className="shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
