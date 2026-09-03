/** Üretim modülü Türkçe sözlükleri — StatusBadge dışı özel etiketler */

export const SCRAP_REASON_LABELS: Record<string, string> = {
  spill: 'Dökülme',
  burnt: 'Yanma',
  contamination: 'Kontaminasyon',
  packaging: 'Ambalaj hatası',
  startup: 'Başlangıç ayarı',
  other: 'Diğer',
};

export const SCRAP_STAGE_LABELS: Record<string, string> = {
  hammadde: 'Hammadde',
  proses: 'Proses',
  ambalaj: 'Ambalaj',
};

export const DOWNTIME_REASON_LABELS: Record<string, string> = {
  machine_failure: 'Arıza',
  material_wait: 'Malzeme bekleme',
  cleaning: 'Temizlik',
  break: 'Mola',
  changeover: 'Ürün değişimi',
  other: 'Diğer',
};

export const WORK_ORDER_EVENT_LABELS: Record<string, string> = {
  start: 'Başlatıldı',
  pause: 'Duraklatıldı',
  resume: 'Devam edildi',
  finish: 'Bitirildi',
  scan: 'Malzeme okutuldu',
  scrap: 'Fire girildi',
  output: 'Mamul çıktısı',
  note: 'Not',
  downtime: 'Duruş',
};
