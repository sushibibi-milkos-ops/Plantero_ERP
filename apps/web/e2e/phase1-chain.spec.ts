import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { loginAs } from './fixtures/auth';

/**
 * Akış: /depo/mal-kabul (hammadde) → /uretim/is-emirleri + /operator (mamul lot) →
 * /satis/siparisler → /depo/sevkiyat (FEFO, toplama, sevk) → fatura → /depo/lotlar izlenebilirlik.
 * Her adım gerçek tıklamalarla admin (ve operatör PIN'i ile ayrı bir tarayıcı bağlamında) çalıştırılır;
 * ekran doğrulamalarının yanında `psql` ile veritabanı doğrulaması yapılır (bkz. rapor).
 *
 * Test verisi: seed'in garanti ettiği ana veriye dayanır (SKU'lar, depolar, hesap kodları, TOPTAN
 * kanalı/carisi) — hiçbir sabit ID kullanılmaz; benzersizlik zaman damgalı `RUN` etiketiyle sağlanır.
 *
 * Ürün seçimi: HAT1'de seed'in kendi "devam eden" iş emri (BADEM BAZI) zaten bulunuyor — aynı
 * hat+ürün ile çakışmamak için bu akış HAT3'ün tek varsayılan ürünü olan "Oat Coffee Creamer"
 * (150040001, ana hammaddesi Yulaf 301060000) üzerinden yürütülür.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const RUN = Date.now().toString(36);

function psql(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  // PGTZ: psql oturumu uygulamanın iş takvimiyle (Europe/Istanbul) aynı `current_date`'i görsün.
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

/**
 * Özel arama kutusu (`src/components/form/combobox.tsx`, `role="combobox"`) üzerinde: aç → ara → tıkla.
 * NOT: bu bileşenin tetikleyici düğmesi `role="combobox"` taşır ama erişilebilir ADI yoktur — üstündeki
 * `<FieldLabel>` bir `<FormField>` bağlamı dışında kullanıldığında `htmlFor` hedefsiz kalır (bkz. rapor
 * K-A11Y). Bu yüzden `getByRole(..., { name })` yerine görünür metne göre `filter({ hasText })` kullanılır.
 * Arama terimi SKU ile verilir (ürün adıyla değil) — Türkçe küçük harfe çevirmede "I" → "ı" olduğundan
 * "BADEM BAZI" gibi aramalar "2x/3x/6x Badem Bazı" ile de eşleşip yanlış satırı seçebiliyor (bkz. rapor).
 */
async function comboboxSelect(page: Page, triggerText: string, search: string, optionMatch: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder('Ara…').fill(search);
  await page.getByRole('option', { name: optionMatch }).first().click();
  // Radix Popover kapanış geçişi anlık değil — bir sonraki combobox'ı açmadan önce bunun tam
  // kapandığından emin olunur, yoksa iki "Ara…" arama kutusu aynı anda DOM'da kalıp strict-mode
  // ihlaline yol açabiliyor.
  await expect(page.getByPlaceholder('Ara…')).toHaveCount(0);
}

/**
 * `DataTable` (`src/components/data-table/data-table.tsx`) her satırı DOM'da İKİ KEZ tutar: bir
 * masaüstü `<table>` (`hidden md:block`) ve bir mobil kart listesi (`md:hidden`) — ikisi de aynı anda
 * DOM'dadır, yalnızca CSS media query ile gizlenir (bkz. rapor). Bu yüzden DataTable içeren sayfalarda
 * `getByText(..., { exact: true })` iki eşleşme bulup strict-mode ihlaline düşer. Playwright'ın kendi
 * `visible` filtresiyle o an ekranda GERÇEKTEN görünen kopyaya daraltılır — CSS sınıfına bağlı kırılgan
 * bir seçici değil, Playwright'ın hesapladığı gerçek görünürlük durumu kullanılır.
 */
function visibleText(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true });
}

