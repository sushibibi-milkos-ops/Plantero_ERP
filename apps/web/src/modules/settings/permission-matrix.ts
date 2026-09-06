import { PERMISSIONS } from '@plantero/core/auth/rbac';

/**
 * İzin matrisi (Ayarlar > Roller) — modül × eylem ızgarası.
 * `PERMISSIONS` sözlüğündeki her kod `<modul>.<eylem>` biçimindedir; burada modüller satır,
 * eylemler sütun olacak şekilde bir ızgaraya dönüştürülür. Modüller arası eylem kümesi farklı
 * olduğundan (ör. `stock.receive` var ama `sales.receive` yok) ızgara doğal olarak seyrektir —
 * bu yüzden görev tanımının istediği "mobilde yatay kaydırma" davranışı organik olarak ortaya
 * çıkar (32 sütun × 13 satır tek ekrana sığmaz, kendi kabında kaydırılır).
 */

export const MODULE_LABELS: Record<string, string> = {
  masterdata: 'Ana Veri',
  stock: 'Depo',
  production: 'Üretim',
  sales: 'Satış',
  purchasing: 'Satın Alma',
  quality: 'Kalite',
  accounting: 'Muhasebe',
  finance: 'Finans',
  export: 'İhracat',
  maintenance: 'Bakım',
  rnd: 'Ar-Ge',
  cockpit: 'Kokpit',
  admin: 'Yönetim',
};

export const ACTION_LABELS: Record<string, string> = {
  view: 'Görüntüle',
  manage: 'Yönet',
  receive: 'Mal Kabul',
  pick: 'Sevk Et',
  transfer: 'Transfer',
  count: 'Sayım',
  approve_count: 'Sayım Onayı',
  plan: 'Planla',
  operate: 'Operatör',
  close: 'Kapat',
  quote: 'Teklif',
  order: 'Sipariş',
  confirm: 'Onayla',
  price: 'Fiyat',
  draft: 'Taslak',
  approve: 'Onay',
  send: 'Gönder',
  inspect: 'Kontrol',
  release: 'Serbest Bırak',
  recall: 'Geri Çağır',
  post: 'Fişle',
  invoice: 'Faturala',
  einvoice: 'e-Fatura',
  reconcile: 'Mutabakat',
  close_period: 'Dönem Kapat',
  dunning: 'Hatırlatma',
  report: 'Arıza Bildir',
  execute: 'Yürüt',
  users: 'Kullanıcı/Rol',
  settings: 'Sistem Ayarı',
  audit: 'Denetim Kaydı',
};

export type MatrixCell = { code: string; description: string | null };

export type PermissionMatrix = {
  /** Satır sırası (ilk görülme sırası — nav.ts gruplarıyla aynı akış) */
  modules: string[];
  /** Sütun sırası (ilk görülme sırası) */
  actions: string[];
  /** `grid[module][action]` — o modülde o eylem izni tanımlıysa hücre, yoksa `undefined` */
  grid: Record<string, Record<string, MatrixCell | undefined>>;
};

export function buildPermissionMatrix(): PermissionMatrix {
  const modules: string[] = [];
  const actions: string[] = [];
  const grid: PermissionMatrix['grid'] = {};

  for (const p of PERMISSIONS) {
    const dotIdx = p.code.indexOf('.');
    const action = dotIdx >= 0 ? p.code.slice(dotIdx + 1) : p.code;
    if (!modules.includes(p.module)) modules.push(p.module);
    if (!actions.includes(action)) actions.push(action);
    (grid[p.module] ??= {})[action] = { code: p.code, description: p.description ?? null };
  }

  return { modules, actions, grid };
}
