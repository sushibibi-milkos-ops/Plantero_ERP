# Telefon (mobil) denetimi

Kapsam: tüm `(app)` rotaları + operatör ekranları, admin hesabıyla, dikey 390x844 (ayrıca 375x667 ve 430x932).
Araçlar: `scripts/mobile-audit.ts` (rota denetimi), `scripts/mobile-audit-overlays.ts` (dialog/sheet/menü),
`pnpm measure` (tek rota). Ham çıktılar `artifacts/mobile-audit/<tarih>-*.json` (git dışı).
Test: `apps/web/e2e/mobile-responsive.spec.ts`.

```
pnpm tsx scripts/mobile-audit.ts [--viewport 390x844] [--label etiket] [--only /satis,/depo]
pnpm tsx scripts/mobile-audit-overlays.ts [--viewport 390x844]
```

Dinamik rota kimlikleri Postgres'ten seçilir; operatör iş emri ekranı için açık (in_progress/paused/released) iş emri kullanılır.
Denetlenen rota sayısı: **111** (107 `(app)` + `/operator`, `/operator/[hat]`, `/operator/[hat]/[iş emri]`; id'li rotalar tek örnekle).

## Ölçütler ve sonuç (390x844)

| Ölçüt | Önce | Sonra |
| --- | --- | --- |
| (a) Belge/kırpılan yatay taşma (kaydırıcı dışı) | 0 belge taşması; kabuğun `overflow-x-clip`'i gizlediği 8 rotada kırpılan içerik (7'si kasıtlı `truncate`/ilerleme çubuğu, 1'i gerçek) | 0 |
| (b) 44x44 altı etkileşimli hedef | 178 öğe / 107 rota | 0 |
| (c) 12px altı metin | 2336 düğüm / 108 rota | 0 |
| (d) Alt sekme çubuğunun içeriği örtmesi | 1 (yanlış pozitif: kapalı `<details>`) | 0 (375x667'de yalnız `/ayarlar/roller`: iç kaydırıcı, yanlış pozitif) |
| (e) 16px altı form alanı (iOS yakınlaştırması) | 324 alan / 28 rota | 0 |
| (f) Kart görünümüne düşmeyen DataTable | 0 (DataTable mobilde hep kart); elle yazılmış 10 tablo rotası | 9 rota: hepsi `overflow-x-auto` + kaydırma ipucu içinde; 1'i (sayım farkı) kart listesine çevrildi |
| (g) Dialog/sheet/popover/menü ekrana sığma | dialog kapat düğmesi 32px; dialog max-yükseklik yok | tümü 390px içinde, kapat 44x44 |
| (h) Dar sütunlu ızgara | 7 | 9 (KPI/özet karoları, 3 sütun ~100px — kasıtlı; Ar-Ge reçete satırı 4 sütun→2x2 yapıldı) |
| (i) KPI şeridi | yatay kaydırılabilir (scroll-snap + soldurma) | değişmedi |
| (j) bom-flow / trace-graph | bom-flow dikey; trace-graph derin düğümde sağdan kırpılıyordu | ikisi de dikey; trace-graph girinti daraltıldı, uzun etiket satır sarar |

375x667 ve 430x932 sonuçları aynı (taşma 0, hedef 0, metin 0, alan 0).

## Bulgu → kök neden → düzeltme

| # | Bulgu (önce) | Düzeltme |
| --- | --- | --- |
| 1 | Alt sekme çubuğu: ana gövde alt dolgusu sabit 128px, güvenli alan yok; yapışkan eylem şeritleri `bottom-16` sabit | `--tabbar-h` / `--topbar-h` değişkenleri (globals.css); `main` alt dolgusu `calc(var(--tabbar-h)+4.5rem)`; `FormActions` ve bakım iş emri şeridi `bottom-[calc(var(--tabbar-h)+0.5rem)]`; odak modunda güvenli alan dolguları; topbar çentik dolgusu (`viewport-fit=cover` zaten açık) |
| 2 | 2336 metin düğümü 12px altı (sekme etiketi 10px, 339 yerde `text-[10px/11px]`) | Telefonda `.text-[9px/10px/11px]` → 12px (katmansız CSS, `md:` etkilenmez); sekme etiketi 12px; Recharts eksen/açıklama 12px |
| 3 | 324 giriş alanı 13–15px (iOS Safari odakta yakınlaştırır) | Telefonda input/textarea/select/`select-trigger`/combobox 16px tabanı |
| 4 | Breadcrumb geçerli sayfa `role=link` (19px, 107 rota) | `BreadcrumbPage`: yalnız `aria-current="page"` |
| 5 | Onay kutusu 18–20px (rol matrisi 47 adet, şablon formları) | `Checkbox`: mobilde 44x44 dokunma alanı, görünen kutu 22px (`after`), masaüstü aynı |
| 6 | `Button` sm/xs/icon-xs/icon-sm 28–36px | Mobilde 44px, `md:` ile masaüstü yoğunluğu korunur |
| 7 | Select tetikleyici 36–40px | Mobilde 44px |
| 8 | Dialog/Sheet kapat düğmesi 32px; dialog uzun içerikte ekrana sığmıyordu | 44px dokunma alanı + 32px görünür daire; `max-h-[calc(100dvh-2rem)]` + iç kaydırma + `overscroll-behavior: contain`; alt sheet `max-h-[92dvh]` + güvenli alan; popover `max-w-[calc(100vw-1.5rem)]` |
| 9 | Fatura/yevmiye detayında 18–21px satır içi bağlantılar | `inline-flex min-h-11` (mobil) |
| 10 | `PageHeader` uzun başlık sert kırpılıyordu | Mobilde 2 satıra kadar sarar, masaüstünde `truncate` |
| 11 | Mobil kart sağ metrik sütunu uzun metinde kart dışına taşıp kırpılıyordu (`/finans/banka`) | `max-w-[62%] truncate` |
| 12 | trace-graph derin ağaçta girinti içeriği daraltıyor, uzun cari adı kırpılıyordu | Mobil girinti 10px+8px, etiket `max-w-full break-words` |
| 13 | Sayım farkı tablosu yatay kaydırma (sütunlar kesik) | Mobilde inset kart listesi (tablo yalnız `md+`) |
| 14 | Ar-Ge reçete satırı kontrol şeridi 4 sütun (~50px), 16px alanla sığmıyordu | 2x2 ızgara |
| 15 | iOS: `-webkit-text-size-adjust`, yatay `overscroll-behavior` | `html`'de tanımlandı |
| 16 | `pnpm measure` Radix'in gizli (aria-hidden) native `<select>` öğesini dokunma hedefi sayıyordu | `scripts/measure.ts`: `aria-hidden` alt ağacı atlanır |

## Operatör ekranları (/operator/*)

Tablet ve telefonda ek bir düzeltme gerekmedi: düğmeler 48–56px, hat/iş emri karoları dokunmaya uygun,
başlık sarar. Yalnız ortak düzeltmeler (11px→12px metin tabanı, 16px giriş) uygulandı. `/operator/[hat]/[iş emri]`
yalnızca açık iş emrinde render olur (kapalı iş emri hat kuyruğuna yönlendirir).

## Kalan bilinen sorunlar

- Elle yazılmış geniş matrisler (nakit akışı 37 sütun, krediler konsolide takvim 9 sütun, rol izin matrisi,
  Ar-Ge/kod yapısı başvuru tabloları) mobilde kart değil, kaydırma ipuçlu yatay kaydırıcıdır; veri doğası gereği.
- 375x667'de `/ayarlar/roller` izin matrisi kendi içinde dikey kaydırır (iç kaydırıcı).
- 3 sütunlu özet karoları (bütçe, hatlar, iş emri özeti) 95–105px sütun; metin sığıyor ama sıkı.
- `/uretim/hatlar` ve `modules/production` başka ajanın çalışma alanıdır; yalnız ortak bileşen düzeltmeleri etkiler.
- Gerçek iOS Safari/cihaz doğrulaması yapılmadı (Chromium mobil emülasyonu); güvenli alan dolguları `env()` ile yazıldı.
