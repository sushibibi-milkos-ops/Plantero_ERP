/** Ürün tipi (T hanesi) → Türkçe etiket + tablo rozeti tonu. Ortak `lib/status.ts` sözlüğünde yok — burada tutulur. */
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  finished: 'Mamul',
  semi_finished: 'Yarı Mamul',
  raw_material: 'Hammadde',
  packaging: 'Ambalaj',
  merchandise: 'Ticari Mal',
  equipment: 'Ekipman',
  fixed_asset: 'Demirbaş',
  service: 'Hizmet',
};

export const PRODUCT_TYPE_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'warning' | 'muted'> = {
  // Taksonomi değeridir (marka rengiyle karıştırılmasın) — yeşil/primary yalnızca "durum" anlamına ayrılır.
  finished: 'neutral',
  semi_finished: 'info',
  raw_material: 'neutral',
  packaging: 'neutral',
  merchandise: 'info',
  equipment: 'warning',
  fixed_asset: 'muted',
  service: 'muted',
};

export const PARTNER_KIND_LABELS: Record<string, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  both: 'Müşteri + Tedarikçi',
  bank: 'Banka',
  other: 'Diğer',
};

export const PAYMENT_TERM_LABELS: Record<string, string> = {
  cash: 'Peşin',
  days: 'Vadeli',
  marketplace_cycle: 'Pazaryeri hakediş dönemi',
};

export const LOCATION_USAGE_LABELS: Record<string, string> = {
  internal: 'Depo',
  quarantine: 'Karantina',
  rejected: 'Red',
  production: 'Üretim',
  supplier: 'Tedarikçi (sanal)',
  customer: 'Müşteri (sanal)',
  inventory_loss: 'Sayım farkı',
  scrap: 'Hurda',
  transit: 'Transit',
  view: 'Görünüm (gruplama)',
};

export const BOM_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  archived: 'Arşiv',
};
