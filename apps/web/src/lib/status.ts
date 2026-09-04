/**
 * Durum sözlüğü — şemadaki tüm enum durumları için Türkçe etiket + renk tonu.
 * StatusBadge bu sözlüğü kullanır. Aynı kod (örn. `draft`) birden çok enumda geçer;
 * `kind` verilirse o enumun özel etiketi, verilmezse genel etiket kullanılır.
 */

export type StatusTone = 'neutral' | 'muted' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

export type StatusInfo = { label: string; tone: StatusTone };

export type StatusKind =
  | 'sales_order'
  | 'invoice'
  | 'e_invoice'
  | 'payment'
  | 'delivery'
  | 'receipt'
  | 'transfer'
  | 'count'
  | 'lot'
  | 'lot_origin'
  | 'work_order'
  | 'purchase_order'
  | 'qc'
  | 'recall'
  | 'machine'
  | 'maintenance'
  | 'maintenance_priority'
  | 'maintenance_kind'
  | 'opportunity'
  | 'export'
  | 'export_doc'
  | 'dunning'
  | 'rnd_project'
  | 'trial'
  | 'journal_entry'
  | 'bank_tx'
  | 'recon_match'
  | 'vat_period'
  | 'fiscal_period'
  | 'approval'
  | 'notification'
  | 'product'
  | 'bom'
  | 'user'
  | 'job_run'
  | 'generic';

