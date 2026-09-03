/** Satış modülü etiket sözlükleri (durum bazlı olmayan, ekrana özel). */

export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  call: 'Arama',
  email: 'E-posta',
  meeting: 'Toplantı',
  note: 'Not',
  whatsapp: 'WhatsApp',
};

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  customer: 'Müşteri özel',
  channel: 'Kanal listesi',
  list: 'Liste fiyatı',
  manual: 'Elle girildi',
};

export const CHANNEL_KIND_LABELS: Record<string, string> = {
  marketplace: 'Pazaryeri',
  own_site: 'Kendi sitesi',
  wholesale: 'Toptan',
  retail_chain: 'Zincir market',
  export: 'İhracat',
  raw_material: 'Hammadde satışı',
};

export const CHANNEL_SYNC_SUPPORTED = new Set(['TRENDYOL', 'HEPSIBURADA']);
