# Görsel Kalite Puan Kartı Protokolü (gorsel-critic ↔ modul-builder)

Amaç: kör karşılaştırmanın **yakınsaması**. Referans puanları sabittir; her route için kalıcı bir puan kartı tutulur; her tur aynı 12 kriter yeniden ölçülür ve delta raporlanır. "Kazanma" tanımı değişmez, ama hedef görünür ve ölçülebilirdir.

## 12 kriter (1–5) ve sabit referans puanları
| # | Kriter | Ölçüm | Linear (veri) | Stripe (finans) |
|---|---|---|---|---|
| 1 | Tipografik hiyerarşi | h1 20–24px/medium, gövde 13px, etiket 11–12px uppercase-tracking veya muted; en fazla 3 boyut kademesi | 5 | 5 |
| 2 | Boşluk / 8pt ritmi | dikey ritim 4/8/12/16/24; sayfa kenar 24–32px; kart içi 16px | 5 | 5 |
| 3 | Yoğunluk | tablo satırı 36–40px, 13px; ilk ekranda ≥15 satır; mobilde kart 56–72px | 5 | 4 |
| 4 | Renk disiplini | nötr zemin, 1 vurgu, durum renkleri yalnızca anlam; ekranda ≤4 renk tonu; yeşil yalnızca başarı/vurgu ikisinden biri | 5 | 5 |
| 5 | Tablo/kart anatomisi | header muted+küçük, hairline satır ayracı, taşma yok (scrollWidth ≤ container), sağ hizalı sayılar, satır hover | 5 | 5 |
| 6 | Rakam sunumu | tabular-nums, birim/para tutarlı ondalık, 2 basamak para, sıfır değerler soluk | 4 | 5 |
| 7 | Boş/yükleniyor/hata | özenli empty state (ikon+metin+eylem), skeleton, hata mesajı | 4 | 5 |
| 8 | Etkileşim geri bildirimi | hover/active/focus görünür; buton active scale(0.97); focus ring 2px | 5 | 4 |
| 9 | Mobil düzen | 390px'te yatay taşma yok, dokunma hedefi ≥44px, tek kolon form, kart görünümü | 4 | 4 |
| 10 | İkon kullanımı | 16px, tutarlı set, süs ikonu yok, metinle hizalı | 5 | 4 |
| 11 | Tutarlılık | aynı bileşen aynı görünür (KPI, rozet, tablo, form), aynı boşluklar | 5 | 5 |
| 12 | Anti-ERP kokusu (ters) | gri kutu içinde kutu yok, çerçeve çorbası yok, ikon çorbası yok, default HTML görünümü yok | 5 | 5 |
| | **Toplam** | | **57** | **56** |

Kazanma kuralı (değişmez): Plantero toplamı ≥ referans toplamı **ve** hiçbir kriter < 4 (mobil kriter 9 dahil). Referans bu tabloda sabittir; kritik referansı yeniden puanlamaz.

## Kalıcı puan kartı dosyası
`artifacts/critic/<modul>.json`:
```json
{ "routes": { "/depo/stok": { "round": 5, "scores": [5,4,5,4,3,5,4,4,3,5,4,5], "total": 51, "reference": "linear", "open": [ { "id": "depo-stok-07", "criterion": 5, "severity": "P0", "text": "…", "measure": "scrollWidth 1696 > 1152", "target": "scrollWidth ≤ container", "file": "…", "openedRound": 4 } ], "closed": [ { "id": "…", "closedRound": 5, "verifiedBy": "ölçüm" } ] } } }
```
Kurallar:
1. Kritik her turda dosyayı okur; her açık bulguyu **önce yeniden ölçer** ve kapatır ya da açık bırakır (gerekçeyle). Yeni bulgu ancak ölçülebilir ve bir kritere bağlıysa açılır; her bulgunun `measure` (şu anki ölçüm) ve `target` (kabul eşiği) alanı zorunludur.
2. Kritik puanları önceki tura göre değiştirirken deltayı gerekçelendirir (“kriter 5: 3→4, taşma giderildi”). Gerekçesiz düşüş yasak.
3. Bir route'ta P0/P1 açık bulgu kalmadıysa ve toplam ≥ referans ise kritik `KAZANAN: Plantero` yazar; P2'ler kazanmayı engellemez ama listelenir.
4. Builder yalnızca `open` listesindeki bulguları kapatır (kök neden), kapattığını `measure` ile kanıtlar; yeni tasarım keşfi yapmaz.
5. Ortak bileşen kaynaklı bulgular (`DataTable`, `KpiCard`, `StatusBadge`, `PageHeader`, app-shell) `shell` modülüne yazılır ve bir kez düzeltilir; kritik aynı bulguyu her modülde tekrar açmaz.
6. Ölçüm araçları: `pnpm shot`, Playwright ölçüm betiği `scripts/measure.ts` (satır yüksekliği, scrollWidth/clientWidth, dokunma hedefleri, font boyutları, renk sayısı) — çıktısı JSON, kritik ve builder aynı betiği kullanır.
