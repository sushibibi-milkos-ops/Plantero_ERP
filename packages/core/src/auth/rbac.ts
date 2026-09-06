import type { UserCtx } from '../types.js';

export type PermissionDef = { code: string; module: string; description: string };

/** İzin kodları: `<modul>.<eylem>` — ARCHITECTURE §4 ile birebir */
export const PERMISSIONS: readonly PermissionDef[] = [
  { code: 'masterdata.view', module: 'masterdata', description: 'Ana veriyi görüntüle (ürün, cari, reçete, depo)' },
  { code: 'masterdata.manage', module: 'masterdata', description: 'Ana veriyi düzenle / içe aktar' },

  { code: 'stock.view', module: 'stock', description: 'Stok, lot ve hareketleri görüntüle' },
  { code: 'stock.receive', module: 'stock', description: 'Mal kabul yap' },
  { code: 'stock.pick', module: 'stock', description: 'Sevkiyat topla / sevk et' },
  { code: 'stock.transfer', module: 'stock', description: 'Lokasyonlar arası transfer' },
  { code: 'stock.count', module: 'stock', description: 'Sayım gir' },
  { code: 'stock.approve_count', module: 'stock', description: 'Sayım farkını onayla ve kaydet' },

  { code: 'production.view', module: 'production', description: 'İş emirlerini görüntüle' },
  { code: 'production.plan', module: 'production', description: 'İş emri oluştur / planla' },
  { code: 'production.operate', module: 'production', description: 'Operatör ekranı: başlat, okut, fire, bitir' },
  { code: 'production.close', module: 'production', description: 'İş emrini kapat (maliyet kesinleşir)' },

  { code: 'sales.view', module: 'sales', description: 'Satış belgelerini görüntüle' },
  { code: 'sales.quote', module: 'sales', description: 'Teklif ve fırsat oluştur' },
  { code: 'sales.order', module: 'sales', description: 'Sipariş oluştur / düzenle' },
  { code: 'sales.confirm', module: 'sales', description: 'Siparişi onayla' },
  { code: 'sales.price', module: 'sales', description: 'Fiyat listesi ve müşteri özel fiyat yönet' },

  { code: 'purchasing.view', module: 'purchasing', description: 'Satın alma belgelerini görüntüle' },
  { code: 'purchasing.draft', module: 'purchasing', description: 'Satın alma siparişi taslağı oluştur' },
  { code: 'purchasing.approve', module: 'purchasing', description: 'Satın alma siparişini onayla' },
  { code: 'purchasing.send', module: 'purchasing', description: 'Siparişi tedarikçiye gönder' },

  { code: 'quality.view', module: 'quality', description: 'Kalite kayıtlarını görüntüle' },
  { code: 'quality.inspect', module: 'quality', description: 'Kalite kontrolü yap' },
  { code: 'quality.release', module: 'quality', description: 'Lot serbest bırak / reddet' },
  { code: 'quality.recall', module: 'quality', description: 'Geri çağırma başlat / simüle et' },

  { code: 'accounting.view', module: 'accounting', description: 'Muhasebe kayıtlarını görüntüle' },
  { code: 'accounting.post', module: 'accounting', description: 'Yevmiye fişi kaydet / ters kayıt' },
  { code: 'accounting.invoice', module: 'accounting', description: 'Fatura kes / alış faturası gir' },
  { code: 'accounting.einvoice', module: 'accounting', description: 'e-Fatura / e-Arşiv / e-İrsaliye gönder' },
  { code: 'accounting.reconcile', module: 'accounting', description: 'Banka mutabakatı yap' },
  { code: 'accounting.close_period', module: 'accounting', description: 'Dönem kapat' },

  { code: 'finance.view', module: 'finance', description: 'Finans ekranlarını görüntüle' },
  { code: 'finance.manage', module: 'finance', description: 'Kredi, bütçe, nakit akışı yönet' },
  { code: 'finance.dunning', module: 'finance', description: 'Tahsilat hatırlatması gönder' },

  { code: 'export.view', module: 'export', description: 'İhracat sevkiyatlarını görüntüle' },
  { code: 'export.manage', module: 'export', description: 'İhracat belgeleri ve sevkiyat yönet' },

  { code: 'maintenance.view', module: 'maintenance', description: 'Bakım kayıtlarını görüntüle' },
  { code: 'maintenance.report', module: 'maintenance', description: 'Arıza bildir' },
  { code: 'maintenance.plan', module: 'maintenance', description: 'Bakım planı oluştur' },
  { code: 'maintenance.execute', module: 'maintenance', description: 'Bakım iş emrini yürüt / kapat' },

  { code: 'rnd.view', module: 'rnd', description: 'Ar-Ge projelerini görüntüle' },
  { code: 'rnd.manage', module: 'rnd', description: 'Ar-Ge projesi ve deneme reçetesi yönet' },
  { code: 'rnd.release', module: 'rnd', description: 'Deneme reçetesini üretime devret' },

  { code: 'cockpit.view', module: 'cockpit', description: 'Yönetim kokpiti' },

  { code: 'admin.users', module: 'admin', description: 'Kullanıcı ve rol yönetimi' },
  { code: 'admin.settings', module: 'admin', description: 'Sistem ayarları' },
  { code: 'admin.audit', module: 'admin', description: 'Denetim günlüğü' },
] as const;

export const ALL_PERMISSION_CODES: readonly string[] = PERMISSIONS.map((p) => p.code);

