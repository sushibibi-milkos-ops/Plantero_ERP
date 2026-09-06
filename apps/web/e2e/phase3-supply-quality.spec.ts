import { test, expect, type Page, type Browser } from '@playwright/test';
import { execSync } from 'node:child_process';
import { loginAs, type TestRole } from './fixtures/auth';

/**
 * Akış (Tur 1, Aşama-3 tedarik/kalite — satinalma@/kalite@/depo@/admin@):
 *   /satin-alma/kritik-stok ("Motoru çalıştır") → /satin-alma/onay-kuyrugu (Onayla → Tedarikçiye
 *   gönder) → /depo/mal-kabul/yeni?po= (QC gerektiren hammadde, karantina → Kabul et) →
 *   /kalite/kontroller (sonuç gir → Reddet / Serbest bırak) → /kalite/tedarikci-skoru (skor düştü) →
 *   /kalite/izlenebilirlik (iki yönlü, miktar dengesi) → /kalite/geri-cagirma (simülasyon → başlat →
 *   sevke engel) → /bildirimler (SKT uyarısı + zil).
 *
 * Bu test grubu ÜRETİM DERLEMESİNE (`pnpm start`, `scripts/gate.sh`) karşı çalıştırılmak üzere
 * yazılmıştır — dev sunucusunun "ilk istekte derleme" gecikmesi burada yok, bu yüzden phase1/phase2'deki
 * `warmRoutes` ön-ısıtma adımı burada YOK.
 *
 * Test verisi seed'in GARANTİ ettiği ana veriye dayanır (SKU'lar, tedarikçi kodları) — sabit ID yok;
 * benzersizlik zaman damgalı `RUN` etiketiyle sağlanır.
 *
 * Kritik önkoşul (bkz. rapor K1): seed'de HİÇBİR ürünün `requiresIncomingQc` bayrağı true değil
 * (`packages/db/src/seed/quality.ts` başlık yorumu bunu açıkça belirtiyor) — bu yüzden normal PO→mal
 * kabul akışı kendiliğinden bir "QC gerektiren hammadde" satırı üretmez. Bu test, akışın gerektirdiği
 * ön koşulu var olan bir ürün master data ekranı üzerinden (yeni bir bileşen/kod eklemeden, yalnızca
 * `/ana-veri/urunler` "Düzenle" formu ile) kurar: Kaju (301050000) ve Bromelain (306050000) için
 * "Girişte kalite kontrol zorunlu" açılır.
 *
 * İkinci kritik önkoşul: kritik stok motorunun ilk çalıştırmada HANGİ kalemleri kritik bulacağı seed'in
 * o anki gerçek tüketim geçmişine bağlıdır (`evaluateRules` risk hesaplaması `daysOfCover` varsa yalnızca
 * ona, yoksa `available <= minQty` düşüşüne bakar — bkz. `packages/core/src/purchasing/replenishment.ts`).
 * Testin "beyaz listeli tedarikçi otomatik gönderildi" / "diğeri onay kuyruğunda bekliyor" adımlarını
 * seed'in o anki tüketim durumuna bağımlı kılmamak için, motoru çalıştırmadan ÖNCE iki kritik stok
 * kuralı (Kaju — beyaz liste DIŞI; Etiket 401030000 — zaten beyaz listeli) "Kuralı düzenle" drawer'ı
 * üzerinden (gerçek bir kullanıcı eylemi, kod değişikliği değil) kritik olacak şekilde güncellenir:
 * min/maks stok çok yükseğe çekilir (`available <= minQty` dalı her koşulda tetiklenir) VE lead time
 * çok yükseğe çekilir (tüketim geçmişi olsa bile `daysOfCover < leadTimeDays` dalı da tetiklenir) —
 * Etiket için ayrıca otomatik onay tutar sınırı yükseltilir ki (bkz. rapor K2 — bu drawer'ın kendi
 * hatası) devasa önerilen miktar otomatik onayı bozmasın.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const RUN = Date.now().toString(36);

function psql(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  return execSync(`psql "${DATABASE_URL}" -t -A -F'|' -c "${escaped}"`, { encoding: 'utf-8', env: { ...process.env, PGTZ: 'Europe/Istanbul' } }).trim();
}
function psqlRows(query: string): string[][] {
  const out = psql(query);
  if (!out) return [];
  return out.split('\n').map((l) => l.split('|'));
}
function psqlOne(query: string): string | null {
  return psqlRows(query)[0]?.[0] ?? null;
}

/** `src/components/form/combobox.tsx` (`role="combobox"`, erişilebilir adı yok — bkz. phase1-chain.spec.ts). */
async function comboboxSelect(page: Page, triggerText: string, search: string, optionMatch: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder('Ara…').fill(search);
  await page.getByRole('option', { name: optionMatch }).first().click();
  await expect(page.getByPlaceholder('Ara…')).toHaveCount(0);
}

/** `DataTable` her satırı masaüstü+mobil olmak üzere DOM'da iki kez tutar — bkz. phase1-chain.spec.ts. */
function visibleText(page: Page, text: string | RegExp, exact = true) {
  return typeof text === 'string' ? page.getByText(text, { exact }).filter({ visible: true }) : page.getByText(text).filter({ visible: true });
}

/** gg.aa.yyyy biçiminde bugün + gün ofseti. */
function trDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** `DateInput` `<FieldLabel>`'ı bir `<FormField>` bağlamı dışında kullanır, `htmlFor` bağlanmaz. */
async function fillDateField(page: Page, labelExact: string, value: string) {
  const input = page.getByText(labelExact, { exact: true }).locator('xpath=following-sibling::*[1]//input');
  await input.fill(value);
  await input.press('Tab');
}

/**
 * Rol değişimi: `middleware.ts` oturumlu bir tarayıcıda `/login`'e gidilirse doğrudan `/kokpit`'e geri
 * yönlendirir (bkz. `apps/web/src/middleware.ts` satır ~22) — bu yüzden AYNI `page` üzerinde farklı bir
 * rolle (ya da aynı rolle tekrar) `loginAs` çağırmak, form hiç görünmediğinden `getByLabel('E-posta')`
 * sonsuza kadar bekler ve test timeout'a düşer (canlı olarak yakalandı — bkz. rapor K6). `phase2-
 * accounting.spec.ts`'nin KENDİSİ de rol/oturum değişiminde her zaman TAZE bir `browser.newPage()`
 * kullanır (satır ~197) — aynı kalıp burada da uygulanır: eski sayfa kapatılır, çerezsiz yeni bir
 * sayfada giriş yapılır.
 */
