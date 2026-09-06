/**
 * Deneme reçetesi versiyon durum sabitleri — bilinçli olarak DB'siz/saf bir dosyada tutulur.
 * `trials.ts` (server, `@plantero/db` içe aktarır) ve client bileşenleri (ör.
 * `apps/web/src/modules/rnd/components/cost-simulator.tsx`) AYNI sabiti kullanmalı; client
 * bileşeni doğrudan `trials.ts`'i içe aktarırsa `@plantero/db` (postgres sürücüsü, Node-only
 * `net`/`tls`) tarayıcı paketine sızar ve derleme patlar — bu dosya o köprüyü keser.
 *
 * I54 (packages/db/src/checks/54_recipe_approval_drift.sql) — 'testing' BİLEREK burada değil:
 * `submitForApproval` versiyonu 'testing'e taşırken o anki birim maliyeti
 * `approvals.payload.unitCost`'a DONDURUR ve onaylayan kişiye TAM OLARAK bu rakamı gösterir.
 * 'testing' bu kümede kalsaydı `updateVersionDraft` bekleyen onaydan habersiz satır/miktar
 * değiştirip maliyeti sessizce kaydırabilir, onaylanan rakamla üretime giden rakam arasında
 * denetimsiz bir uçurum açardı (canlı egzersizle kanıtlandı: bkz. INVARIANTS.md I54). Onaya
 * gönderilmiş bir versiyonu düzenlemek isteyen önce onayı reddettirir/`createNewVersion` ile
 * yeni versiyon açar — sessiz drift yasak.
 */
export const EDITABLE_STATUSES = new Set(['draft']);
