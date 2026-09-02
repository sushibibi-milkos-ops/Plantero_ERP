# Test hesapları (seed)

| E-posta | Şifre | Roller |
|---|---|---|
| admin@plantero.local | Plantero!2026 | admin (tüm izinler) |
| gm@plantero.local | Plantero!2026 | genel_mudur |
| muhasebe@plantero.local | Plantero!2026 | muhasebe, finans |
| depo@plantero.local | Plantero!2026 | depo |
| operator@plantero.local | Plantero!2026 | uretim_operatoru (PIN: 1234) |
| uretim@plantero.local | Plantero!2026 | uretim_sefi |
| satis@plantero.local | Plantero!2026 | satis |
| satinalma@plantero.local | Plantero!2026 | satin_alma |
| kalite@plantero.local | Plantero!2026 | kalite |
| bakim@plantero.local | Plantero!2026 | bakim |
| arge@plantero.local | Plantero!2026 | arge |
| ihracat@plantero.local | Plantero!2026 | ihracat |

Giriş: `/login` → cookie `plantero_session`. Playwright için `apps/web/e2e/fixtures/auth.ts` içindeki `loginAs(page, 'admin')` yardımcısı.