async function switchRole(browser: Browser, oldPage: Page, role: TestRole, next?: string): Promise<Page> {
  await oldPage.close().catch(() => {});
  const p = await browser.newPage();
  await loginAs(p, role, next);
  return p;
}

/**
 * `/satin-alma/kritik-stok` satır menüsünden ("Satır eylemleri", DataTable satır aksiyonu) "Kuralı
 * düzenle" açar ve drawer'daki (Radix `role="dialog"`) alanları doldurup kaydeder. Bu alanlar gerçek
 * `<FormField>` bağlamında (`ui/form.tsx` `useFormField` → `formItemId`) render edildiğinden — phase1'in
 * NOT ettiği "K-A11Y" boşluğu burada YOK — `getByLabel` doğrudan çalışır.
 */
async function editReorderRule(page: Page, sku: string, values: { minQty?: string; maxQty?: string; leadTimeDays?: string; autoOrderMaxAmount?: string }) {
  const search = page.getByPlaceholder('Ürün, SKU ara…');
  await search.fill('');
  await search.fill(sku);
  await expect(visibleText(page, sku)).toBeVisible();
  await page.getByRole('button', { name: 'Satır eylemleri' }).filter({ visible: true }).first().click();
  await page.getByRole('menuitem', { name: 'Kuralı düzenle' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (values.minQty) await dialog.getByLabel('Min. stok').fill(values.minQty);
  if (values.maxQty) await dialog.getByLabel('Maks. stok').fill(values.maxQty);
  if (values.leadTimeDays) await dialog.getByLabel('Tedarik süresi').fill(values.leadTimeDays);
  if (values.autoOrderMaxAmount) await dialog.getByLabel('Otomatik onay tutar sınırı').fill(values.autoOrderMaxAmount);
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toBeHidden();
  await search.fill('');
}

test.describe.configure({ mode: 'serial' });

test.describe('Akış: Tedarik → Kalite zinciri (phase3)', () => {
  test.setTimeout(120_000);

  const ctx: {
    kajuId?: string; bromelainId?: string;
    kajuPoId?: string; kajuPoDocNo?: string; etiketPoId?: string; etiketPoDocNo?: string;
    kajuLotNo1?: string; qcCheckId1?: string; qcLotId1?: string;
    bromelainLotNo2?: string; qcCheckId2?: string; qcLotId2?: string;
    supplierS5Id?: string; scoreBefore?: { qcChecks: number; qcPassed: number; score: number } | null;
    mamulLotId?: string; mamulLotNo?: string; mamulProductId?: string;
    rawLotId?: string; rawLotNo?: string; woId?: string; woDocNo?: string;
    deliveryId?: string; deliveryDocNo?: string; customerId?: string; customerName?: string;
    recallId?: string; recallDocNo?: string;
  } = {};

  let page: Page;
  let browser: Browser;
  const currentPeriod = new Date().toISOString().slice(0, 7);

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Adım 0 — /ana-veri/urunler: Kaju + Bromelain için "Girişte kalite kontrol zorunlu" açılır (seed hiçbir üründe bunu açmıyor)', async () => {
    ctx.kajuId = psqlOne("select id from products where sku = '301050000'")!;
    ctx.bromelainId = psqlOne("select id from products where sku = '306050000'")!;
    expect(ctx.kajuId, 'Seed: Kaju (301050000) bulunmalı').toBeTruthy();
    expect(ctx.bromelainId, 'Seed: Bromelain (306050000) bulunmalı').toBeTruthy();

    await loginAs(page, 'admin');
    for (const id of [ctx.kajuId, ctx.bromelainId]) {
      await page.goto(`/ana-veri/urunler/${id}`);
      await page.getByRole('button', { name: 'Düzenle' }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await sheet.getByLabel('Girişte kalite kontrol zorunlu').click();
      await sheet.getByRole('button', { name: 'Kaydet' }).click();
      await expect(sheet).toBeHidden();
      await page.reload();
      await expect(page.getByText(/^Zorunlu/).first()).toBeVisible();
    }

    const flags = psqlRows(`select id, requires_incoming_qc from products where id in ('${ctx.kajuId}','${ctx.bromelainId}')`);
    for (const [, flag] of flags) expect(flag).toBe('t');
  });

  test('Adım 1 — /satin-alma/kritik-stok: kritik stok kurallarını (Kaju=beyaz liste dışı, Etiket=beyaz liste) kritik olacak şekilde ayarla → "Motoru çalıştır"', async () => {
    page = await switchRole(browser, page, 'satin_alma');
    await page.goto('/satin-alma/kritik-stok');
    await expect(page.getByRole('heading', { name: 'Kritik Stok' })).toBeVisible();

    // NOT (Tur 2 güncellemesi — bkz. `replenishment-panel.tsx` "Tur 1 P0 tedarik-kritik-stok-01"):
    // varsayılan artık motor hiç çalışmamışken (`neverEvaluated`) OTOMATİK KAPALI — önceki turda
    // burada koşulsuz bir tıklama vardı (o zamanki varsayılan hep açıktı); düzeltmeden sonra o
    // koşulsuz tıklama filtreyi AÇIYOR ve "0 kayıt" durumuna düşürüyordu (canlı yakalandı). Bu yüzden
    // yalnızca gerçekten işaretliyse kapatılır — mevcut durumu okuyup davranışa uyarlanır.
    const onlyCriticalCheckbox = page.getByLabel('Sadece kritik/uyarı');
    if ((await onlyCriticalCheckbox.getAttribute('aria-checked')) === 'true' || (await onlyCriticalCheckbox.isChecked().catch(() => false))) {
      await onlyCriticalCheckbox.click();
    }
    await expect(onlyCriticalCheckbox).toHaveAttribute('aria-checked', 'false');

    const etiketId = psqlOne("select id from products where sku = '401030000'")!;
    expect(etiketId, 'Seed: Etiket (401030000, beyaz listeli kritik stok kuralı) bulunmalı').toBeTruthy();
    const t0 = new Date();

    await editReorderRule(page, '301050000', { minQty: '999999', maxQty: '1000000', leadTimeDays: '3650' });
    await editReorderRule(page, '401030000', { minQty: '999999', maxQty: '1000000', leadTimeDays: '3650', autoOrderMaxAmount: '50000000' });

    await page.getByRole('button', { name: 'Motoru çalıştır' }).click();
    await expect(page.getByText(/^Motor çalıştı:/)).toBeVisible({ timeout: 20_000 });

    const t0Iso = t0.toISOString();
    const kajuPo = psqlRows(`
      select po.id, po.doc_no, po.status, po.sent_at, po.is_auto_approved
      from purchase_orders po join purchase_order_lines l on l.order_id = po.id
      where l.product_id = '${ctx.kajuId}' and po.is_ai_generated = true and po.created_at >= '${t0Iso}'
      order by po.created_at desc limit 1
    `)[0];
    expect(kajuPo, 'Kaju için AI taslak PO oluşmalı (beyaz liste dışı → onay bekliyor)').toBeTruthy();
    const [kajuPoId, kajuPoDocNo, kajuStatus, kajuSentAt] = kajuPo!;
    ctx.kajuPoId = kajuPoId; ctx.kajuPoDocNo = kajuPoDocNo;
    expect(kajuStatus).toBe('pending_approval');
    expect(kajuSentAt, 'beyaz liste dışı taslak asla otomatik gönderilmemeli — sentAt boş olmalı').toBeFalsy();

    const approvalRow = psqlOne(`select status from approvals where ref_table='purchase_orders' and ref_id='${ctx.kajuPoId}'`);
    expect(approvalRow, 'Kaju taslağı onay kuyruğuna (approvals) düşmeli').toBe('pending');

    const etiketPo = psqlRows(`
      select po.id, po.doc_no, po.status, po.sent_at, po.is_auto_approved, po.sent_via
      from purchase_orders po join purchase_order_lines l on l.order_id = po.id
      where l.product_id = '${etiketId}' and po.is_ai_generated = true and po.created_at >= '${t0Iso}'
      order by po.created_at desc limit 1
    `)[0];
    expect(etiketPo, 'Etiket için AI taslak PO oluşmalı (beyaz liste + tutar sınırı içinde → otomatik gönderilmeli)').toBeTruthy();
    const [etiketPoId, etiketPoDocNo, etiketStatus, etiketSentAt, etiketAuto, etiketSentVia] = etiketPo!;
    ctx.etiketPoId = etiketPoId; ctx.etiketPoDocNo = etiketPoDocNo;
    expect(etiketStatus).toBe('sent');
    expect(etiketSentAt, 'Beyaz listeli PO otomatik gönderilmeli — sentAt dolu olmalı').toBeTruthy();
    expect(etiketAuto).toBe('t');
    expect(etiketSentVia).toContain('email');

    // Ekran doğrulaması: sipariş listesinde her iki taslak da (Kaju pending_approval, Etiket sent)
    // gerçek durumlarıyla görünüyor.
    await page.goto('/satin-alma/siparisler');
    await expect(visibleText(page, kajuPoDocNo!)).toBeVisible();
    await expect(visibleText(page, etiketPoDocNo!)).toBeVisible();

    // Orkestratör akışı (Adım 1) beyaz liste dışı taslağın "/satin-alma/onay-kuyrugu VE /onaylar'da"
    // beklediğini açıkça belirtiyor — tek kuyruk `/onaylar` (`approvals` tablosu, kind='purchase_draft',
    // title=`Satın alma taslağı ${docNo}` — bkz. `apps/web/src/modules/purchasing/actions.ts:288`) aynı
    // kaydı kart olarak listeler; burada ikinci ekran ayrıca doğrulanır (yalnızca DB'deki `approvals`
    // satırına güvenmek yerine). Doc no kartın `title`'ına GÖMÜLÜ tek bir metin düğümü olarak render
    // edilir ("Satın alma taslağı PO-2026-000018") — `visibleText`'in varsayılan `exact:true`'su bu
    // yüzden burada eşleşmez; alt-dize eşleşmesi (`exact:false`) kullanılır.
    await page.goto('/onaylar');
    await expect(visibleText(page, kajuPoDocNo!, false)).toBeVisible();
  });

  test('Adım 2 — /satin-alma/onay-kuyrugu: Kaju taslağını Onayla → sipariş detayında "Tedarikçiye gönder"', async () => {
    await page.goto('/satin-alma/onay-kuyrugu');
    await expect(page.getByRole('heading', { name: 'Onay Kuyruğu' })).toBeVisible();
    const card = page.locator('div').filter({ hasText: ctx.kajuPoDocNo! }).filter({ has: page.getByRole('button', { name: 'Onayla' }) }).last();
    await card.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.getByText('Taslak onaylandı')).toBeVisible({ timeout: 10_000 });

    const statusAfterApprove = psqlOne(`select status from purchase_orders where id = '${ctx.kajuPoId}'`);
    expect(statusAfterApprove).toBe('approved');

    await page.goto(`/satin-alma/siparisler/${ctx.kajuPoId}`);
    await expect(page.getByText(ctx.kajuPoDocNo!).first()).toBeVisible();
    await page.getByRole('button', { name: 'Tedarikçiye gönder' }).click();
    await expect(page.getByText('Sipariş tedarikçiye gönderildi')).toBeVisible({ timeout: 10_000 });

    const sent = psqlRows(`select status, sent_at, sent_via from purchase_orders where id = '${ctx.kajuPoId}'`)[0]!;
    expect(sent[0]).toBe('sent');
    expect(sent[1]).toBeTruthy();
    expect(sent[2]).toContain('email');
  });

  test('Adım 3 — /depo/mal-kabul/yeni?po=: Kaju satırı QC gerektirdiği için karar otomatik "Karantina" → Kabul et', async () => {
    page = await switchRole(browser, page, 'depo');
    const kajuLotNo = `QA3-KJ-${RUN}`;
    await page.goto(`/depo/mal-kabul/yeni?po=${ctx.kajuPoId}`);
    await expect(page.getByRole('heading', { name: 'Yeni Mal Kabul' })).toBeVisible();
    await expect(page.getByText(ctx.kajuPoDocNo!)).toBeVisible();

    // Ürün `requiresIncomingQc=true` olduğundan satırın "Karar"ı sunucu tarafında zaten "Karantina"
    // ile önceden dolar (bkz. `apps/web/src/app/(app)/depo/mal-kabul/yeni/page.tsx` `initialLines`).
    await expect(page.getByText('Karantina', { exact: true }).first()).toBeVisible();

    await page.getByLabel(/^Miktar/).fill('20');
    await page.getByLabel('Birim maliyet').fill('260');
    await page.getByLabel('Tedarikçi lot no').fill(kajuLotNo);
    await fillDateField(page, 'SKT', trDate(300));
    await comboboxSelect(page, 'Lokasyon', 'TIRE/KARANTINA', 'TIRE/KARANTINA');

    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);
    await expect(visibleText(page, kajuLotNo)).toBeVisible();
    ctx.kajuLotNo1 = kajuLotNo;

    const lot = psqlRows(`select id, status from stock_lots where lot_no = '${kajuLotNo}'`)[0]!;
    expect(lot[1]).toBe('quarantine');
    ctx.qcLotId1 = lot[0];

    const check = psqlRows(`select id, result, template_id from qc_checks where lot_id = '${ctx.qcLotId1}'`)[0];
    expect(check, 'requiresIncomingQc=true olduğundan mal kabul otomatik bir pending QC kaydı açmalı').toBeTruthy();
    expect(check![1]).toBe('pending');
    ctx.qcCheckId1 = check![0];
  });

  test('Adım 3b — /depo/mal-kabul/yeni (POsuz): Bromelain (Proteinsan) ile ikinci bir mal kabul, aynı şekilde karantinaya girer', async () => {
    const bromelainLotNo = `QA3-BR-${RUN}`;
    await page.goto('/depo/mal-kabul/yeni');
    await comboboxSelect(page, 'Tedarikçi seçin', 'Proteinsan', /Proteinsan/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '306050000', /Bromelain/);
    await expect(page.getByText('Karantina', { exact: true }).first()).toBeVisible();

    await page.getByLabel(/^Miktar/).fill('10');
    await page.getByLabel('Birim maliyet').fill('1200');
    await page.getByLabel('Tedarikçi lot no').fill(bromelainLotNo);
    await fillDateField(page, 'SKT', trDate(300));
    await comboboxSelect(page, 'Lokasyon', 'TIRE/KARANTINA', 'TIRE/KARANTINA');

    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);
    await expect(visibleText(page, bromelainLotNo)).toBeVisible();
    ctx.bromelainLotNo2 = bromelainLotNo;

    const lot = psqlRows(`select id, status from stock_lots where lot_no = '${bromelainLotNo}'`)[0]!;
    expect(lot[1]).toBe('quarantine');
    ctx.qcLotId2 = lot[0];
    const check = psqlRows(`select id, result from qc_checks where lot_id = '${ctx.qcLotId2}'`)[0]!;
    expect(check[1]).toBe('pending');
    ctx.qcCheckId2 = check[0];
  });

  test('Adım 4 — /kalite/kontroller: Kaju kontrolünü Reddet (lot → TIRE/RED, değersiz hareket)', async () => {
    page = await switchRole(browser, page, 'kalite');
    await page.goto('/kalite/kontroller');
    await expect(page.getByRole('heading', { name: 'Kalite Kontrolleri' })).toBeVisible();
    await expect(visibleText(page, ctx.kajuLotNo1!)).toBeVisible();
    await expect(visibleText(page, ctx.bromelainLotNo2!)).toBeVisible();

    await page.goto(`/kalite/kontroller/${ctx.qcCheckId1}`);
    // NOT (bkz. rapor K3): mal kabulün OTOMATİK açtığı QC kaydına `templateId` atanmıyor
    // (`packages/core/src/stock/receipts.ts` satır ~185) — bu yüzden burada GENEL-HAM/KURUYEMIS
    // şablonundaki sayısal min/max alanları değil, tek bir serbest metin kutusu görünür
    // (`check-detail.tsx` `defaultItems` template=null dalı). Ayrıca bu metin alanının erişilebilir
    // bir etiketi YOK (`FormText` `label` verilmeden çağrılıyor) — placeholder ile hedefleniyor.
    await page.getByPlaceholder('Not').fill('Nem oranı sınır dışı, ambalaj hasarlı — reddedildi (QA)');
    await page.getByRole('button', { name: 'Sonuçları Kaydet' }).click();
    await expect(page.getByRole('button', { name: 'Reddet' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Reddet' }).click();
    await expect(page.getByText('Lot reddedildi')).toBeVisible({ timeout: 10_000 });

    const check = psqlRows(`select result, disposition from qc_checks where id = '${ctx.qcCheckId1}'`)[0]!;
    expect(check[0]).toBe('failed');
    expect(check[1]).toBe('rejected');

    const lot = psqlRows(`
      select l.status, loc.usage
      from stock_lots l
      join stock_quants sq on sq.lot_id = l.id and sq.qty > 0
      join locations loc on loc.id = sq.location_id
      where l.id = '${ctx.qcLotId1}'
    `)[0]!;
    expect(lot[0]).toBe('rejected');
    expect(lot[1]).toBe('rejected');

    const move = psqlRows(`select journal_entry_id, value from stock_moves where kind='quarantine_reject' and lot_id='${ctx.qcLotId1}'`)[0]!;
    expect(move[0], 'quarantine_reject değersiz olmalı — journal_entry_id NULL').toBeFalsy();
  });

  test('Adım 4b — /kalite/kontroller: Bromelain kontrolünü Serbest bırak (lot → dahili hammadde lokasyonu, değersiz hareket)', async () => {
    await page.goto(`/kalite/kontroller/${ctx.qcCheckId2}`);
    await page.getByPlaceholder('Not').fill('Nem ve ambalaj uygun — serbest bırakıldı (QA)');
    await page.getByRole('button', { name: 'Sonuçları Kaydet' }).click();
    await expect(page.getByRole('button', { name: 'Serbest Bırak' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Serbest Bırak' }).click();
    await expect(page.getByText('Lot serbest bırakıldı')).toBeVisible({ timeout: 10_000 });

    const check = psqlRows(`select result, disposition from qc_checks where id = '${ctx.qcCheckId2}'`)[0]!;
    expect(check[0]).toBe('passed');
    expect(check[1]).toBe('released');

    const lot = psqlRows(`
      select l.status, loc.usage
      from stock_lots l
      join stock_quants sq on sq.lot_id = l.id and sq.qty > 0
      join locations loc on loc.id = sq.location_id
      where l.id = '${ctx.qcLotId2}'
    `)[0]!;
    expect(lot[0]).toBe('released');
    expect(lot[1]).toBe('internal');

    // NOT (bkz. rapor K7): `psql -t -A` tek sütunlu bir satırda o sütun NULL ise TAMAMEN BOŞ bir satır
    // yazdırır — bu da `psqlRows` yardımcısının "satır yok" (`''`) durumuyla ayırt edilemez hale gelip
    // `[0]` çağrısını `undefined` yapar (canlı olarak yakalandı). Bu yüzden NULL beklenen tek bir sütunu
    // asla YALNIZ başına seçmiyoruz — yanına asla null olmayan bir eşlik sütunu (`kind`) eklenir.
    const move = psqlRows(`select journal_entry_id, kind from stock_moves where kind='quarantine_release' and lot_id='${ctx.qcLotId2}'`)[0]!;
    expect(move, 'quarantine_release hareketi bulunamalı').toBeTruthy();
    expect(move[0], 'quarantine_release değersiz olmalı — journal_entry_id NULL').toBeFalsy();
  });

  test('Adım 5 — /kalite/tedarikci-skoru: Anadolu Kuruyemiş skoru bu dönem için düştü (ret oranı arttı)', async () => {
    ctx.supplierS5Id = psqlOne("select id from partners where code = 'S-000005'")!;
    expect(ctx.supplierS5Id, 'Seed: S-000005 (Anadolu Kuruyemiş) bulunmalı').toBeTruthy();

    const beforeRow = psqlRows(`select qc_checks, qc_passed, score from supplier_scores where partner_id='${ctx.supplierS5Id}' and period='${currentPeriod}'`)[0];
    ctx.scoreBefore = beforeRow ? { qcChecks: Number(beforeRow[0]), qcPassed: Number(beforeRow[1]), score: Number(beforeRow[2]) } : null;

    await page.goto('/kalite/tedarikci-skoru');
    await expect(page.getByRole('heading', { name: 'Tedarikçi Kalite Skoru' })).toBeVisible();
    // NOT (Tur 2 güncellemesi — bkz. `compute-score-button.tsx` "Tur 1 P1 kalite-tedarikci-01"): ham
    // `<input type=month>` Türkçe Ay/Yıl `Select` çiftiyle değiştirildi (tarayıcı yereline değil sayfa
    // diline bağlı ay adları için) — varsayılan yine CARİ ay/yıl olduğundan dokunulmuyor, ama başarı
    // tost'u artık ISO "yyyy-mm" değil Türkçe ay adı + yıl basıyor ("N tedarikçi için Eylül 2026 skoru
    // hesaplandı") — eski ISO regex'i eşleşmiyordu (canlı yakalandı).
    const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const now = new Date();
    const currentMonthTr = TR_MONTHS[now.getMonth()]!;
    const currentYear = now.getFullYear();
    await page.getByRole('button', { name: 'Skoru Hesapla' }).click();
    await expect(page.getByText(new RegExp(`için ${currentMonthTr} ${currentYear} skoru hesaplandı`))).toBeVisible({ timeout: 15_000 });

    const afterRow = psqlRows(`select qc_checks, qc_passed, score from supplier_scores where partner_id='${ctx.supplierS5Id}' and period='${currentPeriod}'`)[0]!;
    const after = { qcChecks: Number(afterRow[0]), qcPassed: Number(afterRow[1]), score: Number(afterRow[2]) };

    // Bu testin eklediği TEK karar (Kaju reddi) bu tedarikçi için: +1 karara bağlanmış kontrol, +0 geçen —
    // qualityRate = qcPassed/qcChecks matematiksel olarak ARTAMAZ, skor da bu yüzden yükselemez.
    expect(after.qcChecks).toBe((ctx.scoreBefore?.qcChecks ?? 0) + 1);
    expect(after.qcPassed).toBe(ctx.scoreBefore?.qcPassed ?? 0);
    if (ctx.scoreBefore) expect(after.score).toBeLessThanOrEqual(ctx.scoreBefore.score);

    await page.getByPlaceholder('Tedarikçi ara…').fill('Anadolu');
    // NOT (Tur 2 güncellemesi): "KPI şeridi ... variant=strip'e taşındı" düzeltmesi artık ekranda ayrıca
    // bir "en düşük skor" özet kartı gösteriyor — tam da bu adımda skorunu düşürdüğümüz tedarikçi orada
    // da adıyla görünüyor, bu yüzden paylaşılan `visibleText` (tabloyla + kartla) İKİ eşleşmeye çarpıp
    // strict-mode ihlali veriyordu (canlı yakalandı). Arama sonucu doğrulaması burada özellikle TABLO
    // hücresine daraltılır.
    await expect(page.getByRole('cell', { name: /Anadolu Kuruyemiş/ }).filter({ visible: true })).toBeVisible();
  });

  test('Adım 6 — /kalite/izlenebilirlik: seed\'deki sevk edilmiş bir mamul lotu — geri (iş emri→hammadde→mal kabul/tedarikçi) ve ileri (sevkiyat→müşteri) zincir, miktar dengesi', async () => {
    const mamul = psqlRows(`
      select ml.id, ml.lot_no, ml.product_id
      from stock_lots ml
      join stock_quants sq on sq.lot_id = ml.id
      join delivery_lines dl on dl.lot_id = ml.id
      join deliveries d on d.id = dl.delivery_id and d.status in ('shipped','delivered')
      where ml.origin = 'production' and ml.status = 'released'
      group by ml.id, ml.lot_no, ml.product_id
      having sum(sq.qty - sq.reserved_qty) > 0
      order by sum(sq.qty - sq.reserved_qty) desc
      limit 1
    `)[0];
    expect(mamul, 'Seed: sevk edilmiş VE hâlâ eldeki stoğu olan bir mamul lotu bulunmalı').toBeTruthy();
    [ctx.mamulLotId, ctx.mamulLotNo, ctx.mamulProductId] = mamul!;

    const wo = psqlRows(`select origin_work_order_id, lot_no from stock_lots where id = '${ctx.mamulLotId}'`)[0]!;
    expect(wo[0], `mamul lotu (${ctx.mamulLotNo}) bir iş emrine bağlı olmalı (origin='production')`).toBeTruthy();
    ctx.woId = wo[0]!;
    const woRow = psqlRows(`select doc_no from work_orders where id = '${ctx.woId}'`)[0]!;
    ctx.woDocNo = woRow[0]!;

    const raw = psqlRows(`select rl.id, rl.lot_no from work_order_consumptions wc join stock_lots rl on rl.id = wc.lot_id where wc.work_order_id = '${ctx.woId}' order by rl.lot_no limit 1`)[0]!;
    [ctx.rawLotId, ctx.rawLotNo] = raw;

    // NOT (canlı yakalandı): bu mamul lotu BİRDEN FAZLA sevkiyata satır veriyor olabilir (bazıları
    // yalnızca 'rezerve', henüz sevk edilmemiş) — yukarıdaki `mamul` seçimi özellikle
    // status in ('shipped','delivered') şartına dayanıyor, bu ikinci sorgu AYNI şartı taşımazsa
    // (yalnızca created_at DESC ile en SON sevkiyatı alırsa) hiç sevk edilmemiş, yalnız rezerve bir
    // sevkiyatı seçip "İleriye izleme"de arayabileceğimizden FARKLI bir belge no'suna kilitlenebiliyordu.
    const delivery = psqlRows(`
      select d.id, d.doc_no, d.partner_id, p.name
      from delivery_lines dl join deliveries d on d.id = dl.delivery_id join partners p on p.id = d.partner_id
      where dl.lot_id = '${ctx.mamulLotId}' and d.status in ('shipped','delivered') order by d.created_at desc limit 1
    `)[0]!;
    [ctx.deliveryId, ctx.deliveryDocNo, ctx.customerId, ctx.customerName] = delivery;

    // NOT: bir önceki adımdan (Adım 4/4b) zaten 'kalite' oturumu açık — middleware oturumluyken
    // `/login`'i `/kokpit`'e yönlendirdiğinden (bkz. `switchRole` yorumu) burada TEKRAR `loginAs`
    // çağırmak (aynı rol için bile) forma hiç ulaşamaz; mevcut oturum aynen kullanılır.
    await page.goto('/kalite/izlenebilirlik');
    await expect(page.getByRole('heading', { name: 'İzlenebilirlik' })).toBeVisible();
    await page.getByPlaceholder('Lot no, ürün, müşteri veya tedarikçi ara…').fill(ctx.mamulLotNo!);
    await page.getByRole('button', { name: new RegExp(ctx.mamulLotNo!) }).first().click();

    await expect(page.getByText(ctx.mamulLotNo!, { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    const backward = page.getByText('Geriye izleme (kaynak)').locator('..').locator('..');
    await expect(backward.getByText(ctx.woDocNo!)).toBeVisible();
    await expect(backward.getByText(ctx.rawLotNo!)).toBeVisible();

    // NOT (canlı yakalandı — yazım hatası): gerçek buton metni "İleri izleme (varış)" — "İleriye" DEĞİL
    // (bkz. `trace-search.tsx` satır ~158). Eski metin hiçbir zaman eşleşmiyordu, bu yüzden `forward`
    // locator'ı hep BOŞ resolve olup hangi teslimat no'su seçilirse seçilsin aynı "element(s) not found"
    // hatasını üretiyordu (Adım 6'nın kök nedeni asıl bu, delivery seçim sorgusu değil).
    const forward = page.getByText('İleri izleme (varış)').locator('..').locator('..');
    await expect(forward.getByText(ctx.deliveryDocNo!)).toBeVisible();
    await expect(forward.getByText(new RegExp(ctx.customerName!.split(' ')[0]!))).toBeVisible();

    // NOT (canlı yakalandı): sayfada "Miktar dengesi" alt-dize eşleşmesi TEK başına strict-mode ihlali
    // veriyor (sayfanın başka bir açıklama metniyle çakışıyor) — asıl başlık `exact:true` ile tektir.
    await expect(page.getByText('Miktar dengesi', { exact: true })).toBeVisible();
    for (const label of ['Giriş', 'Tüketim', 'Sevkiyat', 'Fire', 'Eldeki']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Miktar dengesi: giriş = tüketim + sevk + fire + eldeki (docs/modules/kalite.md) — bağımsız SQL ile doğrulanır.
    // kalite-izlenebilirlik-miktar-dengesi (tur 8, P1) kök neden: `finishWorkOrder()`'ın 'production'
    // hareketi zaten NET üretimi (fireden arındırılmış) yazar; bitirmeden ÖNCE `recordScrap()` ile
    // kaydedilen fire ise VIRTUAL 'production' lokasyonundan VIRTUAL 'scrap' lokasyonuna gider
    // (ledger.ts VIRTUAL_USAGES) — gerçek stock_quants'a hiç dokunmaz. Bu WIP fireyi giriş'ten
    // düşülmüş gibi sayan bir SQL denklemi tam o miktar kadar sapar; sadece GERÇEK (stoklu) bir
    // lokasyondan çıkan fire (üretim sonrası/karantina/red lotu hurdaya ayrılması) fiziksel
    // dengeye dahil edilir — queries.ts:getTraceForLot() ile birebir aynı mantık.
    const moveSums = psqlRows(`
      select kind, coalesce(sum(qty),0) from stock_moves where lot_id = '${ctx.mamulLotId}' group by kind
    `);
    const sumOf = (kinds: string[]) => moveSums.filter((r) => kinds.includes(r[0]!)).reduce((a, r) => a + Number(r[1]), 0);
    const inQty = sumOf(['receipt', 'production', 'byproduct', 'opening', 'quarantine_release', 'return_in', 'recall_return']);
    const consumedQty = sumOf(['consumption']);
    const deliveredQty = sumOf(['delivery']);
    const scrapQty = Number(psqlOne(`
      select coalesce(sum(sm.qty),0) from stock_moves sm join locations l on l.id = sm.from_location_id
      where sm.lot_id = '${ctx.mamulLotId}' and sm.kind = 'scrap' and l.usage in ('internal','quarantine','rejected','transit')
    `));
    const onHandQty = Number(psqlOne(`select coalesce(sum(qty),0) from stock_quants where lot_id='${ctx.mamulLotId}'`));
    expect(inQty).toBeCloseTo(consumedQty + deliveredQty + scrapQty + onHandQty, 3);
  });

  test('Adım 7 — /kalite/geri-cagirma: hammadde lotundan İLERİ simülasyon → etki sayıları psql ile eşit → başlat → lotlar recalled', async () => {
    await page.goto('/kalite/geri-cagirma');
    await expect(page.getByRole('heading', { name: 'Geri Çağırma' })).toBeVisible();

    // NOT (Tur 2 güncellemesi — bkz. `recall-simulate-form.tsx` "Tur 1 P1 kalite-geri-cagirma-01"):
    // form artık sayfaya kalıcı yerleşik DEĞİL — masaüstünün 1/3'ünü sürekli işgal etmesin diye
    // `PageHeader` eylemi olan bir Sheet'e taşındı ("Yeni Simülasyon" butonu açıyor). Eski test doğrudan
    // combobox'ı arıyordu — Sheet kapalıyken bu hiç bulunamayıp 120s test timeout'una kadar asılı
    // kalıyordu (canlı yakalandı). Önce Sheet açılır.
    await page.getByRole('button', { name: 'Yeni Simülasyon' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // `RecallSimulateForm`'daki "Kök lot" alanı FormField bağlamı DIŞINDA bir `Combobox` (`FieldLabel`
    // burada gerçek bir `htmlFor` bağlamıyor — bkz. phase1-chain.spec.ts K-A11Y notu), ayrıca kendi
    // özel `searchPlaceholder`'ı var (genel "Ara…" değil) — bu yüzden paylaşılan `comboboxSelect`
    // yardımcısı yerine burada özel akış kullanılır.
    await sheet.getByRole('combobox').filter({ hasText: 'Lot no ara…' }).click();
    await page.getByPlaceholder('Lot no yazın (en az 2 karakter)').fill(ctx.rawLotNo!);
    await page.getByRole('option', { name: new RegExp(ctx.rawLotNo!) }).first().click();
    await page.getByLabel('Yön').click();
    await page.getByRole('option', { name: /Yalnızca ileri/ }).click();
    await page.getByLabel('Gerekçe').fill(`QA phase3 (${RUN}): yabancı madde şüphesi simülasyonu`);
    await page.getByRole('button', { name: 'Etkiyi Simüle Et' }).click();
    await page.waitForURL(/\/kalite\/geri-cagirma\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    ctx.recallId = page.url().split('/').pop()!;

    // NOT: `recalls.impact` jsonb kolonunu tek parça metin olarak `psqlRows` (F='|') ile çekmek
    // rizikolu — lot/ürün adlarında teorik olarak "|" geçebilir ve satır ayrıştırmayı bozar. Bunun
    // yerine her alan Postgres'in KENDİ jsonb operatörleriyle (`->`, `->>`, `jsonb_array_elements`)
    // ayrı ayrı, doğrudan SQL içinde okunur/karşılaştırılır — psql çıktısına asla ham JSON metni
    // taşınmaz.
    const recallRow = psqlRows(`select doc_no, status from recalls where id = '${ctx.recallId}'`)[0]!;
    ctx.recallDocNo = recallRow[0]!;
    expect(recallRow[1]).toBe('simulation');

    const counts = psqlRows(`
      select
        (impact->'counts'->>'lots')::int, jsonb_array_length(impact->'lots'),
        (impact->'counts'->>'workOrders')::int, jsonb_array_length(impact->'workOrders'),
        (impact->'counts'->>'deliveries')::int, jsonb_array_length(impact->'deliveries'),
        (impact->'counts'->>'customers')::int, jsonb_array_length(impact->'customers'),
        impact->>'qtyInStock'
      from recalls where id = '${ctx.recallId}'
    `)[0]!;
    expect(counts[0]).toBe(counts[1]);
    expect(counts[2]).toBe(counts[3]);
    expect(counts[4]).toBe(counts[5]);
    expect(counts[6]).toBe(counts[7]);

    const hasEntity = (arrayKey: string, id: string) =>
      psqlOne(`select exists (select 1 from recalls, jsonb_array_elements(impact->'${arrayKey}') e where recalls.id = '${ctx.recallId}' and e->>'id' = '${id}')`);
    expect(hasEntity('lots', ctx.rawLotId!)).toBe('t');
    expect(hasEntity('lots', ctx.mamulLotId!)).toBe('t');
    expect(hasEntity('workOrders', ctx.woId!)).toBe('t');
    expect(hasEntity('deliveries', ctx.deliveryId!)).toBe('t');
    expect(hasEntity('customers', ctx.customerId!)).toBe('t');

    // Bağımsız çapraz doğrulama: impact'teki TAM lot kümesi üzerinden gerçek stok toplamı
    // (`impact.lots` dizisindeki id'lerin GERÇEKTEN `stock_quants` toplamıyla eşleştiği, yalnızca
    // servisin kendi ürettiği sayıya güvenmek değil).
    const qtyInStockSql = Number(
      psqlOne(`
        select coalesce(sum(sq.qty),0)
        from recalls, jsonb_array_elements(impact->'lots') e
        join stock_quants sq on sq.lot_id = (e->>'id')::uuid
        where recalls.id = '${ctx.recallId}'
      `),
    );
    expect(qtyInStockSql).toBeCloseTo(Number(counts[8]), 3);

    await expect(page.getByRole('button', { name: 'Geri Çağırmayı Başlat' })).toBeVisible();
    await page.getByRole('button', { name: 'Geri Çağırmayı Başlat' }).click();
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Başlat' }).click();
    await expect(page.getByText(/lot bloklandı/)).toBeVisible({ timeout: 10_000 });

    const status = psqlRows(`select status from recalls where id = '${ctx.recallId}'`)[0]!;
    expect(status[0]).toBe('open');
    const lotStatuses = psqlRows(`select status from stock_lots where id in ('${ctx.rawLotId}', '${ctx.mamulLotId}')`);
    for (const [s] of lotStatuses) expect(s).toBe('recalled');
  });

  test('Negatif — geri çağrılan mamul lotu sevke alınamaz: FEFO recalled lotu göz ardı eder', async () => {
    const availBefore = Number(
      psqlOne(`
        select coalesce(sum(sq.qty - sq.reserved_qty),0)
        from stock_quants sq join stock_lots l on l.id = sq.lot_id
        where l.product_id = '${ctx.mamulProductId}' and l.status = 'released'
      `) ?? '0',
    );
    const sku = psqlOne(`select sku from products where id = '${ctx.mamulProductId}'`)!;
    const productName = psqlOne(`select name from products where id = '${ctx.mamulProductId}'`)!;

    page = await switchRole(browser, page, 'admin');
    const orderQty = Math.floor(availBefore) + 15;
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', sku, productName);
    await page.getByLabel(/^Miktar/).fill(String(orderQty));
    await page.keyboard.press('Tab');
    await expect(page.getByText(/^(Müşteri özel|Kanal listesi|Liste fiyatı|Elle girildi)$/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.locator('[data-status="confirmed"]').first()).toBeVisible({ timeout: 10_000 });

    const deliveryId = psqlOne(`select id from deliveries where sales_order_id = '${orderId}'`)!;
    await page.goto(`/depo/sevkiyat/${deliveryId}`);
    await page.getByRole('button', { name: 'FEFO ile rezerve et' }).click();
    await expect(page.getByText(/yeterli serbest stok yok/i)).toBeVisible({ timeout: 10_000 });

    const recalledReserved = psqlOne(`select coalesce(sum(reserved_qty),0) from stock_quants where lot_id = '${ctx.mamulLotId}'`);
    expect(Number(recalledReserved)).toBe(0);
    const status = psqlOne(`select status from deliveries where id='${deliveryId}'`);
    expect(status).toBe('draft');
  });

  test('Adım 8 — /bildirimler: SKT uyarı motoru elle tetiklenir → depo kullanıcısında bildirim + zil sayacı', async () => {
    // NOT (bkz. rapor K4): `apps/worker/src/jobs/expiryAlerts.ts` yalnızca `runExpiryAlerts`'i EXPORT
    // eder, kendi kendine bir CLI giriş noktası çağırmaz — `tsx src/jobs/expiryAlerts.ts` tek başına
    // hiçbir çıktı üretmeden sessizce biter. Orkestratörün önerdiği "veya eşdeğeri" burada işletilir:
    // tsx'in `-e` modu ile fonksiyon dinamik import edilip elle çağrılır (üretim/worker koduna
    // dokunulmadan, yalnızca test çalıştırıcısından tek seferlik bir çağrı).
    const out = execSync(
      `pnpm --filter @plantero/worker exec tsx -e "import('./src/jobs/expiryAlerts.ts').then(async (m) => { const r = await m.runExpiryAlerts(); console.log('EXPIRY_RESULT:'+JSON.stringify(r)); process.exit(0); }).catch((e)=>{console.error(e); process.exit(1);});"`,
      { encoding: 'utf-8', cwd: process.cwd() },
    );
    const match = out.match(/EXPIRY_RESULT:(\{.*\})/);
    expect(match, `expiryAlerts job çıktısı okunamadı: ${out}`).toBeTruthy();
    const result = JSON.parse(match![1]!) as { lotsEvaluated: number; recipients: number };
    expect(result.lotsEvaluated).toBeGreaterThan(0);
    expect(result.recipients).toBeGreaterThan(0);

    const depoUserId = psqlOne("select id from users where email = 'depo@plantero.local'")!;
    const recentNotif = psqlOne(`
      select count(*) from notifications
      where user_id = '${depoUserId}' and ref_table = 'expiry_digest' and channel = 'in_app'
        and created_at >= now() - interval '2 hours'
    `);
    expect(Number(recentNotif), 'depo kullanıcısına SKT özet bildirimi düşmeli (bugün, seed veya bu tetikleme ile)').toBeGreaterThan(0);

    page = await switchRole(browser, page, 'depo');
    await expect(page.getByRole('link', { name: /Bildirimler \(\d+ okunmamış\)/ })).toBeVisible();
    await page.goto('/bildirimler');
    await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
    await expect(page.getByText(/SKT/).first()).toBeVisible();
  });
});

/* ==================================================================== */
/* Negatifler                                                            */
/* ==================================================================== */

test.describe('Negatifler (phase3)', () => {
  test('yetkisiz rol: depo kullanıcısı /satin-alma/onay-kuyrugu sayfasında engellenir', async ({ page }) => {
    await loginAs(page, 'depo', '/satin-alma/onay-kuyrugu');
    await expect(page).toHaveURL(/\/satin-alma\/onay-kuyrugu/);
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Onay Kuyruğu' })).not.toBeVisible();
  });

  test('beyaz liste dışı PO asla otomatik gönderilmez: son 24 saatteki AI taslaklarından hiçbiri, ilgili kural beyaz listede değilken otomatik gönderilmiş olamaz', async () => {
    // NOT (bkz. rapor K8 — canlı yakalandı, iki ayrı kök neden):
    //
    // 1) `pol.reorder_rule_id` FK'sine güvenerek JOIN etmek YANLIŞ — ANTHROPIC_API_KEY .env'de
    //    TANIMLI olduğundan `draftPurchaseOrders` (packages/ai/src/purchasing.ts) gerçek bir LLM
    //    çağrısı yapıyor (kural tabanlı deterministik fallback DEĞİL); `runReplenishmentAction`
    //    (apps/web/src/modules/purchasing/actions.ts ~L252) satır başına `ruleByProduct.get(l.productId)
    //    ?.ruleId ?? null` ile eşleştirme yapıyor ve bu bazı satırlarda NULL'a düşüyor (canlı: aynı
    //    "Motoru çalıştır" çağrısında Bromelain/Etiket satırları dolu geldi, Kaju/Etiket'in DİĞER
    //    çağrısı ile Vanilya Aroması NULL geldi — üç ayrı PO'da tutarsız). `reorder_rules` tablosunda
    //    (product_id, warehouse_id) üzerinde BENZERSİZ bir kural olduğundan (bkz. `reorder_rules_uq`,
    //    packages/db/src/schema/stock.ts ~L343) doğru JOIN kırılgan FK yerine bunun üzerinden yapılır
    //    — geriye dönük etkilenmeyen bir dayanıklılık.
    //
    // 2) Asıl test niyeti "asla OTOMATİK gönderilmez" idi ama eski sorgu herhangi bir `sentAt`'ı
    //    ihlal sayıyordu — Adım 2'de Kaju taslağı bilinçli olarak ONAYLANIP sonra bir insan tarafından
    //    "Tedarikçiye gönder" ile ELLE gönderiliyor (beyaz liste dışı olduğu HALDE, tam da akışın
    //    gerektirdiği gibi) ve bu MEŞRU bir sentAt üretiyor — otomatik değil. Gerçek değişmez kural
    //    `po.is_auto_approved` sütununda: yalnızca beyaz listedeki kurallardan gelen taslaklar
    //    `is_auto_approved=true` olabilir (bkz. `evaluateAutoOrderEligibility`) — bu yüzden kontrol
    //    `sentAt` yerine doğrudan `is_auto_approved` üzerinden yapılır; psql ile bağımsız doğrulandı
    //    (Kaju: whitelisted=f, is_auto_approved=f, sentAt DOLU-ama-meşru; Etiket ×2: whitelisted=t,
    //    is_auto_approved=t; Vanilya Aroması/Bromelain: whitelisted=f, is_auto_approved=f, sentAt boş).
    const rows = psqlRows(`
      select po.id, rr.is_auto_order_whitelisted, po.is_auto_approved, po.sent_at, po.status
      from purchase_orders po
      join purchase_order_lines pol on pol.order_id = po.id
      left join reorder_rules rr on rr.product_id = pol.product_id and rr.warehouse_id = po.warehouse_id
      where po.is_ai_generated = true and po.created_at >= now() - interval '1 hour'
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const [, whitelisted, isAutoApproved] of rows) {
      if (whitelisted !== 't') expect(isAutoApproved, 'beyaz liste dışı bir kuraldan gelen PO satırı is_auto_approved=true taşıyamaz (otomatik gönderim yalnızca beyaz listede)').not.toBe('t');
    }
  });
});

/* ==================================================================== */
/* Mobil (390×844) / Tablet (1024×768) geçişler                          */
/* ==================================================================== */

test.describe('Mobil/Tablet geçişler (phase3)', () => {
  test('Mobil 390×844 — depo: mal kabul formu kırılmadan çalışır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'depo', '/depo/mal-kabul/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Mal Kabul' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
    await expect(page.getByRole('combobox').filter({ hasText: 'Ürün ara ve ekle…' })).toBeVisible();
    await ctxB.close();
  });

  test('Mobil 390×844 — kalite: kontrol listesi ve zil kırılmadan çalışır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'kalite', '/kalite/kontroller');
    await expect(page.getByRole('heading', { name: 'Kalite Kontrolleri' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctxB.close();
  });

  test('Tablet 1024×768 — satın alma: kritik stok ve onay kuyruğu kullanılabilir', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctxB.newPage();
    await loginAs(page, 'satin_alma', '/satin-alma/kritik-stok');
    await expect(page.getByRole('heading', { name: 'Kritik Stok' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctxB.close();
  });
});