/** Genel (enum bağımsız) etiketler */
const GENERIC: Record<string, StatusInfo> = {
  draft: { label: 'Taslak', tone: 'muted' },
  sent: { label: 'Gönderildi', tone: 'info' },
  accepted: { label: 'Kabul edildi', tone: 'info' },
  confirmed: { label: 'Onaylandı', tone: 'primary' },
  approved: { label: 'Onaylandı', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
  pending: { label: 'Bekliyor', tone: 'warning' },
  pending_approval: { label: 'Onay bekliyor', tone: 'warning' },
  posted: { label: 'Kaydedildi', tone: 'success' },
  paid: { label: 'Ödendi', tone: 'success' },
  partially_paid: { label: 'Kısmen ödendi', tone: 'info' },
  partially_delivered: { label: 'Kısmen teslim', tone: 'info' },
  partially_received: { label: 'Kısmen alındı', tone: 'info' },
  delivered: { label: 'Teslim edildi', tone: 'success' },
  received: { label: 'Alındı', tone: 'success' },
  invoiced: { label: 'Faturalandı', tone: 'success' },
  shipped: { label: 'Sevk edildi', tone: 'info' },
  closed: { label: 'Kapalı', tone: 'neutral' },
  cancelled: { label: 'İptal', tone: 'danger' },
  lost: { label: 'Kaybedildi', tone: 'danger' },
  done: { label: 'Tamamlandı', tone: 'success' },
  finished: { label: 'Bitti', tone: 'success' },
  completed: { label: 'Tamamlandı', tone: 'success' },
  in_progress: { label: 'Devam ediyor', tone: 'primary' },
  in_transit: { label: 'Yolda', tone: 'info' },
  planned: { label: 'Planlandı', tone: 'info' },
  released: { label: 'Serbest', tone: 'success' },
  reserved: { label: 'Rezerve', tone: 'info' },
  picking: { label: 'Toplanıyor', tone: 'primary' },
  picked: { label: 'Toplandı', tone: 'info' },
  paused: { label: 'Duraklatıldı', tone: 'warning' },
  active: { label: 'Aktif', tone: 'success' },
  inactive: { label: 'Pasif', tone: 'muted' },
  archived: { label: 'Arşiv', tone: 'muted' },
  expired: { label: 'Süresi doldu', tone: 'danger' },
  open: { label: 'Açık', tone: 'primary' },
  error: { label: 'Hata', tone: 'danger' },
  failed: { label: 'Başarısız', tone: 'danger' },
  running: { label: 'Çalışıyor', tone: 'success' },
  idle: { label: 'Boşta', tone: 'neutral' },
  unknown: { label: 'Bilinmiyor', tone: 'muted' },
};

/** Enum özel etiketler (genel sözlüğü ezer) */
const BY_KIND: Partial<Record<StatusKind, Record<string, StatusInfo>>> = {
  // Yaşam döngüsü boyunca monoton ilerleyen, çakışmayan bir ton skalası: her ton (muted/neutral
  // hariç) yalnızca BİR durumda kullanılır — aynı sütunda iki durum asla aynı renkte görünmez
  // (bkz. status.test.ts). NOT: `primary` ve `success` token'ları aynı yeşil aile (globals.css'te
  // ikisi de hue 152) olduğundan "farklı ton" olsalar da göz için neredeyse ayırt edilemezler —
  // bu yüzden ikisi asla aynı kind içinde birlikte kullanılmaz (yalnızca `delivered` yeşili taşır).
  // draft/sent/confirmed/invoiced/closed/lost "sessiz" gri ailesinde (muted/neutral, tekrar
  // serbest — henüz fiziksel bir şey olmamış ya da idari/kapanış durumları); accepted (mavi),
  // partially_delivered (amber), delivered (tek yeşil), cancelled (kırmızı) kendi rengini taşır.
  // Tur 2 bulgusu: "Faturalandı" (invoiced) gri, "Sevk edildi" (delivered) yeşil görünüyordu — oysa
  // faturalandı süreçte daha ileri bir aşama, en güçlü/"bitti" tonu daha ileri duruma ait olmalı.
  // confirmed/delivered/invoiced üçlüsünde YİNE en fazla biri güçlü ton taşıyabilir (aksi halde
  // Tur 1'deki üç-durum-aynı-yeşil çakışması geri döner, bkz. status.test.ts) — güçlü tonu
  // `delivered`'dan `invoiced`'a taşıyoruz (delivered artık ara/nötr, invoiced tek "success").
  sales_order: {
    draft: { label: 'Taslak', tone: 'muted' },
    sent: { label: 'Teklif gönderildi', tone: 'neutral' },
    accepted: { label: 'Kabul edildi', tone: 'info' },
    confirmed: { label: 'Sipariş onaylı', tone: 'neutral' },
    partially_delivered: { label: 'Kısmen sevk', tone: 'warning' },
    delivered: { label: 'Sevk edildi', tone: 'neutral' },
    invoiced: { label: 'Faturalandı', tone: 'success' },
    closed: { label: 'Kapalı', tone: 'neutral' },
    cancelled: { label: 'İptal', tone: 'danger' },
    lost: { label: 'Kaybedildi', tone: 'neutral' },
  },
  invoice: {
    draft: { label: 'Taslak', tone: 'muted' },
    posted: { label: 'Kesildi', tone: 'info' },
    partially_paid: { label: 'Kısmen tahsil', tone: 'warning' },
    paid: { label: 'Tahsil edildi', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  e_invoice: {
    none: { label: 'e-Belge yok', tone: 'muted' },
    not_sent: { label: 'Gönderilmedi', tone: 'muted' },
    queued: { label: 'Kuyrukta', tone: 'warning' },
    sent: { label: 'GİB’e gönderildi', tone: 'info' },
    accepted: { label: 'Kabul', tone: 'success' },
    rejected: { label: 'Reddedildi', tone: 'danger' },
    error: { label: 'Hata', tone: 'danger' },
  },
  payment: {
    draft: { label: 'Taslak', tone: 'muted' },
    posted: { label: 'Kaydedildi', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  // Tur 4 P1 bulgusu: mavi ton depo modülünde iki farklı anlam taşıyordu — burada "Sevk edildi"
  // (depo tarafında fiilen bitmiş, başarılı) mavi, transfer kind'ında "Yolda" (gerçekten devam eden)
  // da mavi. Ton sözlüğü artık tek bir anlam eksenine sabit: terminal-başarılı = success (yeşil),
  // devam eden = info (mavi), bekleyen = warning (amber), iptal = danger.
  // Tur 5 P2 düzeltmesi: "Sevk edildi"/"Teslim edildi" ayrımı artık StatusBadge'in `subtle`
  // mekanizmasıyla (dolgu/dolgusuz) DEĞİL, tonla kuruluyor — "shipped" ile "delivered" ikisi de
  // dolgulu pil basar ama farklı renk (shipped=primary, delivered=success). Önceki subtle kalıp bu
  // ekranda hiç gerçekleşen bir ayrımı (delivered satırı) varsaymıştı: /depo/sevkiyat listesinde 27
  // satırın 26'sı "shipped" ve tek bir "delivered" satırı yoktu — sonuç sistematik dolgusuzluktu,
  // modül içindeki diğer tüm durum rozetleriyle (Mal Kabul/Transfer/Sayım) tutarsız bir anatomi.
  delivery: {
    draft: { label: 'Taslak', tone: 'muted' },
    reserved: { label: 'Rezerve', tone: 'warning' },
    picking: { label: 'Toplanıyor', tone: 'info' },
    picked: { label: 'Toplandı', tone: 'info' },
    shipped: { label: 'Sevk edildi', tone: 'primary' },
    delivered: { label: 'Teslim edildi', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  receipt: {
    draft: { label: 'Taslak', tone: 'muted' },
    received: { label: 'Mal alındı', tone: 'info' },
    qc_pending: { label: 'Kalite bekliyor', tone: 'warning' },
    done: { label: 'Tamamlandı', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  transfer: {
    draft: { label: 'Taslak', tone: 'muted' },
    in_transit: { label: 'Yolda', tone: 'info' },
    done: { label: 'Tamamlandı', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  count: {
    draft: { label: 'Taslak', tone: 'muted' },
    // "devam eden" — delivery/transfer'daki aynı eksenle tutarlı (Tur 4 P1 bulgusu).
    counting: { label: 'Sayılıyor', tone: 'info' },
    review: { label: 'İncelemede', tone: 'warning' },
    approved: { label: 'Onaylandı', tone: 'success' },
    posted: { label: 'Kaydedildi', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  lot: {
    quarantine: { label: 'Karantina', tone: 'warning' },
    released: { label: 'Serbest', tone: 'success' },
    // Tur 5 P1 bulgusu: 'Red' Türkçe UI kuralını ihlal ediyordu (dosyanın geri kalanı 'Reddedildi'
    // diyor) — 'Karantina'/'Serbest' komşuluğunda İngilizce bir renk adı gibi okunuyordu. Durum
    // sütunu kısaltmayı gerektirmeyecek genişlikte (130-200px).
    rejected: { label: 'Reddedildi', tone: 'danger' },
    consumed: { label: 'Tüketildi', tone: 'neutral' },
    recalled: { label: 'Geri çağrıldı', tone: 'danger' },
    expired: { label: 'SKT geçti', tone: 'danger' },
  },
  lot_origin: {
    receipt: { label: 'Mal kabul', tone: 'info' },
    production: { label: 'Üretim', tone: 'primary' },
    count: { label: 'Sayım', tone: 'neutral' },
    opening: { label: 'Açılış', tone: 'muted' },
    return: { label: 'İade', tone: 'warning' },
  },
  work_order: {
    draft: { label: 'Taslak', tone: 'muted' },
    planned: { label: 'Planlandı', tone: 'info' },
    released: { label: 'Serbest bırakıldı', tone: 'info' },
    in_progress: { label: 'Üretimde', tone: 'primary' },
    paused: { label: 'Duraklatıldı', tone: 'warning' },
    finished: { label: 'Bitti', tone: 'success' },
    closed: { label: 'Kapatıldı', tone: 'neutral' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  purchase_order: {
    ai_draft: { label: 'AI taslağı', tone: 'info' },
    draft: { label: 'Taslak', tone: 'muted' },
    pending_approval: { label: 'Onay bekliyor', tone: 'warning' },
    approved: { label: 'Onaylandı', tone: 'success' },
    sent: { label: 'Tedarikçiye gönderildi', tone: 'info' },
    confirmed: { label: 'Tedarikçi onayladı', tone: 'primary' },
    partially_received: { label: 'Kısmen alındı', tone: 'info' },
    received: { label: 'Teslim alındı', tone: 'success' },
    invoiced: { label: 'Faturalandı', tone: 'success' },
    closed: { label: 'Kapalı', tone: 'neutral' },
    cancelled: { label: 'İptal', tone: 'danger' },
    rejected: { label: 'Reddedildi', tone: 'danger' },
  },
  qc: {
    pending: { label: 'Kontrol bekliyor', tone: 'warning' },
    passed: { label: 'Geçti', tone: 'success' },
    failed: { label: 'Kaldı', tone: 'danger' },
    waived: { label: 'Muaf', tone: 'neutral' },
  },
  recall: {
    simulation: { label: 'Simülasyon', tone: 'info' },
    open: { label: 'Açık', tone: 'danger' },
    in_progress: { label: 'Yürütülüyor', tone: 'warning' },
    closed: { label: 'Kapatıldı', tone: 'neutral' },
  },
  machine: {
    running: { label: 'Çalışıyor', tone: 'success' },
    idle: { label: 'Boşta', tone: 'neutral' },
    down: { label: 'Arızalı', tone: 'danger' },
    maintenance: { label: 'Bakımda', tone: 'warning' },
    retired: { label: 'Emekli', tone: 'muted' },
  },
  maintenance: {
    reported: { label: 'Bildirildi', tone: 'warning' },
    planned: { label: 'Planlandı', tone: 'info' },
    in_progress: { label: 'Yapılıyor', tone: 'primary' },
    waiting_parts: { label: 'Parça bekliyor', tone: 'warning' },
    done: { label: 'Tamamlandı', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  maintenance_priority: {
    low: { label: 'Düşük', tone: 'muted' },
    normal: { label: 'Normal', tone: 'neutral' },
    high: { label: 'Yüksek', tone: 'warning' },
    critical: { label: 'Kritik', tone: 'danger' },
  },
  maintenance_kind: {
    preventive: { label: 'Periyodik', tone: 'info' },
    corrective: { label: 'Arıza', tone: 'danger' },
    inspection: { label: 'Kontrol', tone: 'neutral' },
  },
  export: {
    draft: { label: 'Taslak', tone: 'muted' },
    proforma_sent: { label: 'Proforma gönderildi', tone: 'info' },
    confirmed: { label: 'Onaylandı', tone: 'primary' },
    packing: { label: 'Paketleniyor', tone: 'primary' },
    customs: { label: 'Gümrükte', tone: 'warning' },
    shipped: { label: 'Yüklendi', tone: 'info' },
    delivered: { label: 'Teslim edildi', tone: 'success' },
    closed: { label: 'Kapalı', tone: 'neutral' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  export_doc: {
    required: { label: 'Gerekli', tone: 'warning' },
    in_progress: { label: 'Hazırlanıyor', tone: 'primary' },
    ready: { label: 'Hazır', tone: 'info' },
    sent: { label: 'Gönderildi', tone: 'info' },
    received: { label: 'Alındı', tone: 'success' },
    not_required: { label: 'Gerekmiyor', tone: 'muted' },
  },
  dunning: {
    draft: { label: 'Taslak', tone: 'muted' },
    pending_approval: { label: 'Onay bekliyor', tone: 'warning' },
    approved: { label: 'Onaylandı', tone: 'info' },
    sent: { label: 'Gönderildi', tone: 'success' },
    failed: { label: 'Gönderilemedi', tone: 'danger' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  /** `opportunity_stages.code` (belge zincirinde fırsat düğümünün durumu bu koddan gelir) */
  opportunity: {
    lead: { label: 'Aday', tone: 'muted' },
    qualified: { label: 'Nitelikli', tone: 'info' },
    proposal: { label: 'Teklif aşaması', tone: 'primary' },
    negotiation: { label: 'Görüşme', tone: 'warning' },
    won: { label: 'Kazanıldı', tone: 'success' },
    lost: { label: 'Kaybedildi', tone: 'danger' },
  },
  rnd_project: {
    idea: { label: 'Fikir', tone: 'muted' },
    active: { label: 'Aktif', tone: 'primary' },
    on_hold: { label: 'Beklemede', tone: 'warning' },
    completed: { label: 'Tamamlandı', tone: 'success' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  trial: {
    draft: { label: 'Taslak', tone: 'muted' },
    testing: { label: 'Testte', tone: 'primary' },
    approved: { label: 'Onaylandı', tone: 'success' },
    rejected: { label: 'Reddedildi', tone: 'danger' },
    released: { label: 'Reçeteye devredildi', tone: 'success' },
  },
  journal_entry: {
    draft: { label: 'Taslak', tone: 'muted' },
    posted: { label: 'Kaydedildi', tone: 'success' },
    reversed: { label: 'Ters kayıt', tone: 'warning' },
    cancelled: { label: 'İptal', tone: 'danger' },
  },
  bank_tx: {
    unmatched: { label: 'Eşleşmedi', tone: 'warning' },
    suggested: { label: 'Öneri var', tone: 'info' },
    matched: { label: 'Eşleşti', tone: 'success' },
    ignored: { label: 'Yok sayıldı', tone: 'muted' },
  },
  recon_match: {
    suggested: { label: 'Öneri', tone: 'info' },
    auto_applied: { label: 'Otomatik', tone: 'success' },
    approved: { label: 'Onaylandı', tone: 'success' },
    rejected: { label: 'Reddedildi', tone: 'danger' },
    superseded: { label: 'Geçersiz', tone: 'muted' },
  },
  approval: {
    pending: { label: 'Bekliyor', tone: 'warning' },
    approved: { label: 'Onaylandı', tone: 'success' },
    rejected: { label: 'Reddedildi', tone: 'danger' },
    expired: { label: 'Süresi doldu', tone: 'muted' },
  },
  notification: {
    pending: { label: 'Bekliyor', tone: 'warning' },
    sent: { label: 'Gönderildi', tone: 'success' },
    failed: { label: 'Başarısız', tone: 'danger' },
    read: { label: 'Okundu', tone: 'neutral' },
  },
  product: {
    active: { label: 'Aktif', tone: 'success' },
    draft: { label: 'Taslak', tone: 'muted' },
    cancelled: { label: 'Kullanım dışı', tone: 'danger' },
  },
  bom: {
    draft: { label: 'Taslak', tone: 'muted' },
    active: { label: 'Aktif', tone: 'success' },
    archived: { label: 'Arşiv', tone: 'muted' },
  },
  user: {
    active: { label: 'Aktif', tone: 'success' },
    inactive: { label: 'Pasif', tone: 'muted' },
  },
  job_run: {
    running: { label: 'Çalışıyor', tone: 'primary' },
    done: { label: 'Tamamlandı', tone: 'success' },
    failed: { label: 'Başarısız', tone: 'danger' },
  },
  // Tur 2 P1 muhasebe-kdv-03 / muhasebe-donemler-03: bu iki durum önceden düz renkli metindi
  // (`text-success`/muted `<span>`), modülün geri kalanındaki her tabloda durum StatusBadge'ti —
  // aynı modülde iki farklı durum anatomisi. Eklenen dictionary kaydı bu tutarsızlığın kök nedenini
  // kapatır: artık kdv/page.tsx ve fiscal-periods-table.tsx de aynı StatusBadge'i kullanabilir.
  vat_period: {
    open: { label: 'Açık', tone: 'muted' },
    declared: { label: 'Hesaplandı', tone: 'info' },
    paid: { label: 'Ödendi', tone: 'success' },
  },
  fiscal_period: {
    open: { label: 'Açık', tone: 'info' },
    closed: { label: 'Kapalı', tone: 'muted' },
  },
};

export function getStatusInfo(status: string | null | undefined, kind?: StatusKind): StatusInfo {
  if (!status) return { label: '—', tone: 'muted' };
  const specific = kind ? BY_KIND[kind]?.[status] : undefined;
  if (specific) return specific;
  const generic = GENERIC[status];
  if (generic) return generic;
  // Sözlükte karşılığı yok: ham enum değerini (İngilizce olabilir) kullanıcıya asla gösterme —
  // TR arayüz kuralı (CLAUDE.md). Geliştirici eksik eşlemeyi fark etsin diye dev'de uyar.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[status] "${status}" için${kind ? ` (kind: ${kind})` : ''} Türkçe etiket tanımlı değil — lib/status.ts'e eklenmeli.`);
  }
  return { label: '—', tone: 'muted' };
}

/** Bir enumun tüm seçenekleri (filtre menüleri için) */
export function statusOptions(kind: StatusKind): Array<{ value: string; label: string; tone: StatusTone }> {
  const dict = BY_KIND[kind] ?? {};
  return Object.entries(dict).map(([value, info]) => ({ value, ...info }));
}

/** Belge tipi etiketleri (document_type enum) */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quotation: 'Teklif',
  sales_order: 'Sipariş',
  delivery: 'İrsaliye',
  invoice: 'Fatura',
  payment: 'Tahsilat/Ödeme',
  credit_note: 'İade faturası',
  purchase_order: 'Satın alma siparişi',
  receipt: 'Mal kabul',
  transfer: 'Transfer',
  stock_count: 'Sayım',
  scrap: 'Fire',
  work_order: 'İş emri',
  quality_check: 'Kalite kontrol',
  recall: 'Geri çağırma',
  export_shipment: 'İhracat sevkiyatı',
  proforma: 'Proforma',
  packing_list: 'Çeki listesi',
  maintenance_order: 'Bakım emri',
  journal_entry: 'Yevmiye fişi',
  bank_transaction: 'Banka hareketi',
  opportunity: 'Fırsat',
};

// Muhasebe modülü artık var: `invoice`/`credit_note` (aynı /muhasebe/faturalar/[id] rotası — iade
// faturaları da `invoices` tablosunda, ayrı bir tablo değil) ve `journal_entry` gerçek detay
// rotalarına kavuştu (Tur 10 P1'de "modül henüz yok" gerekçesiyle kokpit'e düşürülmüştü). `payment`/
// `bank_transaction` hâlâ yalnızca LİSTE sayfası (finans modülünün kendi `[id]` detay rotası yok) —
// bu ikisi kapsamım dışında, dokunulmadı.
const DOCUMENT_HREF_MAP: Record<string, { base: string; hasDetail: boolean }> = {
  quotation: { base: '/satis/teklifler', hasDetail: true },
  sales_order: { base: '/satis/siparisler', hasDetail: true },
  delivery: { base: '/depo/sevkiyat', hasDetail: true },
  invoice: { base: '/muhasebe/faturalar', hasDetail: true },
  payment: { base: '/finans/tahsilat', hasDetail: false },
  credit_note: { base: '/muhasebe/faturalar', hasDetail: true },
  purchase_order: { base: '/satin-alma/siparisler', hasDetail: true },
  receipt: { base: '/depo/mal-kabul', hasDetail: true },
  transfer: { base: '/depo/transfer', hasDetail: true },
  stock_count: { base: '/depo/sayim', hasDetail: true },
  scrap: { base: '/depo/stok', hasDetail: false },
  work_order: { base: '/uretim/is-emirleri', hasDetail: true },
  quality_check: { base: '/kalite/kontroller', hasDetail: true },
  recall: { base: '/kalite/geri-cagirma', hasDetail: true },
  export_shipment: { base: '/ihracat/sevkiyatlar', hasDetail: true },
  proforma: { base: '/ihracat/belgeler', hasDetail: false },
  packing_list: { base: '/ihracat/belgeler', hasDetail: false },
  maintenance_order: { base: '/bakim/is-emirleri', hasDetail: true },
  journal_entry: { base: '/muhasebe/yevmiye', hasDetail: true },
  bank_transaction: { base: '/finans/banka', hasDetail: false },
  opportunity: { base: '/satis/firsatlar', hasDetail: true },
};

/** Belge tipi → detay sayfası yolu (yalnızca liste sayfası olan tipler için id eklenmez). */
export function documentHref(type: string, id: string): string {
  const entry = DOCUMENT_HREF_MAP[type];
  if (!entry) return '/kokpit';
  return entry.hasDetail ? `${entry.base}/${id}` : entry.base;
}
