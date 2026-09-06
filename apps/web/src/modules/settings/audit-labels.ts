import type { StatusTone } from '@/lib/status';

/** `audit_action` enum değerleri için Türkçe etiket + ton (StatusBadge `label`/`tone` ile kullanılır) */
export const AUDIT_ACTION_INFO: Record<string, { label: string; tone: StatusTone }> = {
  create: { label: 'Oluşturuldu', tone: 'success' },
  update: { label: 'Güncellendi', tone: 'info' },
  delete: { label: 'Silindi', tone: 'danger' },
  post: { label: 'Fişlendi', tone: 'primary' },
  cancel: { label: 'İptal', tone: 'danger' },
  approve: { label: 'Onaylandı', tone: 'success' },
  reject: { label: 'Reddedildi', tone: 'danger' },
  login: { label: 'Giriş', tone: 'neutral' },
  import: { label: 'İçe Aktarım', tone: 'neutral' },
  sync: { label: 'Senkron', tone: 'neutral' },
  other: { label: 'Diğer', tone: 'muted' },
};

export const AUDIT_ACTION_ORDER = ['create', 'update', 'post', 'approve', 'cancel', 'reject', 'delete', 'login', 'import', 'sync', 'other'];