export const ROLE_CODES = [
  'admin', 'genel_mudur', 'muhasebe', 'finans', 'satis', 'satin_alma', 'depo',
  'uretim_operatoru', 'uretim_sefi', 'kalite', 'bakim', 'arge', 'ihracat',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_NAMES: Record<RoleCode, string> = {
  admin: 'Sistem Yöneticisi',
  genel_mudur: 'Genel Müdür',
  muhasebe: 'Muhasebe',
  finans: 'Finans',
  satis: 'Satış',
  satin_alma: 'Satın Alma',
  depo: 'Depo',
  uretim_operatoru: 'Üretim Operatörü',
  uretim_sefi: 'Üretim Şefi',
  kalite: 'Kalite',
  bakim: 'Bakım',
  arge: 'Ar-Ge',
  ihracat: 'İhracat',
};

const byModule = (...modules: string[]) => ALL_PERMISSION_CODES.filter((c) => modules.includes(c.split('.')[0] ?? ''));
const views = (...modules: string[]) => modules.map((m) => `${m}.view`);

/** Rol → izin kodları. admin: tümü. */
export const ROLE_PRESETS: Record<RoleCode, readonly string[]> = {
  admin: ALL_PERMISSION_CODES,
  genel_mudur: [
    ...ALL_PERMISSION_CODES.filter((c) => !c.startsWith('admin.')),
    'admin.audit',
  ],
  muhasebe: [
    ...byModule('accounting'),
    ...views('masterdata', 'stock', 'sales', 'purchasing', 'finance', 'export', 'cockpit'),
    'masterdata.manage', 'finance.dunning',
  ],
  finans: [
    ...byModule('finance'),
    ...views('accounting', 'sales', 'purchasing', 'masterdata', 'cockpit', 'export'),
    'accounting.reconcile',
  ],
  satis: [
    ...byModule('sales'),
    ...views('masterdata', 'stock', 'accounting', 'finance', 'export', 'cockpit'),
    'accounting.invoice', 'finance.dunning',
  ],
  satin_alma: [
    ...byModule('purchasing'),
    ...views('masterdata', 'stock', 'quality', 'accounting', 'production'),
    'masterdata.manage', 'accounting.invoice',
  ],
  // cockpit.view (depo/uretim_sefi/kalite/bakim, dördü de): docs/modules/kokpit.md bu 4 rol için
  // AÇIKÇA kendi kart setini ister ("depo/üretim şefi/.../kalite/bakım rolleri için kendi kart
  // setleri") — kokpit modülü inşa edilene kadar bu 4 rolde `cockpit.view` hiç yoktu (yalnızca
  // admin/genel_mudur/muhasebe/finans/satis'te), yani /kokpit'e bu rollerle hiç girilemiyordu.
  // Modül sözleşmesinin istediği ekranı ERİŞİLEBİLİR kılmak için eklendi — packages/db/src/seed/core.ts
  // `ROLE_PRESETS` ile BİREBİR aynı kalmalı (bkz. o dosyadaki not: "iki dosya birlikte güncellenmeli").
  depo: [
    ...byModule('stock'),
    ...views('masterdata', 'sales', 'purchasing', 'production', 'quality', 'cockpit'),
  ],
  uretim_operatoru: [
    'production.view', 'production.operate',
    'stock.view', 'maintenance.report', 'masterdata.view', 'quality.view',
  ],
  uretim_sefi: [
    ...byModule('production'),
    'stock.view', 'stock.transfer', 'stock.count',
    ...views('masterdata', 'quality', 'maintenance', 'purchasing', 'sales', 'rnd', 'cockpit'),
    'maintenance.report', 'quality.inspect',
  ],
  kalite: [
    ...byModule('quality'),
    ...views('masterdata', 'stock', 'production', 'purchasing', 'rnd', 'cockpit'),
    'stock.transfer',
  ],
  bakim: [
    ...byModule('maintenance'),
    ...views('production', 'masterdata', 'stock', 'cockpit'),
  ],
  arge: [
    ...byModule('rnd'),
    ...views('masterdata', 'production', 'quality', 'stock'),
    'masterdata.manage',
  ],
  ihracat: [
    ...byModule('export'),
    ...views('sales', 'stock', 'masterdata', 'accounting', 'finance'),
    'sales.quote', 'sales.order', 'accounting.invoice',
  ],
};

for (const role of ROLE_CODES) {
  // Tekilleştir (spread'lerde tekrar olabilir)
  ROLE_PRESETS[role] = Array.from(new Set(ROLE_PRESETS[role]));
}

/** Kullanıcı verilen izne sahip mi? admin rolü ve `*` izni her şeye yetkilidir. */
export function hasPermission(ctx: Pick<UserCtx, 'roles' | 'permissions'> | null | undefined, code: string): boolean {
  if (!ctx) return false;
  if (ctx.roles.includes('admin')) return true;
  if (ctx.permissions.includes('*')) return true;
  return ctx.permissions.includes(code);
}

export function hasAnyPermission(ctx: Pick<UserCtx, 'roles' | 'permissions'> | null | undefined, codes: string[]): boolean {
  return codes.some((c) => hasPermission(ctx, c));
}

/** Bir rol setinin efektif izinleri (preset'lerden) */
export function permissionsForRoles(roles: string[]): string[] {
  const set = new Set<string>();
  for (const r of roles) for (const p of ROLE_PRESETS[r as RoleCode] ?? []) set.add(p);
  return Array.from(set);
}
