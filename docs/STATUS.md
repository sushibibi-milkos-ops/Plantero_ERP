# Proje Durumu — Aşama 1-4 kapanış (07.09.2026)

Dört aşamanın tamamı üç kritik döngüsünden (görsel, QA, veri) yeşil geçti; kapanış kapısı `scripts/gate.sh "." <logdir>` ile üretim derlemesi üzerinde koşuldu.

## Kapanış kapısı sonucu (07.09.2026 13:45 UTC)
| Adım | Sonuç |
|---|---|
| `db:reset` + `db:check` | 67 bütünlük kuralı, 0 ihlal |
| `typecheck` / `lint` | temiz |
| `test` (vitest) | 511 birim testi (web 33, integrations 28, db 77, ai 30, core 343) |
| `next build` (izole `.next-gate`) | başarılı |
| Playwright e2e (üretim sunucusu) | 94/94 |

## Modül kapsamı
| Aşama | Modüller | Görsel kart (son tur) | e2e |
|---|---|---|---|
| 1 | Ana veri, Depo/Stok, Satış, Üretim, Shell | ana-veri 10/10 · depo 12/12 · satis 10/10 · uretim 7/7 · shell 47 route | phase1-chain 19 · smoke 6 · auth-rbac 6 |
| 2 | Muhasebe, Finans (banka/mutabakat/tahsilat) | muhasebe 15/15 · finans 7/7 | phase2-accounting 16 |
| 3 | Tedarik, Kalite/Lot izleme, Bildirimler | tedarik 6/6 · kalite 8/8 · bildirimler 2/2 | phase3-supply-quality 17 |
| 4 | İhracat, Bakım/OEE, Ar-Ge, Kokpit (7 rol), Ayarlar | ihracat 6/6 · bakim 7/7 · arge 4/4 · kokpit 5/5 | phase4-export-maint-rnd 26 · settings 2 |

- 107 ekran (`apps/web/src/app/(app)`), 113 tablo (`packages/db/src/schema`), 13 worker işi (`apps/worker/src/jobs`).
- Görsel kartlar `artifacts/critic/<modül>.json`: tüm modüllerde açık P0/P1 yok; puanlama `docs/DESIGN-SCORECARD.md`.
- Veri kuralları I1–I67 `packages/db/src/checks/*.sql`, açıklamaları `docs/INVARIANTS.md`.

## Döngü geçmişi
- Aşama 3: 12 tur (tedarik puanları 6. turdan itibaren §7 yakınsama kuralıyla açıldı, 12. turda referansı geçti).
- Aşama 4: 16 tur; 16. turda görsel + veri yeşil, QA kanıtı orkestratörün kapanış kapısından (94/94) alındı.

## Açık kararlar
Kullanıcı teyidi bekleyen varsayımlar `docs/ASSUMPTIONS.md` (A1–A15), şema/servis talepleri ve bilinen sınırlamalar `docs/FOLLOW-UPS.md`.
