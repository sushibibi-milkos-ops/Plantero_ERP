# Modül: Bakım (maintenance)

Route `/bakim`, izinler `maintenance.*`, core `packages/core/src/maintenance/**`, web `apps/web/src/modules/maintenance/**`, seed `seed/maintenance.ts`, worker `maintenance-scheduler`, `oee-daily`.

1. `/bakim/makineler` — makine kartları (kod, ad, kategori, hat, durum rozeti running/idle/down/maintenance, kapasite, çalışma saati, sonraki bakım tarihi); detay: özellikler, bakım planları, iş emirleri geçmişi, duruşlar, OEE trendi, MTBF/MTTR, fotoğraflar. Seed: **docs/PRODUCTION-LINES.md makine tablosu (MK-001…MK-036) birebir** — hat ataması, kategori, güç; ana verideki EKP-URT-PKT-01 ile MK-008 eşleşir (products.id bağı).
2. `/bakim/planlar` — periyodik planlar (makine, ad, aralık, kontrol listesi, sonraki tarih, sorumlu); worker her sabah `nextDueAt ≤ bugün+3` planlar için otomatik bakım iş emri (`kind: preventive`, `planned`) üretir; "Şimdi üret" butonu.
3. `/bakim/is-emirleri` — liste/kanban (reported → planned → in_progress → waiting_parts → done), **fotoğraflı arıza bildirimi** formu (mobil: makine seç (QR `MCH:<code>` okut), başlık, açıklama, öncelik, fotoğraf yükle (attachments; data URL/base64 yerel depolama), üretim iş emri bağı; makine status down + downtimes kaydı başlar), iş emri detayı: kontrol listesi işaretleme, işçilik/parça maliyeti, kök neden/çözüm, "Tamamla" (downtime kapanır, makine running/idle, plan `lastDoneAt`/`nextDueAt` güncellenir).
4. `/bakim/oee` — hat/makine × gün OEE: kullanılabilirlik (planlanan − duruş) × performans (gerçek çıktı ÷ ideal çıktı (capacityPerHour × çalışma süresi)) × kalite (iyi ÷ toplam (fire hariç)); günlük hesap `computeOee(day)` (work_orders/work_order_events/downtimes/outputs/scraps'tan), grafik (Stripe tarzı), duruş sebebi pareto.

Core: `maintenance/plans.ts` (`generateDueOrders`), `maintenance/orders.ts` (`reportBreakdown`, `start`, `complete`), `maintenance/oee.ts`.
Seed: 36 makine (PRODUCTION-LINES.md), 12 plan, 6 bakım iş emri (2 arıza fotoğraflı, 3 periyodik tamamlanmış, 1 açık), 30 gün OEE kayıtları, duruşlar (üretim seed'indeki duraklatmalarla tutarlı).
Kabul: arıza bildirimi → makine down → tamamla → OEE günlük kullanılabilirlik düşer; periyodik plan → otomatik iş emri.