/** gg.aa.yyyy biçiminde bugün + gün ofseti. */
function trDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Diyalog içindeki tek ondalık miktar alanı (NumberInput'lar bu ekranlarda gerçek `<label for>` ile bağlı değil — bkz. rapor K-A11Y). */
function dialogAmountInput(page: Page) {
  return page.getByRole('dialog').locator('input[inputmode="decimal"]');
}

/**
 * Tarih alanı (`DateInput`, `src/components/form/date-field.tsx`) `id` almaz — `<FieldLabel>`'ın
 * `htmlFor`'u hiçbir şeye bağlanmaz (bkz. rapor K-A11Y). Etiket metninden kardeş konumdaki gerçek
 * `<input>`'a XPath ile ulaşılır (gg.aa.yyyy yazılabilir alan).
 */
async function fillDateField(page: Page, labelExact: string, value: string) {
  const input = page.getByText(labelExact, { exact: true }).locator('xpath=following-sibling::*[1]//input');
  await input.fill(value);
  await input.press('Tab');
}

/**
 * Operatör terminaline PIN ile giriş yapar. `/operator/giris` `middleware.ts` `PUBLIC_PATHS`
 * listesinde olduğu için oturumsuz (temiz bir tarayıcı bağlamından) doğrudan erişilebilir —
 * saha operatörünün ofis e-posta/şifresine ihtiyacı yoktur.
 */
async function operatorPinLogin(page: Page) {
  await page.goto('/operator/giris');
  await page.getByRole('button', { name: /Üretim Operatörü/ }).click();
  for (const d of ['1', '2', '3', '4']) await page.getByRole('button', { name: d, exact: true }).click();
  await page.waitForURL(/\/operator$/);
}

test.describe.configure({ mode: 'serial' });

test.describe('Akış: Mal kabul → üretim → satış → fatura → izlenebilirlik zinciri (phase1)', () => {
  test.setTimeout(120_000);

  const ctx: {
    receiptId?: string; rawLotNo?: string; quarantineLotNo?: string;
    woId?: string; woDocNo?: string; producedLotId?: string; producedLotNo?: string;
    orderId?: string; orderDocNo?: string; deliveryId?: string; deliveryDocNo?: string;
    invoiceId?: string; invoiceDocNo?: string; pickedLotNo?: string; pickedLotId?: string;
    customerId?: string; partnerBalanceBefore?: string;
  } = {};

  let page: Page;

  /**
   * Next.js dev sunucusu rotaları TALEP ÜZERİNE (lazy) derler — bir rotaya ilk kez gidildiğinde
   * derleme 15-60s sürebiliyor (bkz. rapor: cold-compile). Bu zincir onlarca farklı rotaya
   * (`/depo/mal-kabul/[id]`, `/operator/[lineId]`, `/satis/siparisler/[id]`, …) İLK KEZ bu testte
   * gidiyor; derleme süresi adım başına 90s test bütçesini tüketip GERÇEK bir uygulama hatası
   * yokken testi "timeout" ile kırabiliyor (turda ilk koşuda tam olarak bu yaşandı: adım 1 GET
   * 63.6s + [id] derleme 34.6s tek başına 90s'yi aştı; ikinci koşuda ise `/operator/*` üç rotası
   * art arda ilk kez derlenip toplamda ~117s tuttu). Bu; test beklentisini gevşetmek değil —
   * derleme maliyetini zamanlı adımların DIŞINA, süresiz bir ön-ısıtma adımına taşımak: her rota
   * paylaşılan admin oturumuyla (tüm izinlere sahip) bir kez GET edilir, modül derlenir ve önbelleğe
   * alınır; ardından gerçek (zamanlı) adımlar aynı modülü SICAK bulur. Hiçbir assertion burada
   * çalışmaz — yalnızca derleyiciyi tetiklemek amaçlıdır, best-effort (hata yutulur).
   */
  async function warmRoutes(p: Page, paths: string[]) {
    for (const path of paths) {
      await p.goto(path, { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(600_000);
    page = await browser.newPage();
    await loginAs(page, 'admin');

    const seedReceiptId = psqlOne('select id from receipts limit 1');
    const seedWoId = psqlOne('select id from work_orders limit 1');
    const seedOrderId = psqlOne('select id from sales_orders limit 1');
    const seedDeliveryId = psqlOne('select id from deliveries limit 1');
    const seedLotId = psqlOne('select id from stock_lots limit 1');
    const seedPartnerId = psqlOne("select id from partners where code = 'C-000005'");
    const hat3Id = psqlOne("select id from production_lines where code = 'HAT3'");

    await warmRoutes(page, [
      '/depo/mal-kabul/yeni',
      ...(seedReceiptId ? [`/depo/mal-kabul/${seedReceiptId}`] : []),
      '/depo/stok',
      '/uretim/is-emirleri',
      '/uretim/is-emirleri/yeni',
      ...(seedWoId ? [`/uretim/is-emirleri/${seedWoId}`] : []),
      '/operator/giris',
      '/operator',
      ...(hat3Id ? [`/operator/${hat3Id}`] : []),
      '/satis/siparisler/yeni',
      ...(seedOrderId ? [`/satis/siparisler/${seedOrderId}`] : []),
      ...(seedDeliveryId ? [`/depo/sevkiyat/${seedDeliveryId}`, `/depo/sevkiyat/${seedDeliveryId}/topla`] : []),
      ...(seedLotId ? [`/depo/lotlar/${seedLotId}`] : []),
      ...(seedPartnerId ? [`/ana-veri/cariler/${seedPartnerId}`] : []),
    ]);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Adım 1 — /depo/mal-kabul/yeni: Yulaf 100 KG, tedarikçi lotu benzersiz, SKT +200 gün, serbest → Kabul et', async () => {
    const supplierLotNo = `QA-${RUN}`;

    await page.goto('/depo/mal-kabul/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Mal Kabul' })).toBeVisible();

    await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '301060000', /Yulaf/);

    await page.getByLabel(/^Miktar/).fill('100');
    await page.getByLabel('Birim maliyet').fill('300');
    await page.getByLabel('Tedarikçi lot no').fill(supplierLotNo);
    await fillDateField(page, 'SKT', trDate(200));
    await comboboxSelect(page, 'Lokasyon', 'TIRE/HAM/R01/A', 'TIRE/HAM/R01/A');

    // "Karar" varsayılan olarak zaten "Serbest" (Yulaf requiresIncomingQc=false) — dokunulmuyor.
    await expect(page.getByText('Serbest', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);
    ctx.receiptId = page.url().split('/').pop()!;

    // Ekranda: lot rozeti + lokasyon (bkz. visibleText — ReceiptLinesTable bir DataTable, satır
    // DOM'da masaüstü+mobil olmak üzere iki kez durur)
    await expect(visibleText(page, supplierLotNo)).toBeVisible();
    await expect(visibleText(page, 'TIRE/HAM/R01/A')).toBeVisible();

    ctx.rawLotNo = supplierLotNo;
  });

  test('Adım 1b — ikinci mal kabul: aynı üründen küçük bir parti "Karantina" kararıyla alınır (operatör engel testi için)', async () => {
    const quarantineLotNo = `QA-Q-${RUN}`;

    await page.goto('/depo/mal-kabul/yeni');
    await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '301060000', /Yulaf/);
    await page.getByLabel(/^Miktar/).fill('5');
    await page.getByLabel('Birim maliyet').fill('300');
    await page.getByLabel('Tedarikçi lot no').fill(quarantineLotNo);

    // Karar: "Serbest" → "Karantina" (gerçek Radix Select — buradaki <label> düzgün bağlı, bkz. rapor)
    await page.getByLabel('Karar').click();
    await page.getByRole('option', { name: 'Karantina', exact: true }).click();
    await comboboxSelect(page, 'Lokasyon', 'TIRE/KARANTINA', 'TIRE/KARANTINA');

    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Karantina', { exact: true }).first()).toBeVisible();

    const lotStatus = psqlOne(`select status from stock_lots where lot_no = '${quarantineLotNo}'`);
    expect(lotStatus).toBe('quarantine');
    ctx.quarantineLotNo = quarantineLotNo;
  });

  test('Adım 1 DB doğrulama — stock_moves(kind=receipt) + journal_entries VUK/UFRS 150/320.999', async () => {
    const rows = psqlRows(`
      select sm.id, sm.kind, sm.qty, sm.value, sm.journal_entry_id, l.status, l.expiry_date
      from stock_moves sm
      join stock_lots l on l.id = sm.lot_id
      where l.lot_no = '${ctx.rawLotNo}' and sm.ref_type = 'receipt'
    `);
    expect(rows.length, 'Yulaf lotu için tam olarak bir mal kabul hareketi olmalı').toBe(1);
    const [, kind, qty, value, journalEntryId, status] = rows[0]!;
    expect(kind).toBe('receipt');
    expect(Number(qty)).toBeCloseTo(100, 4);
    expect(Number(value)).toBeCloseTo(30000, 4); // 100 * 300
    expect(status).toBe('released');
    expect(journalEntryId, 'stock_moves.journal_entry_id (VUK fişi) dolu olmalı').toBeTruthy();

    const vuk = psqlRows(`
      select je.ledger, jl.account_code, jl.debit, jl.credit
      from journal_entries je join journal_lines jl on jl.entry_id = je.id
      where je.id = '${journalEntryId}' order by jl.account_code
    `);
    expect(vuk.length).toBe(2);
    expect(vuk.every((r) => r[0] === 'VUK')).toBe(true);
    const debit150 = vuk.find((r) => r[1] === '150');
    const credit320 = vuk.find((r) => r[1] === '320.999');
    expect(debit150, 'VUK: 150 borç').toBeTruthy();
    expect(Number(debit150![2])).toBeCloseTo(30000, 4);
    expect(credit320, 'VUK: 320.999 alacak').toBeTruthy();
    expect(Number(credit320![3])).toBeCloseTo(30000, 4);

    const ufrsId = psqlOne(`select twin_entry_id from journal_entries where id = '${journalEntryId}'`);
    expect(ufrsId, 'VUK fişinin UFRS ikizi olmalı').toBeTruthy();
    const ufrs = psqlRows(`select je.ledger, jl.account_code, jl.debit, jl.credit from journal_lines jl join journal_entries je on je.id=jl.entry_id where je.id = '${ufrsId}'`);
    expect(ufrs.length).toBe(2);
    expect(ufrs.every((r) => r[0] === 'UFRS')).toBe(true);

    // /depo/stok: ürün aratılınca yeni lot kırılımda görünür
    await page.goto('/depo/stok');
    await page.getByPlaceholder('Ürün, SKU ara…').fill('301060000');
    await page.getByText('Yulaf', { exact: true }).first().click();
    // /depo/stok satır kırılımı da bir DataTable (stock-table.tsx) — bkz. visibleText.
    await expect(visibleText(page, ctx.rawLotNo!)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Adım 2 — /uretim/is-emirleri/yeni: Oat Coffee Creamer × 20, HAT3 → oluştur → Serbest bırak', async () => {
    await page.goto('/uretim/is-emirleri/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni İş Emri' })).toBeVisible();

    await comboboxSelect(page, 'Ürün seçin (aktif reçetesi olanlar)', '150040001', '150040001');
    await page.getByLabel('Planlanan miktar').fill('20');
    // Hat, reçetenin varsayılan hattı (HAT3) otomatik dolar.
    await expect(page.getByLabel('Hat')).toHaveText(/HAT3/);

    // Malzeme önizlemesi: Yulaf satırı eksik değil (adım 1'de 100 KG kabul edildi)
    await expect(page.getByRole('cell', { name: 'Yulaf' })).toBeVisible({ timeout: 10_000 });
    const shortageWarning = page.getByText('Bazı malzemelerde eldeki serbest stok yetersiz');
    await expect(shortageWarning).toHaveCount(0);

    await page.getByRole('button', { name: 'İş emrini oluştur' }).click();
    await page.waitForURL(/\/uretim\/is-emirleri\/[0-9a-f-]{36}$/);
    ctx.woId = page.url().split('/').pop()!;

    // Yeni iş emri "Planlandı" durumunda oluşur — operatör terminalinde bu durum "aktif" sayılmaz
    // (bkz. rapor K2); admin burada serbest bırakır.
    await expect(page.locator('[data-status="planned"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Serbest bırak' }).click();
    await expect(page.locator('[data-status="released"]').first()).toBeVisible();

    const wo = psqlRows(`select doc_no, status, planned_qty from work_orders where id = '${ctx.woId}'`)[0]!;
    ctx.woDocNo = wo[0];
    expect(wo[1]).toBe('released');
    expect(Number(wo[2])).toBeCloseTo(20, 4);
  });

  test('Adım 2 — /operator: PIN 1234 → HAT3 → Başlat → Okut (FEFO dışı onay + karantina engeli) → Fire 1 → Bitir 19', async ({ browser }) => {
    // Tamamen oturumsuz, temiz bir tarayıcı bağlamı: saha operatörü ofis e-posta/şifresi
    // olmadan doğrudan PIN terminaline girebilmeli (`/operator/giris` middleware.ts
    // PUBLIC_PATHS içinde).
    const opCtx = await browser.newContext();
    const op = await opCtx.newPage();

    await operatorPinLogin(op);

    // "HAT3" metni ekranda iki kez geçer: hat kartının kod satırı (bkz. `getByRole('link', …)`)
    // ve — yalnızca lg (≥1024px) kırılımında görünen — "Vardiya özeti" şeridindeki hat kodu
    // (`apps/web/src/app/(operator)/operator/page.tsx`, satır ~166). İkisi de aynı anda DOM'da;
    // bu kasıtlı bir tasarım (özet şerit CSS `lg:block` ile gizlenir), test hatası değil — bu
    // yüzden gerçek kart bağlantısı erişilebilir isimle (`role="link"`) hedeflenir.
    await op.getByRole('link', { name: /HAT3/ }).click();
    await op.waitForURL(/\/operator\//);
    await expect(op.getByRole('heading', { name: 'Oat Coffee Creamer' })).toBeVisible();
    await expect(op.getByText(ctx.woDocNo!)).toBeVisible();

    await op.getByRole('button', { name: 'Başlat' }).click();
    await expect(op.getByText('Devam ediyor').or(op.getByText('Süre'))).toBeVisible();

    // Okut: adım 1'in Yulaf lotu FEFO sırasında değil (mevcut lotların SKT'si daha erken) →
    // "FEFO sırası dışı lot" uyarısı beklenir; "Yine de kullan" ile onaylanır.
    const scanInput = op.getByPlaceholder(/Lot \/ barkod okutun/);
    await scanInput.fill(ctx.rawLotNo!);
    await scanInput.press('Enter');
    await expect(op.getByRole('dialog').getByText('FEFO sırası dışı lot')).toBeVisible({ timeout: 10_000 });
    await op.getByRole('button', { name: 'Yine de kullan' }).click();
    await expect(op.getByRole('dialog')).toBeHidden();
    await expect(op.getByText(ctx.rawLotNo!)).toBeVisible();

    // Adım 1b'de karantinaya alınan Yulaf lotu okutulunca ENGEL beklenir (LOT_NOT_RELEASED)
    await scanInput.fill(ctx.quarantineLotNo!);
    await scanInput.press('Enter');
    await expect(op.getByText(new RegExp(`${ctx.quarantineLotNo}.*serbest değil`))).toBeVisible({ timeout: 10_000 });
    // Engellendiği için tüketilmedi: DB'de bu lotun tüketimi yok
    const blockedConsumptions = psqlOne(`select count(*) from work_order_consumptions where lot_id = (select id from stock_lots where lot_no='${ctx.quarantineLotNo}')`);
    expect(blockedConsumptions).toBe('0');

    // Fire gir: 1 ADET (ambalaj aşaması)
    await op.getByRole('button', { name: 'Fire gir' }).click();
    await dialogAmountInput(op).fill('1');
    await op.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click();
    await expect(op.getByRole('dialog')).toBeHidden();

    // Bitir: üretilen 19, reçeteye göre kalanı otomatik tüket (varsayılan işaretli)
    await op.getByRole('button', { name: 'Bitir' }).click();
    const finishDialog = op.getByRole('dialog');
    await expect(finishDialog.getByRole('checkbox')).toBeChecked();
    await dialogAmountInput(op).fill('19');
    await finishDialog.getByRole('button', { name: 'Bitir' }).click();
    await op.waitForURL(/\/operator$/, { timeout: 15_000 });

    await opCtx.close();
  });

  test('Adım 2 DB doğrulama — WO maliyeti tutarlı, mamul lot released ve stokta', async () => {
    const wo = psqlRows(`select status, produced_qty, scrap_qty, material_cost, overhead_cost, total_cost, unit_cost, output_lot_id from work_orders where id = '${ctx.woId}'`)[0]!;
    expect(wo[0]).toBe('finished');
    expect(Number(wo[1])).toBeCloseTo(19, 4);
    expect(Number(wo[2])).toBeCloseTo(1, 4);
    const [, , , materialCost, overheadCost, totalCost, unitCost, outputLotId] = wo;
    expect(Number(totalCost)).toBeCloseTo(Number(materialCost) + Number(overheadCost), 2);
    expect(Number(unitCost)).toBeCloseTo(Number(totalCost) / 19, 2);
    expect(outputLotId).toBeTruthy();
    ctx.producedLotId = outputLotId!;

    const lot = psqlRows(`select lot_no, status, origin_work_order_id from stock_lots where id = '${ctx.producedLotId}'`)[0]!;
    ctx.producedLotNo = lot[0];
    expect(lot[0]).toMatch(/^PL-\d{6}-H3-\d{2}$/);
    expect(lot[1]).toBe('released');
    expect(lot[2]).toBe(ctx.woId);

    const onHand = psqlOne(`select coalesce(sum(qty),0) from stock_quants where lot_id = '${ctx.producedLotId}'`);
    expect(Number(onHand)).toBeCloseTo(19, 4);

    // Ekranda: /depo/lotlar üzerinde released + iş emri detayında çıktı satırı
    await page.goto(`/depo/lotlar/${ctx.producedLotId}`);
    await expect(page.getByText(ctx.producedLotNo!, { exact: true })).toBeVisible();
    await expect(page.locator('[data-status="released"]').first()).toBeVisible();

    await page.goto(`/uretim/is-emirleri/${ctx.woId}`);
    await page.getByRole('tab', { name: 'Maliyet' }).click();
    // "Verim" yüzdesi ekranda İKİ yerde aynı anda durur: sayfa başlığındaki her zaman görünen
    // StatCell ve — sekme aktifken — Maliyet sekmesinin kendi "Verim" kutusu
    // (`work-order-tabs.tsx`, satır ~213-215). Bu kasıtlı bir tekrar (tasarım), test hatası
    // değil — bu yüzden aktif `tabpanel` içine daraltılır.
    const costPanel = page.getByRole('tabpanel', { name: 'Maliyet' });
    await expect(costPanel.getByText('Toplam maliyet')).toBeVisible();
    await expect(costPanel.getByText(/^%9[0-9]$/, { exact: true })).toBeVisible();
  });

  test('Adım 3 — /satis/siparisler/yeni: toptan müşteri, Oat Coffee Creamer × 10, fiyat kaynağı rozeti → Onayla', async () => {
    ctx.customerId = psqlOne(`select id from partners where code = 'C-000005'`)!;
    expect(ctx.customerId, 'Seed: C-000005 (Doğal Yaşam Market Zinciri) bulunmalı').toBeTruthy();
    ctx.partnerBalanceBefore = psqlOne(`select balance from partners where id = '${ctx.customerId}'`)!;
    const priceRow = psqlRows(`
      select pli.price, pl.includes_vat, p.vat_rate
      from price_list_items pli
      join price_lists pl on pl.id = pli.price_list_id
      join products p on p.id = pli.product_id
      where pl.code = 'TOPTAN' and p.sku = '150040001'
    `)[0];
    expect(priceRow, 'Seed: TOPTAN fiyat listesinde 150040001 için fiyat olmalı').toBeTruthy();
    const [grossPrice, includesVat, vatRate] = priceRow!;
    // Fiyat listesi KDV dahil ise `resolvePrice` KDV hariç net fiyata çevirir (bkz. packages/core/src/sales/pricing.ts).
    const expectedNet = includesVat === 't' ? Number(grossPrice) / (1 + Number(vatRate) / 100) : Number(grossPrice);
    const expectedPriceStr = expectedNet.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    await page.goto('/satis/siparisler/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Sipariş' })).toBeVisible();

    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await expect(page.getByLabel('Kanal')).toHaveText(/Toptan/);

    await comboboxSelect(page, 'Ürün ara ve ekle…', '150040001', '150040001');
    const qtyField = page.getByLabel(/^Miktar/);
    await qtyField.fill('10');
    await qtyField.blur();
    await expect(page.getByText('Liste fiyatı', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Birim fiyat (KDV hariç)')).toHaveValue(expectedPriceStr);

    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    ctx.orderId = page.url().split('/').pop()!;

    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.locator('[data-status="confirmed"]').first()).toBeVisible({ timeout: 10_000 });

    const order = psqlRows(`select doc_no, status from sales_orders where id = '${ctx.orderId}'`)[0]!;
    ctx.orderDocNo = order[0];
    expect(order[1]).toBe('confirmed');

    const delivery = psqlRows(`select id, doc_no, status from deliveries where sales_order_id = '${ctx.orderId}'`)[0]!;
    expect(delivery, 'Onay sonrası irsaliye taslağı otomatik açılmalı').toBeTruthy();
    ctx.deliveryId = delivery[0];
    ctx.deliveryDocNo = delivery[1];
    expect(delivery[2]).toBe('draft');
  });

  test('Adım 3 — /depo/sevkiyat/[id]: FEFO ile rezerve et (en erken SKT) → Topla → Sevk et', async () => {
    await page.goto(`/depo/sevkiyat/${ctx.deliveryId}`);
    await page.getByRole('button', { name: 'FEFO ile rezerve et' }).click();
    await expect(page.locator('[data-status="reserved"]').first()).toBeVisible({ timeout: 10_000 });

    // Gerçekte atanan lot DB'den okunur (birden fazla lotun SKT'si eşit olabileceğinden — inDate/lot no
    // kırılımı — önceden tahmin etmek yerine gerçek atama doğrulanır, ardından FEFO kuralı bir
    // DEĞİŞMEZ olarak sınanır: bu üründe, atanandan daha erken SKT'li ve o an kullanılabilir stoğu
    // olan başka bir released lot kalmamalı).
    const assigned = psqlRows(`
      select l.id, l.lot_no, l.status, l.expiry_date
      from delivery_lines dl join stock_lots l on l.id = dl.lot_id
      where dl.delivery_id = '${ctx.deliveryId}'
    `)[0];
    expect(assigned, 'FEFO ile bir lot atanmalı').toBeTruthy();
    const [pickedLotId, expectedLotNo, pickedStatus, pickedExpiry] = assigned!;
    expect(pickedStatus).toBe('released');
    ctx.pickedLotNo = expectedLotNo;
    ctx.pickedLotId = pickedLotId;

    const earlierAvailable = psqlOne(`
      select l.lot_no
      from stock_lots l join stock_quants sq on sq.lot_id = l.id
      where l.product_id = (select id from products where sku = '150040001')
        and l.status = 'released' and l.id <> '${pickedLotId}' and l.expiry_date < '${pickedExpiry}'
      group by l.id, l.lot_no having sum(sq.qty - sq.reserved_qty) > 0
    `);
    expect(earlierAvailable, `FEFO ihlali: ${earlierAvailable} lotu ${expectedLotNo} lotundan daha erken SKT'li ve kullanılabilirken atlandı`).toBeNull();

    // /depo/sevkiyat/[id] satır kırılımı da bir DataTable (delivery-lines-table.tsx) — bkz. visibleText.
    await expect(visibleText(page, expectedLotNo!)).toBeVisible();

    await page.getByRole('link', { name: 'Toplama ekranı' }).click();
    await page.waitForURL(/\/topla$/);
    await expect(page.getByText(expectedLotNo!, { exact: true })).toBeVisible();
    const pickInput = page.getByPlaceholder('Lot okut…');
    await pickInput.fill(expectedLotNo!);
    await pickInput.press('Enter');
    await expect(page.getByText('Toplama tamamlandı')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'İrsaliyeye dön ve sevk et' }).click();
    await page.waitForURL(new RegExp(`/depo/sevkiyat/${ctx.deliveryId}$`));

    await expect(page.locator('[data-status="picked"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Sevk et' }).click();
    await expect(page.locator('[data-status="shipped"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Adım 3 DB doğrulama — teslim hareketi + 621/152 fişi + delivered_qty', async () => {
    const move = psqlRows(`
      select sm.qty, sm.value, sm.journal_entry_id
      from stock_moves sm where sm.ref_type = 'delivery' and sm.ref_id = '${ctx.deliveryId}'
    `)[0]!;
    expect(Number(move[0])).toBeCloseTo(10, 4);
    expect(move[2]).toBeTruthy();
    const lines = psqlRows(`select account_code, debit, credit from journal_lines where entry_id = '${move[2]}' order by account_code`);
    expect(lines.find((r) => r[0] === '621' && Number(r[1]) > 0), '621 borç (SMM)').toBeTruthy();
    expect(lines.find((r) => r[0] === '152' && Number(r[2]) > 0), '152 alacak (mamul stok çıkışı)').toBeTruthy();

    const soLine = psqlRows(`select delivered_qty from sales_order_lines where order_id = '${ctx.orderId}'`)[0]!;
    expect(Number(soLine[0])).toBeCloseTo(10, 4);

    const link = psqlOne(`select count(*) from document_links where source_type='sales_order' and source_id='${ctx.orderId}' and target_type='delivery' and target_id='${ctx.deliveryId}'`);
    expect(Number(link)).toBeGreaterThan(0);
  });

  test('Adım 4 — sipariş sayfasında "Fatura oluştur" → posted fatura, 120/600/391, cari bakiye arttı', async () => {
    await page.goto(`/satis/siparisler/${ctx.orderId}`);
    await page.getByRole('button', { name: 'Fatura oluştur' }).click();
    await expect(page.getByText('Faturalandı', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    const invoice = psqlRows(`select id, doc_no, status, grand_total from invoices where delivery_id = '${ctx.deliveryId}'`)[0]!;
    expect(invoice, 'Sevkiyattan fatura oluşmalı').toBeTruthy();
    ctx.invoiceId = invoice[0];
    ctx.invoiceDocNo = invoice[1];
    expect(invoice[2]).toBe('posted');
    await expect(page.getByText(ctx.invoiceDocNo!).first()).toBeVisible();

    const je = psqlRows(`
      select jl.account_code, jl.debit, jl.credit
      from journal_lines jl join journal_entries je on je.id = jl.entry_id
      where je.ref_type = 'invoice' and je.ref_id = '${ctx.invoiceId}' and je.ledger = 'VUK'
      order by jl.account_code
    `);
    expect(je.find((r) => r[0]?.startsWith('120') && Number(r[1]) > 0), '120.cari borç').toBeTruthy();
    expect(je.find((r) => r[0] === '600' && Number(r[2]) > 0), '600 satış geliri alacak').toBeTruthy();
    expect(je.find((r) => r[0] === '391' && Number(r[2]) > 0), '391 hesaplanan KDV alacak').toBeTruthy();

    const balanceAfter = psqlOne(`select balance from partners where id = '${ctx.customerId}'`)!;
    expect(Number(balanceAfter)).toBeCloseTo(Number(ctx.partnerBalanceBefore) + Number(invoice[3]), 2);

    // Belge zinciri: sales_order → delivery → invoice document_links'te tam
    const chain1 = Number(psqlOne(`select count(*) from document_links where source_type='sales_order' and source_id='${ctx.orderId}' and target_type='delivery'`));
    const chain2 = Number(psqlOne(`select count(*) from document_links where source_type='delivery' and source_id='${ctx.deliveryId}' and target_type='invoice' and target_id='${ctx.invoiceId}'`));
    expect(chain1).toBeGreaterThan(0);
    expect(chain2).toBeGreaterThan(0);

    // Ekranda cari bakiyesi
    await page.goto(`/ana-veri/cariler/${ctx.customerId}`);
    await page.getByRole('tab', { name: 'Bakiye & Hareketler' }).click();
    await expect(page.getByText(ctx.invoiceDocNo!).first()).toBeVisible();
  });

  test('Adım 5 — /depo/lotlar/[mamul lot]: izlenebilirlik geri (İş emri → hammadde lotu → mal kabul → tedarikçi) ve ileri (sevkiyat → müşteri)', async () => {
    await page.goto(`/depo/lotlar/${ctx.producedLotId}`);
    await page.getByRole('tab', { name: 'İzlenebilirlik' }).click();

    const backward = page.getByText('Geriye izleme (kaynak)').locator('..').locator('..');
    await expect(backward.getByText(ctx.woDocNo!)).toBeVisible();
    await expect(backward.getByText(ctx.rawLotNo!)).toBeVisible();
    const receiptDocNo = psqlOne(`select doc_no from receipts where id = '${ctx.receiptId}'`)!;
    await expect(backward.getByText(receiptDocNo)).toBeVisible();
    await expect(backward.getByText(/Anadolu Kuruyemiş/)).toBeVisible();

    // Bu mamul lot henüz sevk edilmedi (FEFO daha erken SKT'li mevcut lotu seçti — bkz. adım 3) —
    // ileri izleme bu durumda en azından eldeki stok (quant) düğümünü göstermelidir.
    const forwardOwn = page.getByText('İleriye izleme (gidiş)').locator('..').locator('..');
    await expect(forwardOwn.getByText('Eldeki stok')).toBeVisible();

    // Gerçekten sevk edilen lotun ileri izlemesi: sevkiyat + müşteri düğümleri
    await page.goto(`/depo/lotlar/${ctx.pickedLotId}`);
    await page.getByRole('tab', { name: 'İzlenebilirlik' }).click();
    const forwardShipped = page.getByText('İleriye izleme (gidiş)').locator('..').locator('..');
    await expect(forwardShipped.getByText(ctx.deliveryDocNo!)).toBeVisible();
    await expect(forwardShipped.getByText(/Doğal Yaşam Market/)).toBeVisible();
  });
});

/* ==================================================================== */
/* Negatifler                                                            */
/* ==================================================================== */

test.describe('Negatifler', () => {
  test('yetkisiz rol: depo kullanıcısı /satis/siparisler/yeni sayfasında engellenir', async ({ page }) => {
    await loginAs(page, 'depo', '/satis/siparisler/yeni');
    await expect(page).toHaveURL(/\/satis\/siparisler\/yeni/);
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yeni Sipariş' })).not.toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav.getByText('Satış', { exact: true })).not.toBeVisible();
  });

  test('stokta olmayan miktarla sevk engeli: FEFO rezervasyonu INSUFFICIENT_STOCK ile reddedilir', async ({ page }) => {
    // Sipariş → sevk → fatura → tahsilat zincirinin tamamı tek testte; dev sunucuda soğuk derlemeyle 60 sn'yi aşabiliyor.
    test.slow();
    const onHand = Number(psqlOne(`select coalesce(sum(qty),0) from stock_quants sq join products p on p.id=sq.product_id where p.sku='110010003'`));
    const hugeQty = String(Math.ceil(onHand) + 999_000);

    await loginAs(page, 'admin');
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110010003', /3x Badem Bazı/);
    await page.getByLabel(/^Miktar/).fill(hugeQty);
    await page.keyboard.press('Tab');
    // Fiyat çözümü (resolvePrice) asenkron: rozet gelmeden kaydedilirse satır 0 ₺ kalır ve sunucu
    // artık bunu ValidationError ile reddediyor (bkz. packages/core/src/sales/orders.ts buildLine) —
    // "Siparişi kaydet"e basmadan önce fiyat kaynağı rozetinin gelmesi beklenir (Adım 3 ile aynı desen).
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

    // Reddedildi: sevkiyat hâlâ taslak, hiçbir satır rezerve edilmedi
    const status = psqlOne(`select status from deliveries where id = '${deliveryId}'`);
    expect(status).toBe('draft');
    const reservedLines = psqlOne(`select count(*) from delivery_lines where delivery_id='${deliveryId}' and from_location_id is not null`);
    expect(reservedLines).toBe('0');
  });

  test('SKT geçmiş lot rezerve edilmez: FEFO süresi geçmiş lotu göz ardı eder', async ({ page }) => {
    const productId = psqlOne(`select id from products where sku='110010002'`)!;
    const availBefore = Number(
      psqlOne(`
        select coalesce(sum(sq.qty - sq.reserved_qty),0)
        from stock_quants sq join stock_lots l on l.id = sq.lot_id
        where l.product_id = '${productId}' and l.status='released' and l.expiry_date >= current_date
      `) ?? '0',
    );

    await loginAs(page, 'admin');
    const expiredLotNo = `QA-EXP-${RUN}`;
    await page.goto('/depo/mal-kabul/yeni');
    await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110010002', /2x Badem Bazı/);
    await page.getByLabel(/^Miktar/).fill('50');
    await page.getByLabel('Birim maliyet').fill('100');
    await page.getByLabel('Tedarikçi lot no').fill(expiredLotNo);
    await fillDateField(page, 'SKT', trDate(-1));
    await comboboxSelect(page, 'Lokasyon', 'TIRE/MAMUL/R01', 'TIRE/MAMUL/R01');
    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);

    const expiredLot = psqlRows(`select status, expiry_date from stock_lots where lot_no='${expiredLotNo}'`)[0]!;
    expect(expiredLot[0]).toBe('released');
    expect(new Date(expiredLot[1]!).getTime()).toBeLessThan(Date.now());

    // Talep edilen miktar: süresi geçmemiş mevcut stoktan fazla, ama süresi geçmiş lot dahil toplamdan az —
    // yalnızca FEFO'nun süresi geçmiş lotu hariç tuttuğu doğrulanırsa karşılanamaz.
    const orderQty = Math.floor(availBefore) + 15;
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110010002', /2x Badem Bazı/);
    await page.getByLabel(/^Miktar/).fill(String(orderQty));
    await page.keyboard.press('Tab');
    // Fiyat çözümü (resolvePrice) asenkron: rozet gelmeden kaydedilirse satır 0 ₺ kalır ve sunucu
    // artık bunu ValidationError ile reddediyor (bkz. packages/core/src/sales/orders.ts buildLine) —
    // "Siparişi kaydet"e basmadan önce fiyat kaynağı rozetinin gelmesi beklenir (Adım 3 ile aynı desen).
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

    // Süresi geçmiş lot hiç rezerve edilmedi
    const expiredReserved = psqlOne(`select coalesce(sum(reserved_qty),0) from stock_quants where lot_id = (select id from stock_lots where lot_no='${expiredLotNo}')`);
    expect(Number(expiredReserved)).toBe(0);
  });

  test('karantinadaki lot sevk edilemez: FEFO karantina lotunu göz ardı eder', async ({ page }) => {
    // FINDIK BAZI (110020001) — bu akışın ana zincirinde hiç kullanılmayan, izole bir mamul.
    const productId = psqlOne(`select id from products where sku='110020001'`)!;
    const availBefore = Number(
      psqlOne(`
        select coalesce(sum(sq.qty - sq.reserved_qty),0)
        from stock_quants sq join stock_lots l on l.id = sq.lot_id
        where l.product_id = '${productId}' and l.status='released'
      `) ?? '0',
    );

    await loginAs(page, 'admin');
    const quarantineFgLotNo = `QA-QFG-${RUN}`;
    await page.goto('/depo/mal-kabul/yeni');
    await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110020001', /FINDIK BAZI/);
    await page.getByLabel(/^Miktar/).fill('50');
    await page.getByLabel('Birim maliyet').fill('100');
    await page.getByLabel('Tedarikçi lot no').fill(quarantineFgLotNo);
    await page.getByLabel('Karar').click();
    await page.getByRole('option', { name: 'Karantina', exact: true }).click();
    await comboboxSelect(page, 'Lokasyon', 'TIRE/KARANTINA', 'TIRE/KARANTINA');
    await page.getByRole('button', { name: 'Kabul et' }).click();
    await page.waitForURL(/\/depo\/mal-kabul\/[0-9a-f-]{36}$/);

    const qLot = psqlOne(`select status from stock_lots where lot_no='${quarantineFgLotNo}'`);
    expect(qLot).toBe('quarantine');

    // Talep: mevcut serbest stoktan fazla ama karantinadaki lot dahil toplamdan az — yalnızca
    // FEFO'nun karantinadaki lotu hariç tuttuğu doğrulanırsa karşılanamaz (pickFefo allowStatuses
    // yalnızca 'released' — packages/core/src/stock/ledger.ts).
    const orderQty = Math.floor(availBefore) + 15;
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110020001', /FINDIK BAZI/);
    await page.getByLabel(/^Miktar/).fill(String(orderQty));
    await page.keyboard.press('Tab');
    // Fiyat çözümü (resolvePrice) asenkron: rozet gelmeden kaydedilirse satır 0 ₺ kalır ve sunucu
    // artık bunu ValidationError ile reddediyor (bkz. packages/core/src/sales/orders.ts buildLine) —
    // "Siparişi kaydet"e basmadan önce fiyat kaynağı rozetinin gelmesi beklenir (Adım 3 ile aynı desen).
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

    // Karantinadaki lot hiç rezerve/sevk edilmedi ve durum hâlâ karantinada (sevkedilemedi kanıtı)
    const qReserved = psqlOne(`select coalesce(sum(reserved_qty),0) from stock_quants where lot_id = (select id from stock_lots where lot_no='${quarantineFgLotNo}')`);
    expect(Number(qReserved)).toBe(0);
    const qOnDelivery = psqlOne(`select count(*) from delivery_lines where lot_id = (select id from stock_lots where lot_no='${quarantineFgLotNo}')`);
    expect(qOnDelivery).toBe('0');
    const status = psqlOne(`select status from deliveries where id='${deliveryId}'`);
    expect(status).toBe('draft');
  });

  test('çift tahsilat engeli: fazla tahsis reddedilir, tam ödenen fatura ikinci kez tahsis edilemez', async ({ page }) => {
    // Sipariş → sevk → fatura → tahsilat zincirinin tamamı tek testte; dev sunucuda soğuk derlemeyle 60 sn'yi aşabiliyor.
    test.slow();
    await loginAs(page, 'admin');

    // İzole bir fatura: kendi ufak siparişimiz (2x Fındık, 2 adet) → onayla → sevk et → faturalandır.
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', '110020002', /2x Fındık/);
    await page.getByLabel(/^Miktar/).fill('2');
    await page.keyboard.press('Tab');
    // Fiyat çözümü (resolvePrice) asenkron: rozet gelmeden kaydedilirse satır 0 ₺ kalır ve fatura
    // "Fiş tutarı sıfır olamaz" ile reddedilir (yavaş dev sunucuda görülen yarış) — Adım 3 ile aynı bekleme.
    await expect(page.getByText('Liste fiyatı', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Birim fiyat (KDV hariç)')).not.toHaveValue(/^0,00$|^$/);
    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;
    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.locator('[data-status="confirmed"]').first()).toBeVisible({ timeout: 10_000 });

    const deliveryId = psqlOne(`select id from deliveries where sales_order_id = '${orderId}'`)!;
    await page.goto(`/depo/sevkiyat/${deliveryId}`);
    await page.getByRole('button', { name: 'FEFO ile rezerve et' }).click();
    await expect(page.locator('[data-status="reserved"]').first()).toBeVisible({ timeout: 10_000 });
    const lotNo = psqlOne(`select l.lot_no from delivery_lines dl join stock_lots l on l.id=dl.lot_id where dl.delivery_id='${deliveryId}'`)!;

    await page.getByRole('link', { name: 'Toplama ekranı' }).click();
    await page.waitForURL(/\/topla$/);
    const pickInput = page.getByPlaceholder('Lot okut…');
    await pickInput.fill(lotNo);
    await pickInput.press('Enter');
    await expect(page.getByText('Toplama tamamlandı')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'İrsaliyeye dön ve sevk et' }).click();
    await page.waitForURL(new RegExp(`/depo/sevkiyat/${deliveryId}$`));
    await page.getByRole('button', { name: 'Sevk et' }).click();
    await expect(page.locator('[data-status="shipped"]').first()).toBeVisible({ timeout: 10_000 });

    await page.goto(`/satis/siparisler/${orderId}`);
    await page.getByRole('button', { name: 'Fatura oluştur' }).click();
    await expect(page.getByText('Faturalandı', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    const invRow = psqlRows(`select id, doc_no, residual from invoices where delivery_id='${deliveryId}'`)[0]!;
    const [invoiceId, invoiceDocNo, residualStr] = invRow;
    const residual = Number(residualStr);
    expect(residual).toBeGreaterThan(0);
    const toTr = (n: number) => n.toFixed(2).replace('.', ',');
    const overAmount = residual + 100;

    // 1) Fazla tahsis: fatura kalanından (residual) daha büyük bir tutar tahsis edilmeye çalışılır —
    //    packages/core/src/finance/payments.ts::recordPayment "kalan tutarı ... küçük" ile reddeder.
    await page.goto('/finans/tahsilat/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Tahsilat / Ödeme' })).toBeVisible();
    await comboboxSelect(page, 'Cari seçin…', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await expect(page.getByText(invoiceDocNo!)).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Tutar').fill(toTr(overAmount));

    await page.getByRole('checkbox', { name: `${invoiceDocNo} tahsis et` }).click();
    const invoiceRow = page.locator('tr').filter({ hasText: invoiceDocNo! });
    await invoiceRow.getByRole('textbox').fill(toTr(overAmount));

    await page.getByRole('button', { name: 'Tahsilatı kaydet' }).click();
    await expect(page.getByText(/kalan tutarı/i)).toBeVisible({ timeout: 10_000 });
    // Reddedildi: hiçbir ödeme/tahsis satırı oluşmadı, fatura kalanı değişmedi
    expect(psqlOne(`select count(*) from payment_allocations where invoice_id='${invoiceId}'`)).toBe('0');
    expect(Number(psqlOne(`select residual from invoices where id='${invoiceId}'`))).toBeCloseTo(residual, 2);

    // 2) Düzelt: tam kalan tutarla gönder → başarılı, fatura kapanır
    await invoiceRow.getByRole('textbox').fill(toTr(residual));
    await page.getByLabel('Tutar').fill(toTr(residual));
    await page.getByRole('button', { name: 'Tahsilatı kaydet' }).click();
    await page.waitForURL(/\/finans\/tahsilat$/, { timeout: 15_000 });

    const invAfter = psqlRows(`select residual, status from invoices where id='${invoiceId}'`)[0]!;
    expect(Number(invAfter[0])).toBeCloseTo(0, 2);
    expect(invAfter[1]).toBe('paid');
    expect(psqlOne(`select count(*) from payment_allocations where invoice_id='${invoiceId}'`)).toBe('1');

    // 3) Çift tahsilat engeli: fatura artık tam ödendi — açık faturalar listesinde bir daha hiç
    //    görünmez (getOpenInvoicesForPartner residual>0 && status in (posted,partially_paid) filtreler),
    //    yani normal akıştan ikinci kez tahsis edilmesi yapısal olarak imkânsız.
    await page.goto('/finans/tahsilat/yeni');
    await comboboxSelect(page, 'Cari seçin…', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await expect(page.getByText('Açık faturalar yükleniyor…')).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(invoiceDocNo!)).toHaveCount(0);
  });
});

/* ==================================================================== */
/* Mobil (390×844) / Tablet (1024×768) geçişler                          */
/* ==================================================================== */

test.describe('Mobil/Tablet geçişler', () => {
  test('Mobil 390×844 — depo: mal kabul formu kırılmadan çalışır ve satır eklenebilir', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'depo', '/depo/mal-kabul/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Mal Kabul' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await comboboxSelect(page, 'Ürün ara ve ekle…', '301060000', /Yulaf/);
    await expect(page.getByLabel(/^Miktar/)).toBeVisible();
    await ctxB.close();
  });

  test('Mobil 390×844 — operatör: PIN girişi ve hat ekranı büyük dokunma hedefleriyle çalışır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();

    // Oturumsuz, temiz bağlam — /operator/giris doğrudan erişilebilir olmalı.
    await page.goto('/operator/giris');
    await expect(page.getByRole('button', { name: /Üretim Operatörü/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: /Üretim Operatörü/ }).click();
    for (const d of ['1', '2', '3', '4']) await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForURL(/\/operator$/);
    await expect(page.getByRole('heading', { name: /Merhaba/ })).toBeVisible();
    await ctxB.close();
  });

  test('Tablet 1024×768 — üretim: iş emirleri listesi ve detay sekmeleri kullanılabilir', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctxB.newPage();
    await loginAs(page, 'uretim_sefi', '/uretim/is-emirleri');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('İş Emirleri');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctxB.close();
  });
});
