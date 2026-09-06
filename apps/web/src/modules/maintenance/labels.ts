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
