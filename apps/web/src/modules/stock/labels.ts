import type { StatusTone } from '@/lib/status';

/** Ürün tipi (T hanesi) → Türkçe etiket + tablo rozeti tonu — depo ekranları için yerel kopya. */
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

export const PRODUCT_TYPE_TONE: Record<string, StatusTone> = {
  finished: 'primary',
  semi_finished: 'info',
  raw_material: 'neutral',
  packaging: 'neutral',
  merchandise: 'info',
  equipment: 'warning',
  fixed_asset: 'muted',
  service: 'muted',
};

export const RECEIPT_DISPOSITION_LABELS: Record<string, string> = {
  quarantine: 'Karantina',
  released: 'Serbest',
  rejected: 'Red',
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

export const MOVE_KIND_LABELS: Record<string, string> = {
  receipt: 'Mal kabul',
  delivery: 'Sevkiyat',
  transfer: 'Transfer',
  consumption: 'Üretim tüketimi',
  production: 'Üretim çıktısı',
  byproduct: 'Yan ürün',
  scrap: 'Fire/hurda',
  count_gain: 'Sayım fazlası',
  count_loss: 'Sayım eksiği',
  quarantine_release: 'Karantina → serbest',
  quarantine_reject: 'Karantina → red',
  return_in: 'Müşteri iadesi',
  return_out: 'Tedarikçiye iade',
  opening: 'Açılış',
  recall_return: 'Geri çağırma iadesi',
};

export const SCRAP_REASON_LABELS: Record<string, string> = {
  expired: 'SKT geçti',
  damaged: 'Hasarlı',
  production_loss: 'Üretim firesi',
  qc_reject: 'Kalite reddi',
  other: 'Diğer',
};
