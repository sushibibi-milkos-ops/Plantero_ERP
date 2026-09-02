# Modül: Bildirimler & Onay Merkezi (notifications)

Route `/bildirimler` ve `/onaylar`, izinler mevcut modül izinleri, core `packages/core/src/notifications/**`, web `apps/web/src/modules/notifications/**`, worker `notifications`, `expiry-alerts`.

1. `/onaylar` — **tek onay kuyruğu**: tüm `approvals` (satın alma taslağı, mutabakat, sayım farkı, tahsilat hatırlatma, reçete devri, fiyat değişikliği) sekmeli; kart: tür rozeti, başlık, özet, güven, tarih; Onayla/Reddet her tür için ilgili core `approve*` fonksiyonunu çağırır (`approvals/dispatch.ts` tür → işleyici haritası). Klavye J/K/A/R animasyonsuz.
2. `/bildirimler` — kullanıcı bildirimleri (in_app), okundu; üst bar zil ikonu sayaç (Realtime gerekmez; 30 sn polling).
3. Sistem bildirimleri (worker): SKT 30/60/90 uyarıları (depo + kalite rolleri), kritik stok, geciken alacak, arıza bildirimi (bakım), mutabakat sabah özeti (muhasebe), pazaryeri sync hatası. Kanal: in_app + e-posta (sandbox) + WhatsApp (sandbox) kullanıcı tercihine göre (`settings` / kullanıcı meta).
4. `packages/core/src/notifications/send.ts`: `notify({ userIds | roleCodes, title, body, href, channel[] })`.
