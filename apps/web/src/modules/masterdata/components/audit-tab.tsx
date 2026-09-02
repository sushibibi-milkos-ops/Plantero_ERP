import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { formatDateTime } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  create: 'Oluşturuldu', update: 'Güncellendi', delete: 'Silindi', post: 'Kaydedildi',
  cancel: 'İptal edildi', approve: 'Onaylandı', reject: 'Reddedildi', login: 'Giriş', import: 'İçe aktarıldı', sync: 'Senkron', other: 'Diğer',
};
const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  create: 'success', update: 'info', delete: 'danger', approve: 'success', reject: 'danger', import: 'info',
};

export type AuditRow = { id: string; at: string; userEmail: string | null; action: string; summary: string | null };

/** Genel amaçlı denetim (audit) sekmesi — ürün, cari, reçete, lokasyon detaylarında kullanılır. */
export function AuditTab({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) return <EmptyState compact title="Denetim kaydı yok" description="Bu kayıt üzerinde henüz izlenen bir işlem yapılmadı." />;
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-[12px] text-muted-foreground">
            <th className="h-9 px-3 text-left font-medium">Zaman</th>
            <th className="h-9 px-3 text-left font-medium">Kullanıcı</th>
            <th className="h-9 px-3 text-left font-medium">Eylem</th>
            <th className="h-9 px-3 text-left font-medium">Açıklama</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="h-9 border-b border-border/50 last:border-0">
              <td className="px-3 whitespace-nowrap text-muted-foreground">{formatDateTime(r.at)}</td>
              <td className="px-3 whitespace-nowrap">{r.userEmail ?? 'sistem'}</td>
              <td className="px-3">
                <StatusBadge status={r.action} label={ACTION_LABELS[r.action] ?? r.action} tone={ACTION_TONE[r.action] ?? 'neutral'} />
              </td>
              <td className="px-3 text-muted-foreground">{r.summary ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
