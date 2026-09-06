/** Makine kategorisi (docs/PRODUCTION-LINES.md) → TR etiket. Modülün 3 farklı ekranında (liste,
 *  detay, sayfa başlığı) tekrarlanmasın diye tek yerden. */
export const MACHINE_CATEGORY_LABELS: Record<string, string> = {
  mixer: 'Mikser', homogenizer: 'Homojenizatör', tank: 'Tank', filler: 'Dolum', sealer: 'Kapatma',
  coder: 'Kodlama', kettle: 'Kazan', hopper: 'Tekne', conveyor: 'Taşıyıcı', packaging: 'Paketleme',
  grinder: 'Öğütücü', roaster: 'Kavurma', inspection: 'Kontrol', lab: 'Laboratuvar', utility: 'Yardımcı tesis',
  handling: 'Taşıma', scale: 'Tartı', labeler: 'Etiketleme',
};

/** Duruş sebebi (`downtimeReasonEnum`) → TR etiket. */
export const DOWNTIME_REASON_LABELS: Record<string, string> = {
  breakdown: 'Arıza', changeover: 'Model değişimi', cleaning: 'Temizlik', material_shortage: 'Malzeme yok',
  no_operator: 'Operatör yok', planned_maintenance: 'Planlı bakım', quality_hold: 'Kalite bekletme',
  power: 'Elektrik kesintisi', break: 'Mola', other: 'Diğer',
};

/** Plan aralık birimi (`maintenancePlans.intervalUnit`) → TR etiket. */
export const INTERVAL_UNIT_LABELS: Record<string, string> = {
  day: 'gün', week: 'hafta', month: 'ay', runtime_hours: 'çalışma saati',
};

/**
 * Kriter 4 (Tur 2 P1 bakim-isemirleri-detay-02) kök neden düzeltmesi: `lib/status.ts`'teki
 * `maintenance_priority` sözlüğü 'high'ı da (durum sözlüğündeki 'reported' ile AYNI) `warning`/amber
 * tonuna veriyordu — iş emri başlığının altında durum rozeti ('Bildirildi') ile öncelik rozeti
 * ('Yüksek') yan yana aynı renkte basılınca hangisinin hangi anlamı taşıdığı renkten ayırt
 * edilemiyordu. `lib/status.ts` paylaşılan bir sözlük dosyası (birçok modülün kendi kind'ları var);
 * onu değiştirmek yerine `StatusBadge`'in zaten desteklediği `tone` override'ı burada, yalnızca bu
 * modülün önceliğe özgü render noktalarında (öncelik rozetinin göründüğü her yer) kullanılır —
 * amber ARTIK yalnızca durum rozetinin anlamı; öncelikte yalnızca 'Kritik' kırmızı kalır, diğerleri
 * nötr/muted tonda basılır.
 */
export const PRIORITY_TONE: Record<string, 'muted' | 'neutral' | 'danger'> = {
  low: 'muted', normal: 'neutral', high: 'neutral', critical: 'danger',
};
