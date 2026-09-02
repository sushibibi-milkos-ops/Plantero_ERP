# Modül: Kalite & İzlenebilirlik (quality)

Route `/kalite`, izinler `quality.*`, core `packages/core/src/quality/**` (+ lots/trace.ts hazır), web `apps/web/src/modules/quality/**`, seed `seed/quality.ts`.

## Ekranlar
1. `/kalite/kontroller` — girdi kalite kontrol listesi (bekleyen/geçti/kaldı; lot, ürün, tedarikçi, mal kabul, tarih), detay: şablon kalemleri (sayısal min/max, evet/hayır, belge), sonuç girişi (mobil uyumlu), karar: **Serbest bırak** (lot released, karantina → hammadde lokasyonu `quarantine_release` move) / **Reddet** (lot rejected, → TIRE/RED `quarantine_reject`; tedarikçiye iade opsiyonu `return_out`) / Kısmi. Şablon yönetimi `/kalite/sablonlar`.
2. `/kalite/tedarikci-skoru` — aylık skor tablosu + trend; hesap: kalite %50 (QC geçme), zamanında %30, miktar doğruluğu %20; `computeSupplierScores(period)` → supplier_scores + partners.supplierQualityScore.
3. `/kalite/izlenebilirlik` — **iki yönlü sorgu**: lot no / ürün / müşteri / tedarikçi ara → grafik (trace-graph: hammadde lotu ← mal kabul ← tedarikçi; → iş emri → mamul lot → sevkiyat → müşteri), zaman çizelgesi, miktar dengesi (giriş = tüketim + sevk + fire + eldeki), her düğüm tıklanabilir.
4. `/kalite/geri-cagirma` — **geri çağırma simülasyonu**: lot seç + yön → `simulateRecall` → etki özeti (etkilenen lot/iş emri/müşteri/sevk miktarı/stoktaki miktar), etkilenen müşteri listesi (iletişim bilgileri, bildirim taslağı), "Geri çağırmayı başlat" (`recalls` open; etkilenen stok lotları `recalled` + bloklanır; müşteri bildirimleri notifications) → aksiyon takibi (blokla/bildir/iade/imha) → kapat.

## Core
`quality/checks.ts` (`createIncomingCheck` (mal kabul tetikler), `recordResults`, `decide`), `quality/supplierScore.ts`, `quality/recall.ts` (`simulate`, `initiate`, `closeRecall`).

## Seed
QC şablonları (hammadde genel: nem, koku, ambalaj, sertifika; kuruyemiş: aflatoksin belgesi), 8 kontrol (5 geçti, 2 bekliyor, 1 kaldı → red lot), 3 ay tedarikçi skoru, 1 geri çağırma simülasyonu kayıtlı.

## Kabul
Karantina lotu QC geçmeden üretime/sevke giremez (ledger + UI), red lot izole; izlenebilirlik her iki yönde seed'deki tüm mamul lotları için kopuksuz (I5/I6); simülasyon etki sayıları SQL ile eşit.
