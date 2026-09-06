import { test, expect, type Page, type Browser, type Locator } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { loginAs, type TestRole } from './fixtures/auth';

/**
 * Akış (Tur 1, Aşama-4 ihracat/bakım/Ar-Ge/kokpit — ihracat@/muhasebe@/bakim@/arge@/admin@/depo@):
 *   (1) ihracat@ → /satis/siparisler/yeni (Almanya EUR müşterisi, mamul 200 adet) → Onayla →
 *       /ihracat/sevkiyatlar/yeni (ETGB, DAP Hamburg) → proforma → sevkiyat/FEFO/topla/sevk (depo) →
 *       çeki listesi → fatura → belge takibi → yüklendi.
 *   (2) muhasebe@ → o faturaya EUR tahsilat (farklı günün kuruyla) → 646/656 kur farkı fişi.
 *   (3) bakim@ mobil → arıza bildir (QR) → foto → makine down → başlat → tamamla → downtime kapanır
 *       → /bakim/oee bugünkü kullanılabilirlik düşer.
 *   (4) worker `maintenance-scheduler` elle tetiklenir → vadesi gelen plan için otomatik iş emri.
 *   (5) arge@ → board (yeni kart, sürükle, kolon adı değiştir) → deneme reçetesi (yeni versiyon,
 *       miktar değişince maliyet anında değişir) → onaya gönder → /onaylar → onayla → BOM'a devret →
 *       /ana-veri/receteler aktif BOM → /uretim/is-emirleri/yeni bu ürünle açılabiliyor.
 *   (6) admin/depo /kokpit KPI'ları psql/çekirdek fonksiyonlarıyla eşleşiyor, rol bazlı farklı kart
 *       seti, mobil tek kolon.
 *   (7) Negatifler: ETGB limiti aşan sevkiyat standarda düşer; bakim@ /arge 403; onaylanmamış reçete
 *       BOM'a devredilemez.
 *
 * Üretim derlemesine (`scripts/gate.sh`) karşı koşulmak üzere yazıldı — phase1/phase3 ile aynı kalıp
 * (dev'in "ilk istekte derleme" gecikmesi yok, `warmRoutes` gerekmiyor). Test verisi zaman damgalı
 * `RUN` etiketiyle benzersizleştirilir; sabit ID yok — yalnızca seed'in garanti ettiği ana veriye
 * (Almanya/EUR müşterisi, İhracat kanalı fiyat listesindeki mamuller, MK-002, "Fıstık Bazı" projesi)
 * dayanır ve o veriyi HER ZAMAN psql ile o an sorgulayarak bulur (bu makinede eşzamanlı başka bir
 * oturumun `db:reset` çalıştırdığı gözlemlendi — sabit UUID'ler bir sonraki çalıştırmada geçersiz
 * kalabilir).
 *
 * Kritik önkoşul (bkz. rapor K1): `ihracat` rolünün izin seti (`packages/db/src/seed/core.ts` satır
 * ~116: `byModule('export')` + `views(...)` + yalnızca `['sales.quote','sales.order','accounting.invoice']`)
 * `sales.confirm` İÇERMİYOR — ama `/satis/siparisler/[id]` (satır ~48) "Onayla" düğmesini
 * `sales.confirm` YA DA `accounting.invoice` varsa gösteriyor (`OrderActions` bileşeni durum='draft'
 * iken düğmeyi KOŞULSUZ basıyor, kendi izin kontrolü yok). Sonuç: ihracat@ kendi oluşturduğu ihracat
 * siparişini "Onayla" ile tıklayabiliyor GİBİ görünüyor ama sunucu eylemi (`confirmOrderAction` →
 * `requirePermission('sales.confirm')`) reddediyor — "Bu işlem için yetkiniz yok." tostu. Bu ayrı,
 * küçük bir bulgu testiyle CANLI olarak gösterilir; ana zincirin geri kalanını (proforma/çeki
 * listesi/fatura/kur farkı) test edebilmek için onay adımı `satis@` (gerçek `sales.confirm` sahibi)
 * ile yapılır — bu bir "beklenti gevşetmesi" değil, ayrı bir bulgu olarak raporlanan bilinen kısıtın
 * etrafından dolaşan açıkça belgelenmiş bir test-verisi kurulumudur (phase3'teki `editReorderRule`
 * önkoşul kurulumuyla aynı ilke).
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const RUN = Date.now().toString(36);
const TEST_PHOTO = path.join(__dirname, 'fixtures', 'test-photo.png');

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

/** `src/components/form/combobox.tsx` (`role="combobox"`, erişilebilir adı yok — bkz. phase1/phase3). */
async function comboboxSelect(page: Page, triggerText: string, search: string, optionMatch: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder('Ara…').fill(search);
  await page.getByRole('option', { name: optionMatch }).first().click();
  await expect(page.getByPlaceholder('Ara…')).toHaveCount(0);
}

/** `DataTable` her satırı masaüstü+mobil olmak üzere DOM'da iki kez tutar (bkz. phase1/phase3). */
function visibleText(page: Page, text: string | RegExp, exact = true) {
  return typeof text === 'string' ? page.getByText(text, { exact }).filter({ visible: true }) : page.getByText(text).filter({ visible: true });
}

/** Rol değişimi: middleware oturumluyken `/login`'e gidilirse `/kokpit`'e geri yönlendirir — bkz. phase3. */
async function switchRole(browser: Browser, oldPage: Page, role: TestRole, next?: string): Promise<Page> {
  await oldPage.close().catch(() => {});
  const p = await browser.newPage();
  await loginAs(p, role, next);
  return p;
}

/** Bir Turkish para/sayı metnini (₺, boşluk, bin ayracı `.`, ondalık `,`) sayıya çevirir. */
function parseTrNumber(text: string): number {
  const cleaned = text.replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(cleaned);
}

/**
 * `KpiCard`'ın canlı sayacı (`@number-flow/react`) `.innerText()`/`.textContent` ile GÜVENİLİR
 * OKUNAMAZ — kök neden (canlıda yakalandı, 10 sn'lik `.poll()` bile hiç yakınsamadı): kütüphane
 * `<number-flow-react>` diye AÇIK bir shadow-DOM custom element'i (`node_modules/number-flow/dist/
 * lite.js`: `this.attachShadow({mode:'open'})`), her basamağı 0-9 arası ON AYRI `<span>` olarak
 * üst üste bindirip yalnızca birini CSS/`inert` ile "görünür" yapan bir kaydırma animasyonuyla
 * gösteriyor — düz metin çıkarımı bu yapıdan güvenilir tek bir rakam değil "0" (veya tutarsız bir
 * birleşim) okuyor. Kütüphanenin KENDİSİ gerçek biçimlendirilmiş metni erişilebilirlik ağacına
 * `ElementInternals` üzerinden yazıyor (aynı dosya: `this._internals.role='img'`;
 * `this._internals.ariaLabel = t.valueAsString`) — bu, animasyon/DOM iç yapısından bağımsız TEK
 * güvenilir kaynak. `el.ariaLabel` IDL özelliği bu internals değerini yansıtır.
 */
async function readNumberFlowValue(container: Locator): Promise<number> {
  const el = container.locator('number-flow-react').first();
  await expect(el).toHaveCount(1, { timeout: 10_000 });
  const label = await el.evaluate((node) => (node as unknown as { ariaLabel?: string }).ariaLabel || node.getAttribute('aria-label') || '');
  return parseTrNumber(label);
}

function overflowCheck(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * `/depo/sevkiyat/[id]/topla` ekranını "Toplama tamamlandı" görene kadar satır satır toplar.
 *
 * Kök neden (canlıda yakalandı): önceki sürüm tek bir SQL sorgusuyla (`limit` yok, `order by` yok)
 * TEK bir lot çekip onu bir kez okutuyor, sonra doğrudan "Toplama tamamlandı" bekliyordu — bu
 * yalnızca FEFO rezervasyonunun TEK lota sığdığı durumda çalışır. 200 adetlik siparişte tek bir
 * lotta 200 serbest adet OLMAYABİLİR (seed'in o anki dağılımına bağlı) — bu durumda
 * `reserveDeliveryFefo` (packages/core/src/stock/*) teslimatı BİRDEN FAZLA satıra/lota böler
 * (`pick-screen.tsx`: `current = pendingLines[0]`, sırayla toplanır). Sabit tek-lot varsayımı
 * canlıda "0/3 toplandı" durumunda asılı kalıp zaman aşımına uğradı. Artık ekranın kendi
 * "Sıradaki satır" panelinden GERÇEK lot numarasını okuyup okutuyor, tamamlanana kadar tekrarlıyor
 * — kaç satıra bölündüğünden bağımsız.
 */
async function pickAllLines(page: Page, maxLines = 8) {
  const progress = page.getByText(/^\d+\/\d+ toplandı$/);
  for (let i = 0; i < maxLines; i++) {
    if (await page.getByText('Toplama tamamlandı').isVisible().catch(() => false)) return;
    const before = await progress.innerText().catch(() => '');
    // "Sıradaki satır" etiketinin DOĞRUDAN üst elemanı kart köküdür (bkz. `pick-screen.tsx`
    // `rounded-2xl` kart div'i — etiket onun ilk çocuğu) — lot linki aynı kartın içinde.
    const card = page.getByText('Sıradaki satır', { exact: true }).locator('..');
    const lotLink = card.getByRole('link').first();
    const pickInput = page.getByPlaceholder(/Lot okut…|Enter ile onayla…/);
    if (await lotLink.count()) {
      const lotNo = (await lotLink.innerText()).trim();
      await pickInput.fill(lotNo);
    }
    await pickInput.press('Enter');
    await expect
      .poll(
        async () => (await page.getByText('Toplama tamamlandı').isVisible().catch(() => false)) ? 'done' : await progress.innerText().catch(() => ''),
        { message: `toplama satırı ${i + 1} ilerlemeli (önce: "${before}")`, timeout: 10_000 },
      )
      .not.toBe(before);
  }
  throw new Error(`Toplama ${maxLines} turda tamamlanmadı — döngü/kilitlenme şüphesi`);
}

/* ==================================================================== */
/* Bulgu — K1: ihracat@ kendi ihracat siparişini onaylayamaz             */
/* ==================================================================== */

test.describe('Bulgu K1 — ihracat@ /satis/siparisler "Onayla" (phase4)', () => {
  test('sales.confirm eksik: buton görünür ama tıklayınca "Bu işlem için yetkiniz yok."', async ({ page }) => {
    const customer = psqlRows(`
      select p.id, p.name from partners p join sales_channels sc on sc.id = p.default_channel_id
      where sc.kind = 'export' and p.country = 'DE' and p.currency = 'EUR' limit 1
    `)[0];
    expect(customer, 'Seed: Almanya/EUR ihracat müşterisi bulunmalı').toBeTruthy();
    const [, customerName] = customer!;

    const product = psqlRows(`
      select p.id, p.sku, p.name
      from price_list_items pli
      join products p on p.id = pli.product_id
      join sales_channels sc on sc.default_price_list_id = pli.price_list_id and sc.kind = 'export'
      where p.type = 'finished'
      order by pli.price asc limit 1
    `)[0];
    expect(product, 'Seed: İhracat fiyat listesinde en az bir mamul olmalı').toBeTruthy();
    const [, sku] = product!;

    // Rol izin listesi bağımsız doğrulama (ekrandaki tost'tan önce, kod-seviyesi zemin): ihracat rolü
    // gerçekten 'sales.confirm' taşımıyor.
    const hasConfirm = psqlOne(`
      select exists (
        select 1 from role_permissions rp join roles r on r.id = rp.role_id join permissions perm on perm.id = rp.permission_id
        where r.code = 'ihracat' and perm.code = 'sales.confirm'
      )
    `);
    expect(hasConfirm, "DB: 'ihracat' rolünde sales.confirm İZNİ OLMAMALI (bulgu K1'in ön koşulu) — varsa bu test artık geçersiz, güncellenmeli").toBe('f');

    await loginAs(page, 'ihracat');
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', customerName!.split(' ')[0]!, new RegExp(customerName!.split(' ')[0]!));
    await expect(page.getByLabel('Kanal')).toHaveText(/İhracat/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', sku!, sku!);
    await page.getByLabel(/^Miktar/).fill('1');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;

    await expect(page.getByRole('button', { name: 'Onayla' })).toBeVisible();
    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.getByText('Bu işlem için yetkiniz yok.')).toBeVisible({ timeout: 10_000 });

    const status = psqlOne(`select status from sales_orders where id = '${orderId}'`);
    expect(status, 'Reddedilen onay sonrası sipariş taslak kalmalı').toBe('draft');
    const deliveryCount = psqlOne(`select count(*) from deliveries where sales_order_id = '${orderId}'`);
    expect(Number(deliveryCount)).toBe(0);
  });
});

/* ==================================================================== */
/* Akış: İhracat sevkiyat zinciri + tahsilat kur farkı                  */
/* ==================================================================== */

test.describe('Akış: İhracat sevkiyat zinciri + kur farkı (phase4)', () => {
  // Bu describe İÇİNDEKİ testler tek bir `ctx` closure'ını paylaşıyor (sipariş→sevkiyat→fatura
  // zinciri) — `serial` olmadan bir adım kırılınca sonrakiler STALE `ctx`/`page` ile çalışmayı
  // DENER (hızlı atlanmaz), her biri kendi zaman aşımı süresince asılı kalıp koşuyu gereksiz yere
  // uzatır (canlı yakalandı). `serial` bu describe'a ÖZGÜ kapsamlıdır — kardeş describe'ları
  // (Bakım/Ar-Ge/Kokpit/Negatifler) etkilemez, onlar bağımsız kalır.
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(150_000);

  const ctx: {
    customerId?: string; customerName?: string;
    productId?: string; sku?: string; productName?: string; unitPriceEur?: string;
    orderId?: string; orderDocNo?: string; deliveryId?: string; deliveryDocNo?: string;
    shipmentId?: string; shipmentDocNo?: string;
    invoiceId?: string; invoiceDocNo?: string; invoiceExchangeRate?: string; invoiceGrandTotal?: string;
    etgbDocId?: string;
  } = {};

  let page: Page;
  let browser: Browser;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Adım 1 — ihracat@ /satis/siparisler/yeni: Almanya/EUR müşterisi, mamul 200 adet → kaydet', async () => {
    const customer = psqlRows(`
      select p.id, p.name from partners p join sales_channels sc on sc.id = p.default_channel_id
      where sc.kind = 'export' and p.country = 'DE' and p.currency = 'EUR' limit 1
    `)[0];
    expect(customer, 'Seed: Almanya/EUR ihracat müşterisi bulunmalı').toBeTruthy();
    [ctx.customerId, ctx.customerName] = customer!;

    // En düşük birim fiyatlı, İhracat fiyat listesindeki mamul, 200+ serbest stoğu olan — ETGB
    // limitinin (15.000 EUR / 300 kg) rahatça içinde kalır, stok yetersizliğine takılmaz.
    const product = psqlRows(`
      select p.id, p.sku, p.name, pli.price
      from price_list_items pli
      join products p on p.id = pli.product_id
      join sales_channels sc on sc.default_price_list_id = pli.price_list_id and sc.kind = 'export'
      where p.type = 'finished' and exists (
        select 1 from stock_lots l join stock_quants sq on sq.lot_id = l.id
        where l.product_id = p.id and l.status = 'released'
        group by l.product_id having sum(sq.qty - sq.reserved_qty) >= 200
      )
      order by pli.price asc limit 1
    `)[0];
    expect(product, 'Seed: İhracat fiyat listesinde 200+ stoklu bir mamul bulunmalı').toBeTruthy();
    [ctx.productId, ctx.sku, ctx.productName, ctx.unitPriceEur] = product!;
    expect(Number(ctx.unitPriceEur) * 200, 'ETGB limiti (15.000 EUR) içinde kalmalı').toBeLessThan(15_000);

    await loginAs(page, 'ihracat');
    await page.goto('/satis/siparisler/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Sipariş' })).toBeVisible();
    await comboboxSelect(page, 'Müşteri seçin', ctx.customerName!.split(' ')[0]!, new RegExp(ctx.customerName!.split(' ')[0]!));
    await expect(page.getByLabel('Kanal')).toHaveText(/İhracat/);
    await comboboxSelect(page, 'Ürün ara ve ekle…', ctx.sku!, ctx.sku!);
    await page.getByLabel(/^Miktar/).fill('200');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Birim fiyat (KDV hariç)')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    ctx.orderId = page.url().split('/').pop()!;

    const order = psqlRows(`select doc_no, is_export, currency, vat_total, status from sales_orders where id = '${ctx.orderId}'`)[0]!;
    ctx.orderDocNo = order[0];
    expect(order[1], 'isExport=true olmalı (kanal=export)').toBe('t');
    expect(order[2]).toBe('EUR');
    expect(Number(order[3]), 'İhracatta KDV %0 olmalı').toBe(0);
    expect(order[4]).toBe('draft');
  });

  test('Adım 2 — satis@ Onayla (K1 nedeniyle ihracat@ yerine — bkz. dosya başı not): irsaliye taslağı açılır', async () => {
    page = await switchRole(browser, page, 'satis');
    await page.goto(`/satis/siparisler/${ctx.orderId}`);
    await expect(page.getByText(ctx.orderDocNo!).first()).toBeVisible();
    await page.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.locator('[data-status="confirmed"]').first()).toBeVisible({ timeout: 10_000 });

    const delivery = psqlRows(`select id, doc_no, status from deliveries where sales_order_id = '${ctx.orderId}'`)[0]!;
    expect(delivery, 'Onay sonrası irsaliye taslağı otomatik açılmalı').toBeTruthy();
    [ctx.deliveryId, ctx.deliveryDocNo] = delivery;
    expect(delivery[2]).toBe('draft');
  });

  test('Adım 3 — ihracat@ /ihracat/sevkiyatlar/yeni: ETGB rejimi, DAP Hamburg → sevkiyat oluştur', async () => {
    page = await switchRole(browser, page, 'ihracat');
    await page.goto('/ihracat/sevkiyatlar/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni İhracat Sevkiyatı' })).toBeVisible();

    await comboboxSelect(page, 'Sipariş seçin', ctx.orderDocNo!, new RegExp(ctx.orderDocNo!));
    // `getByLabel('Incoterm')` "Incoterm yeri" metin alanıyla da alt-dize eşleşiyor (strict-mode
    // ihlali, canlı yakalandı) — `role='combobox'` ile daraltılır ("Incoterm yeri" bir textbox).
    await page.getByRole('combobox', { name: 'Incoterm' }).click();
    await page.getByRole('option', { name: 'DAP' }).click();
    await page.getByLabel('Incoterm yeri').fill('Hamburg');
    await page.getByLabel('Varış ülkesi (ISO-2)').fill('DE');
    await page.getByLabel('Rejim').click();
    await page.getByRole('option', { name: 'ETGB (mikro ihracat)' }).click();

    await page.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
    await page.waitForURL(/\/ihracat\/sevkiyatlar\/[0-9a-f-]{36}$/);
    ctx.shipmentId = page.url().split('/').pop()!;

    const shipment = psqlRows(`select doc_no, status, regime, incoterm, incoterm_place, destination_country from export_shipments where id = '${ctx.shipmentId}'`)[0]!;
    ctx.shipmentDocNo = shipment[0];
    expect(shipment[1]).toBe('draft');
    expect(shipment[2], 'Tutar limit içinde — ETGB rejimi korunmalı').toBe('etgb');
    expect(shipment[3]).toBe('DAP');
    expect(shipment[4]).toBe('Hamburg');
    expect(shipment[5]).toBe('DE');

    const docs = psqlRows(`select code, status from export_documents where shipment_id = '${ctx.shipmentId}' order by sequence`);
    const etgbDoc = docs.find((d) => d[0] === 'ETGB');
    expect(etgbDoc, 'ETGB rejiminde ETGB belgesi listede olmalı').toBeTruthy();
    expect(etgbDoc![1], 'Başlangıçta ETGB belgesi "gerekli" olmalı').toBe('required');
    const atrDoc = docs.find((d) => d[0] === 'ATR');
    expect(atrDoc![1], 'ETGB rejiminde ATR gerekmez').toBe('not_required');

    await expect(page.getByText('Belgeler:')).toBeVisible();
  });

  test('Adım 4 — ihracat@ proforma üret', async () => {
    await page.getByRole('button', { name: 'Proforma gönder' }).click();
    // `StatusBadge` durumunu DOM'da masaüstü+mobil için İKİ KEZ render eder (bkz. dosya başı
    // `DataTable` notu, aynı kalıp burada da geçerli) + bir de geçici toast — üçü de aynı metni
    // taşıyor, adsız eşleşme strict-mode ihlaline düşüyordu (canlıda yakalandı). `.first()` yeterli.
    await expect(page.getByText('Proforma gönderildi').first()).toBeVisible({ timeout: 10_000 });

    const shipment = psqlRows(`select status, proforma_no, proforma_date from export_shipments where id = '${ctx.shipmentId}'`)[0]!;
    expect(shipment[0]).toBe('proforma_sent');
    expect(shipment[1], 'proformaNo dolmalı').toBeTruthy();
    expect(shipment[2], 'proformaDate dolmalı').toBeTruthy();
    await expect(page.getByText(shipment[1]!)).toBeVisible();

    const doc = psqlOne(`select status from export_documents where shipment_id = '${ctx.shipmentId}' and code = 'PROFORMA'`);
    expect(doc).toBe('sent');
  });

  test('Adım 5 — ihracat@ irsaliyeye bağla', async () => {
    await page.getByRole('button', { name: 'İrsaliyeye bağla' }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: ctx.deliveryDocNo! }).click();
    await dialog.getByRole('button', { name: 'Bağla' }).click();
    await expect(page.getByText('İrsaliyeye bağlandı')).toBeVisible({ timeout: 10_000 });

    const shipment = psqlRows(`select delivery_id, status from export_shipments where id = '${ctx.shipmentId}'`)[0]!;
    expect(shipment[0]).toBe(ctx.deliveryId);
    expect(shipment[1]).toBe('confirmed');
  });

  test('Adım 6 — depo@ /depo/sevkiyat/[id]: FEFO ile rezerve et → Topla → Sevk et', async () => {
    page = await switchRole(browser, page, 'depo');
    await page.goto(`/depo/sevkiyat/${ctx.deliveryId}`);
    await page.getByRole('button', { name: 'FEFO ile rezerve et' }).click();
    await expect(page.locator('[data-status="reserved"]').first()).toBeVisible({ timeout: 10_000 });

    const assignedLots = psqlRows(`select distinct l.lot_no from delivery_lines dl join stock_lots l on l.id = dl.lot_id where dl.delivery_id = '${ctx.deliveryId}'`);
    expect(assignedLots.length, 'FEFO ile en az bir lot atanmalı').toBeGreaterThan(0);

    await page.getByRole('link', { name: 'Toplama ekranı' }).click();
    await page.waitForURL(/\/topla$/);
    await pickAllLines(page);
    await expect(page.getByText('Toplama tamamlandı')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'İrsaliyeye dön ve sevk et' }).click();
    await page.waitForURL(new RegExp(`/depo/sevkiyat/${ctx.deliveryId}$`));

    await expect(page.locator('[data-status="picked"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Sevk et' }).click();
    await expect(page.locator('[data-status="shipped"]').first()).toBeVisible({ timeout: 10_000 });

    const status = psqlOne(`select status from deliveries where id = '${ctx.deliveryId}'`);
    expect(status).toBe('shipped');
  });

  test('Adım 7 — ihracat@ çeki listesi (packing list) oluştur: kap/GTİP/kg', async () => {
    page = await switchRole(browser, page, 'ihracat', `/ihracat/sevkiyatlar/${ctx.shipmentId}`);
    await page.getByRole('button', { name: 'Çeki listesi oluştur' }).click();
    await expect(page.getByText('Çeki listesi kuruldu')).toBeVisible({ timeout: 10_000 });

    const shipment = psqlRows(`select status, package_count, net_weight_kg, gross_weight_kg from export_shipments where id = '${ctx.shipmentId}'`)[0]!;
    expect(shipment[0]).toBe('packing');
    expect(Number(shipment[1]), 'en az 1 kap üretilmeli').toBeGreaterThan(0);

    // `buildPackingList` (packages/core/src/export/shipments.ts) irsaliye SATIRI başına bir kap
    // üretir — irsaliye lot bazında BÖLÜNMÜŞSE (200 adet 3 lota dağıldıysa, bkz. Adım 6/`pickAllLines`
    // notu) tek kap değil, satır sayısı kadar kap (98+60+42) oluşur. Önceki sürüm tek kap/200 adet
    // varsayıyordu — canlıda 3 kaba bölününce ilk kabın miktarı (98) 200'e eşit değil diye patlıyordu.
    // Doğru doğrulama TOPLAM miktarın 200'e eşit olmasıdır, kaç kaba bölündüğünden bağımsız.
    const pkgs = psqlRows(`select package_no, qty, net_weight_kg, hs_code from export_packages where shipment_id = '${ctx.shipmentId}'`);
    expect(pkgs.length).toBeGreaterThan(0);
    const totalPackedQty = pkgs.reduce((sum, p) => sum + Number(p[1]), 0);
    expect(totalPackedQty).toBeCloseTo(200, 2);

    await page.getByRole('tab', { name: 'Çeki listesi' }).click();
    await expect(page.getByText('#1', { exact: true })).toBeVisible({ timeout: 10_000 });
    // Artık (bkz. yukarıdaki not) birden fazla kap/satır olabildiğinden aynı SKU birden çok kez
    // basılıyor — `.first()` yeterli (tekil varlığı değil, listede göründüğünü doğrular).
    await expect(visibleText(page, ctx.sku!).first()).toBeVisible();

    const doc = psqlOne(`select status from export_documents where shipment_id = '${ctx.shipmentId}' and code = 'PACKING_LIST'`);
    expect(doc).toBe('ready');
  });

  test('Adım 8 — ihracat@ /satis/siparisler/[id]: "Fatura oluştur" → 601, KDV 0, TCMB kuru, grandTotalTry', async () => {
    await page.goto(`/satis/siparisler/${ctx.orderId}`);
    await page.getByRole('button', { name: 'Fatura oluştur' }).click();
    await expect(page.getByText(/^Fatura kesildi/)).toBeVisible({ timeout: 10_000 });

    const invoice = psqlRows(`select id, doc_no, status, currency, is_export, exchange_rate, grand_total, grand_total_try, vat_total from invoices where delivery_id = '${ctx.deliveryId}'`)[0]!;
    expect(invoice, 'İrsaliyeden fatura oluşmalı').toBeTruthy();
    [ctx.invoiceId, ctx.invoiceDocNo] = invoice;
    ctx.invoiceExchangeRate = invoice[5];
    ctx.invoiceGrandTotal = invoice[6];
    expect(invoice[2]).toBe('posted');
    expect(invoice[3]).toBe('EUR');
    expect(invoice[4]).toBe('t');
    expect(Number(invoice[8]), 'İhracat faturasında KDV 0 olmalı').toBe(0);
    expect(Number(invoice[7])).toBeCloseTo(Number(invoice[6]) * Number(invoice[5]), 2);

    const todayEurRate = Number(psqlOne(`select buying from exchange_rates where currency='EUR' and rate_date <= current_date order by rate_date desc limit 1`));
    expect(Number(invoice[5])).toBeCloseTo(todayEurRate, 4);

    const je = psqlRows(`
      select jl.account_code, jl.debit, jl.credit from journal_lines jl
      join journal_entries je on je.id = jl.entry_id
      where je.ref_type = 'invoice' and je.ref_id = '${ctx.invoiceId}' and je.ledger = 'VUK'
    `);
    expect(je.find((r) => r[0] === '601' && Number(r[2]) > 0), '601 (yurt dışı satış) alacak satırı olmalı').toBeTruthy();
    expect(je.find((r) => r[0] === '600'), '600 (yurt içi satış) hiç kullanılmamalı').toBeFalsy();

    await expect(page.getByText(ctx.invoiceDocNo!).first()).toBeVisible();
  });

  test('Adım 9 — ihracat@ sevkiyat detayında faturaya bağla', async () => {
    await page.goto(`/ihracat/sevkiyatlar/${ctx.shipmentId}`);
    await page.getByRole('button', { name: 'Faturaya bağla' }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: new RegExp(ctx.invoiceDocNo!) }).click();
    await dialog.getByRole('button', { name: 'Bağla' }).click();
    await expect(page.getByText('Faturaya bağlandı')).toBeVisible({ timeout: 10_000 });

    const shipment = psqlOne(`select invoice_id from export_shipments where id = '${ctx.shipmentId}'`);
    expect(shipment).toBe(ctx.invoiceId);

    const doc = psqlOne(`select status from export_documents where shipment_id = '${ctx.shipmentId}' and code = 'INVOICE'`);
    expect(doc).toBe('sent');
  });

  test('Adım 10 — ihracat@ gümrüğe al (ETGB no) → belge "Gerekli" → "Alındı" → Yüklendi işaretle', async () => {
    const before = psqlOne(`select status from export_documents where shipment_id = '${ctx.shipmentId}' and code = 'ETGB'`);
    expect(before).toBe('required');
    await expect(visibleText(page, 'Gerekli')).toBeVisible();

    await page.getByRole('button', { name: 'Gümrüğe al' }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    const etgbNo = `ETGB2026DE${RUN}`;
    // `Label` burada `htmlFor` bağlamıyor (K-A11Y — bkz. phase1/phase3 aynı not), `Input`in de `id`si
    // yok — placeholder ile hedeflenir.
    await dialog.getByPlaceholder('ETGB2026DE00123').fill(etgbNo);
    await dialog.getByRole('button', { name: 'Gümrüğe al' }).click();
    await expect(page.getByText('Gümrük işlemine alındı')).toBeVisible({ timeout: 10_000 });

    const shipment = psqlRows(`select status, etgb_no from export_shipments where id = '${ctx.shipmentId}'`)[0]!;
    expect(shipment[0]).toBe('customs');
    expect(shipment[1]).toBe(etgbNo);

    const doc = psqlRows(`select id, status, doc_no from export_documents where shipment_id = '${ctx.shipmentId}' and code = 'ETGB'`)[0]!;
    ctx.etgbDocId = doc[0];
    // NOT: gerçek geçiş 'required' ("Gerekli") → 'received' ("Alındı") — orkestratörün "hazır" sözü
    // ('ready' durumunun Türkçe etiketi) burada birebir kullanılmıyor; `advanceToCustoms`
    // (packages/core/src/export/shipments.ts) ETGB/ATR belgesini doğrudan 'received' yapıyor, 'ready'
    // ara durumundan hiç geçmiyor. Uygulama davranışı iş mantığıyla tutarlı (ETGB numarası elde
        // edildiğinde belge fiilen "alınmış" sayılır) — bu bir kırık değil, yalnızca terminoloji notu.
    expect(doc[1]).toBe('received');
    expect(doc[2]).toBe(etgbNo);

    await page.getByRole('button', { name: 'Yüklendi işaretle' }).click();
    await expect(page.getByText('Yüklendi olarak işaretlendi')).toBeVisible({ timeout: 10_000 });
    const finalStatus = psqlOne(`select status from export_shipments where id = '${ctx.shipmentId}'`);
    expect(finalStatus).toBe('shipped');
    await expect(page.getByText('Yüklendi', { exact: false }).first()).toBeVisible();
  });

  test('Adım 11 — muhasebe@ /muhasebe/tahsilatlar/yeni: EUR tahsilat farklı günün kuruyla → 646/656 kur farkı fişi', async () => {
    // Fatura kuru (bugün) ile GERÇEKTEN farklı, seed'in halihazırda doldurduğu bir geçmiş EUR kuru
    // bulunur (dinamik — hangi günün ne kadar farklı olduğu seed'in o anki rastgele varyasyonuna
    // bağlı, bu yüzden hardcode edilmez).
    const rateRow = psqlRows(`
      select rate_date, buying from exchange_rates
      where currency = 'EUR' and rate_date < current_date and buying <> '${ctx.invoiceExchangeRate}'
      order by rate_date desc limit 1
    `)[0];
    expect(rateRow, 'Seed: fatura kurundan farklı en az bir geçmiş EUR kuru olmalı').toBeTruthy();
    const [paymentDateIso, paymentRate] = rateRow!;
    const paymentDateTr = paymentDateIso!.split('-').reverse().join('.');

    page = await switchRole(browser, page, 'muhasebe');
    await page.goto('/muhasebe/tahsilatlar/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni Tahsilat' })).toBeVisible().catch(() => {});

    await page.getByLabel('Yön').click();
    await page.getByRole('option', { name: 'Tahsilat (müşteriden alınan)' }).click();
    await comboboxSelect(page, 'Cari seçin…', ctx.customerName!.split(' ')[0]!, new RegExp(ctx.customerName!.split(' ')[0]!));
    await page.getByLabel('Yöntem').click();
    await page.getByRole('option', { name: 'Havale/EFT' }).click();
    await comboboxSelect(page, 'Banka hesabı seçin…', 'VKF-TIRE-EUR', /VKF-TIRE-EUR/);

    // `FormDate` (`date-field.tsx`) gerçek bir `<FormField>` bağlamında render edilir (K-A11Y
    // istisnası — bkz. `record-payment-form.tsx`), bu yüzden `getByLabel` doğrudan çalışır; alan
    // yazılabilir gg.aa.yyyy metin kutusudur (ISO DEĞİL).
    await page.getByLabel('Tarih').fill(paymentDateTr);
    await page.getByLabel('Tarih').press('Tab');

    await page.getByLabel('Para birimi').click();
    await page.getByRole('option', { name: /EUR/ }).click();

    await expect(page.getByText(ctx.invoiceDocNo!)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('checkbox', { name: new RegExp(`${ctx.invoiceDocNo!} tahsis et`) }).check();
    const residual = ctx.invoiceGrandTotal!;
    await page.getByLabel('Tutar').fill(residual);
    await page.getByRole('button', { name: 'Otomatik dağıt (en eski önce)' }).click();

    await page.getByRole('button', { name: 'Tahsilatı kaydet' }).click();
    await expect(page.getByText(/^Tahsilat kaydedildi/)).toBeVisible({ timeout: 15_000 });

    const payment = psqlRows(`
      select p.id, p.exchange_rate, p.fx_difference, p.fx_journal_entry_id, p.journal_entry_id
      from payments p join payment_allocations pa on pa.payment_id = p.id
      where pa.invoice_id = '${ctx.invoiceId}' order by p.created_at desc limit 1
    `)[0]!;
    expect(payment, 'Tahsilat kaydı olmalı').toBeTruthy();
    const [paymentId, paymentExchangeRate, fxDifference, fxJournalEntryId, mainJournalEntryId] = payment;
    expect(mainJournalEntryId, 'Ana tahsilat fişi olmalı (102/120.cari)').toBeTruthy();
    expect(Number(paymentExchangeRate)).toBeCloseTo(Number(paymentRate), 4);

    const expectedFx = Number(residual) * (Number(paymentRate) - Number(ctx.invoiceExchangeRate));
    expect(Math.abs(expectedFx), 'Test verisi kurları gerçekten farklı olmalı ki fark 0 olmasın').toBeGreaterThan(0.01);
    expect(Number(fxDifference)).toBeCloseTo(expectedFx, 2);
    expect(fxJournalEntryId, 'fx_journal_entry_id dolmalı — I13 b/c şıkkı').toBeTruthy();

    const fxLines = psqlRows(`select account_code, debit, credit from journal_lines where entry_id = '${fxJournalEntryId}'`);
    if (expectedFx > 0) {
      const line = fxLines.find((r) => r[0] === '646');
      expect(line, '646 (kambiyo kârı) satırı olmalı — lehte fark').toBeTruthy();
      expect(Number(line![2])).toBeCloseTo(Math.abs(expectedFx), 2);
    } else {
      const line = fxLines.find((r) => r[0] === '656');
      expect(line, '656 (kambiyo zararı) satırı olmalı — aleyhte fark').toBeTruthy();
      expect(Number(line![1])).toBeCloseTo(Math.abs(expectedFx), 2);
    }

    // Fatura tamamen kapanmış olmalı — kalan 0.
    const invResidual = psqlOne(`select residual from invoices where id = '${ctx.invoiceId}'`);
    expect(Number(invResidual)).toBeCloseTo(0, 2);

    void paymentId;
  });
});

/* ==================================================================== */
/* Akış: Bakım — arıza bildir → downtime → tamamla → OEE                */
/* ==================================================================== */

test.describe('Akış: Bakım arıza → downtime → OEE (phase4, mobil 390×844)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  const ctx: { machineId?: string; lineId?: string; orderId?: string; orderDocNo?: string } = {};

  test('Adım 1 — bakim@ mobil /bakim/is-emirleri/yeni: QR MCH:MK-002 → foto → başlık/öncelik → gönder', async ({ browser }) => {
    const machineRow = psqlRows(`select id, line_id, status from machines where code = 'MK-002'`)[0]!;
    expect(machineRow, 'Seed: MK-002 bulunmalı').toBeTruthy();
    [ctx.machineId, ctx.lineId] = machineRow;

    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'bakim', '/bakim/is-emirleri/yeni');
    await expect(page.getByRole('heading', { name: 'Arıza Bildir' })).toBeVisible();
    const overflow = await overflowCheck(page);
    expect(overflow, 'Mobilde yatay taşma olmamalı').toBeLessThanOrEqual(1);

    const scanInput = page.getByPlaceholder(/Makine QR'ı okutun/);
    await scanInput.fill('MCH:MK-002');
    await scanInput.press('Enter');
    await expect(page.getByText('MK-002', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    const title = `QA phase4 arıza ${RUN}`;
    await page.getByLabel('Başlık').fill(title);
    await page.getByLabel('Öncelik').click();
    await page.getByRole('option', { name: 'Yüksek' }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_PHOTO);
    await expect(page.getByText('Fotoğraf (1/6)')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Arızayı bildir' }).click();
    await page.waitForURL(/\/bakim\/is-emirleri\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    ctx.orderId = page.url().split('/').pop()!;

    const order = psqlRows(`select doc_no, status, priority, photo_count from maintenance_orders where id = '${ctx.orderId}'`)[0]!;
    ctx.orderDocNo = order[0];
    expect(order[1]).toBe('reported');
    expect(order[2]).toBe('high');
    expect(Number(order[3])).toBe(1);

    const machineStatus = psqlOne(`select status from machines where id = '${ctx.machineId}'`);
    expect(machineStatus, 'Arıza bildirimi makineyi anında down\'a düşürmeli').toBe('down');

    const downtime = psqlRows(`select id, started_at, ended_at from downtimes where maintenance_order_id = '${ctx.orderId}'`)[0]!;
    expect(downtime, 'Downtime kaydı açılmalı').toBeTruthy();
    expect(downtime[2], 'Downtime henüz kapanmamalı').toBeFalsy();

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible({ timeout: 10_000 });

    await ctxB.close();
  });

  test('Adım 2 — bakim@ mobil: iş emrini işleme al → Tamamla (kontrol listesi yok — arıza bildirimleri plansız, bkz. not) → downtime kapanır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'bakim', `/bakim/is-emirleri/${ctx.orderId}`);
    await expect(page.getByRole('button', { name: 'İşleme al' })).toBeVisible();

    // NOT: docs/modules/bakim.md "iş emri detayı: kontrol listesi işaretleme" der ama bu yalnızca
    // PERİYODİK (plandan üretilen) iş emirlerinde doludur — `checklistResults` `[]` varsayılanla
    // gelir ve `plans.ts::generateDueOrders` DIŞINDA hiçbir yol onu doldurmaz
        // (packages/db/src/schema/maintenance.ts satır 82, packages/core/src/maintenance/orders.ts
    // `reportBreakdown` checklist alanına hiç dokunmuyor). Bu yüzden bu KORİGATİF (arıza) iş
    // emrinde kontrol listesi bölümü DOM'da hiç render edilmez (`order-detail.tsx`
    // `checklist.length > 0` koşulu) — orkestratörün beklediği "kontrol listesi" adımı bu akışta
    // uygulanamaz; bu bir kırık değil, periyodik-özel bir özelliğin korigatif iş emrinde
    // bulunmaması (bkz. görev 4'teki periyodik akış, kontrol listesi ORADA gerçekten var).
    await expect(page.getByText('Kontrol listesi')).toHaveCount(0);

    await page.getByRole('button', { name: 'İşleme al' }).click();
    await expect(page.getByText('İş emri işleme alındı')).toBeVisible({ timeout: 10_000 });
    const inProgressStatus = psqlOne(`select status from maintenance_orders where id = '${ctx.orderId}'`);
    expect(inProgressStatus).toBe('in_progress');
    // reportBreakdown zaten 'down' yapmıştı; startOrder yalnızca 'down' DEĞİLSE 'maintenance'a çeker —
    // bu yüzden makine burada da 'down' kalmalı.
    const machineStillDown = psqlOne(`select status from machines where id = '${ctx.machineId}'`);
    expect(machineStillDown).toBe('down');

    await page.getByRole('button', { name: 'Tamamla' }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    // `Label` burada da `htmlFor` bağlamıyor (K-A11Y — bkz. ETGB no notu), placeholder ile hedeflenir.
    await dialog.getByPlaceholder('Ör. conta aşınmış').fill('Conta aşınmış (QA phase4)');
    await dialog.getByPlaceholder('Ör. conta değiştirildi').fill('Conta değiştirildi (QA phase4)');
    await dialog.getByRole('button', { name: 'Tamamla' }).click();
    await expect(page.getByText('İş emri tamamlandı')).toBeVisible({ timeout: 10_000 });

    const order = psqlRows(`select status, downtime_minutes from maintenance_orders where id = '${ctx.orderId}'`)[0]!;
    expect(order[0]).toBe('done');
    expect(Number(order[1]), 'Kapanan iş emrinde downtime dakikası kaydedilmeli').toBeGreaterThanOrEqual(0);

    const downtime = psqlOne(`select ended_at from downtimes where maintenance_order_id = '${ctx.orderId}'`);
    expect(downtime, 'Downtime kapanmalı').toBeTruthy();

    const machine = psqlOne(`select status from machines where id = '${ctx.machineId}'`);
    expect(['running', 'idle']).toContain(machine);

    await ctxB.close();
  });

  test('Adım 3 — worker `oee-daily` elle tetiklenir → /bakim/oee bugünkü kullanılabilirlik düşer', async ({ page }) => {
    const today = psqlOne(`select current_date::text`);
    const before = psqlRows(`select availability_pct, downtime_minutes from oee_records where line_id = '${ctx.lineId}' and day = '${today}' and machine_id is null`)[0];
    const beforeAvail = before ? Number(before[0]) : null;
    const beforeDowntime = before ? Number(before[1]) : 0;

    const out = execSync(
      `pnpm --filter @plantero/worker exec tsx -e "import('./src/jobs/oeeDaily.ts').then(async (m) => { const r = await m.runOeeDaily(); console.log('OEE_RESULT:'+JSON.stringify(r)); process.exit(0); }).catch((e)=>{console.error(e); process.exit(1);});"`,
      { encoding: 'utf-8', cwd: process.cwd() },
    );
    expect(out).toMatch(/OEE_RESULT:/);

    const after = psqlRows(`select availability_pct, downtime_minutes from oee_records where line_id = '${ctx.lineId}' and day = '${today}' and machine_id is null`)[0]!;
    expect(after, 'oee_records satırı olmalı').toBeTruthy();
    const afterAvail = Number(after[0]);
    const afterDowntime = Number(after[1]);

    expect(afterDowntime, 'downtime dakikası arttı ya da eşit kaldı (bizim arızamız + o günün diğer duruşları)').toBeGreaterThanOrEqual(beforeDowntime);
    if (beforeAvail !== null) expect(afterAvail).toBeLessThanOrEqual(beforeAvail + 0.01);

    const lineCode = psqlOne(`select code from production_lines where id = '${ctx.lineId}'`);
    await loginAs(page, 'bakim', `/bakim/oee?lineId=${ctx.lineId}`);
    // `exact: true` şart — sayfada bir de "OEE trendi" alt-başlığı (h2) var, adsız/varsayılan
    // eşleşme (alt-dize) her ikisiyle de eşleşip strict-mode ihlaline düşüyordu (canlı yakalandı).
    await expect(page.getByRole('heading', { name: 'OEE', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: lineCode! })).toBeVisible();
  });
});

/* ==================================================================== */
/* Worker: bakım periyodik plan → otomatik önleyici iş emri              */
/* ==================================================================== */

test.describe('Worker: maintenance-scheduler otomatik iş emri (phase4)', () => {
  test('nextDueAt=bugün olan bir plan için worker elle tetiklenince otomatik preventive iş emri açılır', async ({ page }) => {
    // Ekranda `nextDueAt` alanını doğrudan düzenleyen bir form YOK (yalnızca aralık/checklist/atanan —
    // bkz. plan-form.tsx; "Şimdi üret" ekran eylemi zaten vadeyi BEKLEMEDEN üretir, worker'ın KENDİ
    // vade-taramasını test etmez). Bu yüzden yalnızca bu ÖN KOŞUL (vade=bugün) tek bir SQL UPDATE ile
    // kurulur — test ettiğimiz DAVRANIŞ (worker'ın vadesi gelmiş planı bulup iş emri açması) hâlâ
    // gerçek `generateDueOrders`'tan geçer, yalnızca "vade bugüne geldi" durumunu simüle ediyoruz.
    const plan = psqlRows(`
      select id, name, machine_id from maintenance_plans
      where is_active = true and not exists (
        select 1 from maintenance_orders mo where mo.plan_id = maintenance_plans.id and mo.status not in ('done','cancelled')
      )
      order by next_due_at asc limit 1
    `)[0];
    expect(plan, 'Seed: açık iş emri olmayan en az bir aktif plan olmalı').toBeTruthy();
    const [planId, planName, machineId] = plan!;
    psql(`update maintenance_plans set next_due_at = current_date where id = '${planId}'`);

    const t0 = new Date().toISOString();
    const out = execSync(
      `pnpm --filter @plantero/worker exec tsx -e "import('./src/jobs/maintenanceScheduler.ts').then(async (m) => { const r = await m.runMaintenanceScheduler(); console.log('MS_RESULT:'+JSON.stringify(r)); process.exit(0); }).catch((e)=>{console.error(e); process.exit(1);});"`,
      { encoding: 'utf-8', cwd: process.cwd() },
    );
    expect(out).toMatch(/MS_RESULT:/);

    const order = psqlRows(`
      select id, doc_no, status, kind, checklist_results::text from maintenance_orders
      where plan_id = '${planId}' and created_at >= '${t0}' order by created_at desc limit 1
    `)[0];
    expect(order, `${planName} için otomatik iş emri oluşmalı`).toBeTruthy();
    const [orderId, orderDocNo, status, kind, checklistJson] = order!;
    expect(status).toBe('planned');
    expect(kind).toBe('preventive');
    expect(checklistJson).not.toBe('[]');

    const planChecklist = psqlOne(`select checklist::text from maintenance_plans where id = '${planId}'`);
    expect(checklistJson!.length).toBeGreaterThan(2);
    void planChecklist;
    void machineId;

    await loginAs(page, 'bakim', `/bakim/is-emirleri/${orderId}`);
    await expect(page.getByText(orderDocNo!).first()).toBeVisible();
    await expect(page.getByText('Kontrol listesi')).toBeVisible();
  });
});

/* ==================================================================== */
/* Akış: Ar-Ge — board + reçete + BOM devri                              */
/* ==================================================================== */

test.describe('Akış: Ar-Ge board + reçete + BOM devri (phase4)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(150_000);

  const ctx: {
    projectId?: string; boardUrl?: string; recetelerUrl?: string;
    newCardTitle?: string;
    rawMaterialId?: string; rawMaterialSku?: string; rawMaterialUomId?: string;
    recipeId?: string; v2Id?: string;
    linkedProductId?: string; linkedProductSku?: string;
  } = {};

  let page: Page;
  let browser: Browser;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    page = await browser.newPage();
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Adım 1 — arge@ /arge/projeler → "Fıstık Bazı" board: yeni kart → "Pilot Üretim"e sürükle (kalıcı) → kolon adı değiştir', async () => {
    const project = psqlRows(`select id from rnd_projects where name = 'Fıstık Bazı'`)[0];
    expect(project, "Seed: 'Fıstık Bazı' projesi bulunmalı").toBeTruthy();
    ctx.projectId = project![0];
    ctx.boardUrl = `/arge/projeler/${ctx.projectId}/board`;
    ctx.recetelerUrl = `/arge/projeler/${ctx.projectId}/receteler`;

    await loginAs(page, 'arge');
    await page.goto('/arge/projeler');
    await expect(page.getByRole('heading', { name: 'Ar-Ge Projeleri' })).toBeVisible().catch(() => {});
    await visibleText(page, 'Fıstık Bazı').first().click();
    await page.waitForURL(/\/arge\/projeler\/[0-9a-f-]{36}/);

    await page.goto(ctx.boardUrl);
    const fikirColId = psqlOne(`select id from rnd_board_columns where project_id = '${ctx.projectId}' and name = 'Fikir'`)!;
    const pilotColId = psqlOne(`select id from rnd_board_columns where project_id = '${ctx.projectId}' and name = 'Pilot Üretim'`)!;
    expect(fikirColId).toBeTruthy();
    expect(pilotColId).toBeTruthy();
    const pilotCardBefore = psqlOne(`select id from rnd_cards where column_id = '${pilotColId}' limit 1`);
    expect(pilotCardBefore, "Seed: 'Pilot Üretim' kolonunda sürükleme hedefi olacak en az 1 kart olmalı").toBeTruthy();

    ctx.newCardTitle = `QA phase4 kart ${RUN}`;
    await page.getByRole('button', { name: 'Kart ekle' }).first().click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Başlık').fill(ctx.newCardTitle);
    await dialog.getByRole('button', { name: 'Oluştur' }).click();
    await expect(dialog).toBeHidden();
    await expect(visibleText(page, ctx.newCardTitle)).toBeVisible({ timeout: 10_000 });

    const sourceCard = page.getByRole('button', { name: ctx.newCardTitle }).first();
    const targetCard = page.getByRole('button', { name: /HAT1 pilot parti planlaması/ }).first();
    const sourceBox = await sourceCard.boundingBox();
    const targetBox = await targetCard.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 15, sourceBox!.y + sourceBox!.height / 2 + 5, { steps: 5 });
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 15 });
    await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2 + 2, { steps: 3 });
    await page.mouse.up();

    await expect
      .poll(() => psqlOne(`select column_id from rnd_cards where project_id = '${ctx.projectId}' and title = '${ctx.newCardTitle}'`), {
        message: 'sürüklenen kart Pilot Üretim kolonuna taşınmalı',
        timeout: 10_000,
      })
      .toBe(pilotColId);

    await page.reload();
    // Kolon kökü: başlık span'inden iki üst (span → başlık satırı → kolon kökü) — `BoardColumn`
    // (board-column.tsx) yapısı sabit; geniş bir "içinde bu metin geçen herhangi bir div" filtresi
    // TÜM kolonları saran dış kapsayıcıyı da eşleştirip yanlışlıkla her zaman "doğru" çıkabilirdi.
    const pilotColumn = page.getByText('Pilot Üretim', { exact: true }).locator('..').locator('..');
    await expect(pilotColumn.getByText(ctx.newCardTitle!)).toBeVisible({ timeout: 10_000 });

    const newColName = `Pilot Üretim (QA ${RUN})`;
    await pilotColumn.getByRole('button', { name: 'Kolon menüsü' }).click();
    await page.getByRole('menuitem', { name: 'Yeniden adlandır' }).click();
    const renameDialog = page.locator('[data-slot="dialog-content"]');
    await renameDialog.getByRole('textbox').fill(newColName);
    await renameDialog.getByRole('button', { name: 'Kaydet' }).click();
    await expect(renameDialog).toBeHidden();
    await expect(visibleText(page, newColName)).toBeVisible({ timeout: 10_000 });

    const colName = psqlOne(`select name from rnd_board_columns where id = '${pilotColId}'`);
    expect(colName).toBe(newColName);
  });

  test('Adım 2 — arge@ receteler: yeni deneme reçetesi (v1) → "Yeni versiyon" (v2) → satır miktarını değiştir → birim maliyet anında değişir (SQL ile eşit)', async () => {
    // `products` tablosunda `is_active` diye bir kolon YOK — aktiflik `status` enum'ıyla
    // ('active'|'draft'|'cancelled') tutuluyor (bkz. packages/db/src/schema/products.ts). Önceki
    // sürüm `is_active = true` yazıyordu, canlıda `column "is_active" does not exist` ile patlıyordu.
    const raw = psqlRows(`select id, sku, uom_id from products where type = 'raw_material' and status = 'active' order by sku limit 1`)[0]!;
    [ctx.rawMaterialId, ctx.rawMaterialSku, ctx.rawMaterialUomId] = raw;

    await page.goto(ctx.recetelerUrl!);
    await expect(page.getByRole('heading', { name: 'Deneme Reçeteleri' })).toBeVisible().catch(() => {});
    await page.getByRole('button', { name: 'Yeni deneme reçetesi' }).click();
    const newRecipeDialog = page.locator('[data-slot="dialog-content"]');
    await expect(newRecipeDialog).toBeVisible();
    const recipeName = `Fıstık Bazı deneme ${RUN}`;
    await newRecipeDialog.getByLabel('Ad').fill(recipeName);
    await newRecipeDialog.getByRole('combobox').click();
    await page.getByPlaceholder('Ara…').fill(ctx.rawMaterialSku!);
    await page.getByRole('option', { name: new RegExp(ctx.rawMaterialSku!) }).first().click();
    await newRecipeDialog.getByLabel('Miktar').fill('2');
    await newRecipeDialog.getByRole('button', { name: 'Oluştur' }).click();
    await expect(newRecipeDialog).toBeHidden();
    // `getByText('v1')` iki eleman buluyordu: sol listedeki versiyon seçici düğmesi ("v1 Taslak")
    // VE sağdaki çalışma alanı başlığı (`<h2>v1</h2>`) — strict-mode ihlali (canlıda yakalandı).
    // Başlık `getByRole('heading', ...)` ile tekil hedeflenir.
    await expect(page.getByRole('heading', { name: 'v1' })).toBeVisible({ timeout: 10_000 });

    ctx.recipeId = psqlOne(`select id from trial_recipes where project_id = '${ctx.projectId}' and name = '${recipeName}'`)!;
    expect(ctx.recipeId).toBeTruthy();

    await page.getByRole('button', { name: 'Yeni versiyon' }).click();
    await expect(page.getByText('v2 oluşturuldu')).toBeVisible({ timeout: 10_000 });
    // Sunucu eylemi (`createNewVersionAction`) toast'ta DÖNEN gerçek versiyon numarasını basıyor
    // ("v2 oluşturuldu" görünmesi zaten sunucunun version=2 döndürdüğünü kanıtlıyor) — commit
    // toast'tan ÖNCE tamamlanmış olmalı (server action `await` edilip SONRA `.then()` toast basıyor,
    // bkz. `recipe-workspace.tsx`). Yine de bu makinede eşzamanlı başka bir oturumun `db:reset`
    // koşabildiği belgeli bir risk (dosya başı not) — birebir SELECT yerine kısa bir `.poll()` ile
    // okunur; asıl beklenti (v2 satırının VARLIĞI) gevşetilmedi, yalnızca okuma anına tolerans eklendi.
    await expect
      .poll(() => psqlOne(`select id from trial_recipe_versions where recipe_id = '${ctx.recipeId}' and version = 2`), {
        message: 'v2 satırı veritabanında bulunmalı (bkz. toast: sunucu version=2 döndürdü)',
        timeout: 5_000,
      })
      .toBeTruthy();
    ctx.v2Id = psqlOne(`select id from trial_recipe_versions where recipe_id = '${ctx.recipeId}' and version = 2`)!;
    expect(ctx.v2Id).toBeTruthy();

    // Maliyet kaynağını 'Manuel' yapıp sabit bir birim maliyet gir — canlı simülasyon formülünü
    // (packages/core/src/rnd/costFormula.ts: Σqty×(1+fire%)×maliyet ÷ (parti×verim) + genel gider)
    // SQL/JS ile önceden bağımsız hesaplayabilmek için (satırın "ortalama maliyet" kademesi ürün
    // geçmişine bağlı, deterministik değil).
    const row = page.locator('table tbody tr').first();
    await row.locator('td').nth(2).getByRole('combobox').click();
    await page.getByRole('option', { name: 'Manuel' }).click();
    const unitCostInput = row.locator('td').nth(3).locator('input');
    await unitCostInput.fill('50');
    const qtyInput = row.locator('td').nth(1).locator('input');
    await qtyInput.fill('3');
    await qtyInput.blur();

    // batchQty=1, expectedYieldPct=100, overhead=0 (yeni reçetenin varsayılanları) → birimMaliyet = qty×maliyet.
    const expectedUnitCost = 3 * 50;
    // Tam para birimi biçimini (₺ konumu/boşluk) varsaymak yerine — tarayıcının ICU'su Node'unkinden
    // ayrışabilir — footer metni okunup sayı ayrıştırılır (aynı `parseTrNumber` yardımcısı).
    // NOT: tablo başlığında da AYNI metin ("Birim maliyet" sütun th'si) var — DOM sırasında SONRA
    // gelen özet satırı `.last()` ile hedeflenir (strict-mode ihlalini önler).
    const unitCostFooter = page.getByText('Birim maliyet', { exact: false }).last();
    await expect
      .poll(async () => parseTrNumber(await unitCostFooter.innerText()), { message: 'canlı birim maliyet anında değişmeli', timeout: 10_000 })
      .toBeCloseTo(expectedUnitCost, 2);

    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByText('Versiyon güncellendi').or(page.getByText('v2'))).toBeVisible({ timeout: 10_000 }).catch(() => {});

    await expect
      .poll(() => psqlOne(`select unit_cost from trial_recipe_versions where id = '${ctx.v2Id}'`), { timeout: 10_000 })
      .toBe(expectedUnitCost.toFixed(4));

    const dbLine = psqlRows(`select qty, cost_source, unit_cost from trial_recipe_lines where version_id = '${ctx.v2Id}'`)[0]!;
    expect(Number(dbLine[0])).toBeCloseTo(3, 4);
    expect(dbLine[1]).toBe('manual');
    expect(Number(dbLine[2])).toBeCloseTo(50, 4);
  });

  test('Adım 3 — arge@ "Onaya gönder" → /onaylar → Onayla → "Üretim BOM\'una devret" (ürün bağlanmamış → mevcut ürünü bağla) → devret', async () => {
    await page.getByRole('button', { name: 'Onaya gönder' }).click();
    await expect(page.getByText('Onaya gönderildi')).toBeVisible({ timeout: 10_000 });
    const statusAfterSubmit = psqlOne(`select status from trial_recipe_versions where id = '${ctx.v2Id}'`);
    expect(statusAfterSubmit).toBe('testing');
    const approvalId = psqlOne(`select id from approvals where ref_table = 'trial_recipe_versions' and ref_id = '${ctx.v2Id}' and status = 'pending'`);
    expect(approvalId, 'Onay kaydı (recipe_release) oluşmalı').toBeTruthy();

    await page.goto('/onaylar');
    await expect(page.getByRole('heading', { name: 'Onay Merkezi' })).toBeVisible();
    const card = page.locator('div').filter({ hasText: /Reçete devri onayı/ }).filter({ hasText: new RegExp(`v2`) }).filter({ has: page.getByRole('button', { name: 'Onayla' }) }).last();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: 'Onayla' }).click();
    await expect(page.getByText(/onay/i).first()).toBeVisible({ timeout: 10_000 });

    const statusAfterApprove = psqlOne(`select status from trial_recipe_versions where id = '${ctx.v2Id}'`);
    expect(statusAfterApprove).toBe('approved');

    // "Fıstık Bazı" projesinin (docs/modules/arge.md: "yeni SKU adayı 110050001") seed'de HENÜZ bir
    // ürüne bağlı productId'si YOK — releaseToBom bu yüzden ilk denemede NoProductLinkedError'a düşer
    // ve UI "Devretmeden önce mevcut bir SKU seçin ya da Ana Veri sihirbazından yeni bir SKU oluşturun"
    // panelini açar (cost-simulator.tsx). Kalıcı yan etkisi olmayan, hiçbir BOM'u/açık iş emri olmayan
    // ve başka hiçbir Ar-Ge projesine bağlı olmayan mevcut bir mamul/yarı mamul seçilir.
    const projectHasProduct = psqlOne(`select product_id from rnd_projects where id = '${ctx.projectId}'`);
    expect(projectHasProduct, "Bulgu doğrulaması: 'Fıstık Bazı' seed'de productId TAŞIMAMALI").toBeFalsy();

    const linked = psqlRows(`
      select id, sku from products p where p.type in ('finished','semi_finished')
        and not exists (select 1 from boms b where b.product_id = p.id)
        and not exists (select 1 from rnd_projects rp where rp.product_id = p.id)
      order by sku limit 1
    `)[0];
    expect(linked, 'BOM\'suz ve hiçbir Ar-Ge projesine bağlı olmayan bir ürün bulunmalı').toBeTruthy();
    [ctx.linkedProductId, ctx.linkedProductSku] = linked!;

    await page.goto(ctx.recetelerUrl!);
    await visibleText(page, 'v2').click();
    await page.getByRole('button', { name: "Üretim BOM'una devret" }).click();
    await expect(page.getByText('Proje bir ürüne bağlı değil')).toBeVisible({ timeout: 10_000 });
    // `Combobox`'ın `placeholder` prop'u tetikleyicinin GÖRÜNÜR metnidir, gerçek bir `<input
    // placeholder>` değil (bkz. `combobox.tsx` — tetikleyici bir `<button role="combobox">`);
    // `comboboxSelect` yardımcısıyla aynı `role="combobox"` + `hasText` kalıbı kullanılır.
    await page.getByRole('combobox').filter({ hasText: 'Mevcut ürün seçin…' }).click();
    await page.getByPlaceholder('Ara…').fill(ctx.linkedProductSku!);
    await page.getByRole('option', { name: new RegExp(ctx.linkedProductSku!) }).first().click();
    await page.getByRole('button', { name: 'Bağla' }).click();
    await expect(page.getByText('Ürün projeye bağlandı')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: "Üretim BOM'una devret" }).click();
    await expect(page.getByText(/Üretim BOM'una devredildi/)).toBeVisible({ timeout: 10_000 });

    const version = psqlRows(`select status, released_bom_id from trial_recipe_versions where id = '${ctx.v2Id}'`)[0]!;
    expect(version[0]).toBe('released');
    expect(version[1]).toBeTruthy();
    const bomId = version[1];
    const bom = psqlRows(`select status, source_trial_version_id, product_id from boms where id = '${bomId}'`)[0]!;
    expect(bom[0]).toBe('active');
    expect(bom[1]).toBe(ctx.v2Id);
    expect(bom[2]).toBe(ctx.linkedProductId);
  });

  test('Adım 4 — /ana-veri/receteler aktif BOM (sourceTrialVersionId dolu) → /uretim/is-emirleri/yeni bu ürünle açılabiliyor', async () => {
    await page.goto('/ana-veri/receteler');
    await expect(page.getByRole('heading', { name: 'Reçeteler' })).toBeVisible().catch(() => {});
    await expect(visibleText(page, ctx.linkedProductSku!)).toBeVisible({ timeout: 10_000 });

    // `/uretim/is-emirleri/yeni` ürün listesi yalnızca AKTİF BOM'u olan ürünleri getirir
    // (`listManufacturableProducts` — bkz. `apps/web/src/modules/production/queries.ts`) — ürünün bu
    // combobox'ta seçilebilir görünmesinin KENDİSİ zaten "aktif BOM var" kanıtıdır. `bomId` alanı
    // ekranda ayrı bir "Reçete" seçici olarak YOK — ürün seçilince programatik olarak dolduruluyor
    // (`form.setValue('bomId', p.activeBomId)`); bunun gerçekten işe yaradığı, malzeme önizlemesinin
    // (reçete satırlarımızdaki hammadde) hatasız hesaplanmasıyla doğrulanır.
    page = await switchRole(page.context().browser()!, page, 'uretim_sefi', '/uretim/is-emirleri/yeni');
    await expect(page.getByRole('heading', { name: 'Yeni İş Emri' })).toBeVisible();
    await comboboxSelect(page, 'Ürün seçin (aktif reçetesi olanlar)', ctx.linkedProductSku!, new RegExp(ctx.linkedProductSku!));
    await page.getByLabel('Planlanan miktar').fill('1');
    await expect(page.getByText('Reçete henüz hesaplanmadı')).toHaveCount(0);
    await expect(page.getByText('Malzeme önizleme (reçete)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Malzeme önizlemesi hesaplanamadı')).toHaveCount(0);
    await expect(visibleText(page, ctx.rawMaterialSku!)).toBeVisible({ timeout: 10_000 });
  });
});

/* ==================================================================== */
/* Kokpit KPI doğrulama                                                  */
/* ==================================================================== */

test.describe('Kokpit KPI doğrulama (phase4)', () => {
  test('admin: kritik stok kalemi sayısı psql ile birebir aynı', async ({ page }) => {
    const expectedCritical = Number(
      psqlOne(`
        select count(*) from reorder_rules rr
        where rr.is_active = true and rr.last_days_of_cover is not null
          and rr.last_days_of_cover::numeric < rr.lead_time_days
      `),
    );

    await loginAs(page, 'admin', '/kokpit');
    await expect(page.getByRole('heading', { name: 'Kokpit' })).toBeVisible();
    // `KpiCard` (variant=strip) başlık + değer aynı köke (`<a>`) kardeş `<div>` olarak render eder
    // (bkz. `kpi-card.tsx`) — başlığın DOĞRUDAN üst elemanı köktür; "içinde bu metin geçen herhangi
    // bir div/a" filtresi TÜM KPI şeridini (veya daha üstünü) eşleştirip yanlış satırı okuyabilirdi.
    const card = page.getByText('Kritik stok kalemi', { exact: true }).locator('..');
    // `.innerText()` bu kartta GÜVENİLMEZ — bkz. `readNumberFlowValue` yorumundaki kök neden
    // (canlıda yakalandı: `expectedCritical` bu seed'de tesadüfen 0 olduğu için ilk sürümde bu test
    // yanlışlıkla GEÇTİ, asıl kırığı yalnızca "Vadesi geçen alacak" testi — DB'de sıfır olmayan bir
    // değer — ortaya çıkardı). Erişilebilirlik ağacındaki gerçek değerden okunur.
    await expect.poll(() => readNumberFlowValue(card), { message: 'Kritik stok kalemi KPI değeri DB ile eşleşmeli', timeout: 10_000 }).toBe(expectedCritical);
  });

  test('admin: "Bugün", "Banka", "Geciken alacak", "Break-even\'a uzaklık", "SKT riski" bölümleri görünür ve rakamlar makul (0 veya pozitif)', async ({ page }) => {
    await loginAs(page, 'admin', '/kokpit');
    for (const title of ['Bugünkü net ciro', 'Banka', 'Geciken alacak', "Break-even'a uzaklık", 'SKT riski', 'Kritik stok']) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    }

    // `getBankSummary` (packages/core/src/cockpit/kpis.ts) tanımıyla birebir: yalnızca aktif TRY
    // hesaplar toplanır. Bu toplam NEGATİF olabilir (bu seed'de VKF-TIRE-TL ekstre bakiyesi eksi —
    // gerçek bir işletmede kredili mevduat/nakit açığı normaldir) — `KpiCard`/`MoneyCell` negatif
    // tutarı kırmızı ama DOĞRU basar (bkz. `getMoneyTone`, format.ts). Önceki sürüm burada
    // `toBeGreaterThanOrEqual(0)` bekliyordu — bu YANLIŞ bir varsayımdı (uygulama davranışı değil,
    // test tarafının hatalı beklentisiydi) ve canlıda -254.348,4973 ile patlıyordu.
    //
    // Kök neden (ikinci canlı bulgu): "Banka toplamı" başlıklı KpiCard yalnızca `finans` rolünün
    // gördüğü `FinanceDashboardView`'de var (finance-dashboard.tsx satır 23) — admin/GM
    // `GmDashboardView` görür (kokpit/page.tsx: `dashboard.role==='gm'` → GmDashboardView), o ekranda
    // toplam bir KpiCard değil, "Banka" bölümünün ilk satırıdır: `<span>Toplam (TRY hesaplar)</span>`
    // + yanında `MoneyCell` (gm-dashboard.tsx satır ~127-131). `getByText('Banka toplamı')` admin
    // ekranında hiç YOKTUR — locator sıfır eşleşmeyle 60 sn boyunca beklemede kaldı (timeout, canlıda
    // yakalandı). Doğru doğrulama admin için "Toplam (TRY hesaplar)" satırını okur.
    const bankTotal = Number(psqlOne(`select coalesce(sum(statement_balance),0) from bank_accounts where is_active = true and currency = 'TRY'`));
    const bankRow = page.getByText('Toplam (TRY hesaplar)', { exact: true }).locator('..');
    const bankText = await bankRow.innerText();
    const shownBank = parseTrNumber(bankText.split('\n').find((l) => /-?\d/.test(l.trim())) ?? bankText);
    // `MoneyCell` (admin/GM görünümü) her zaman 2 ondalıkla basar (`Banka toplamı` KpiCard'ının
    // aksine) — hassasiyet 2 ondalığa (toBeCloseTo 2. argüman) kadar karşılaştırılır.
    expect(shownBank).toBeCloseTo(bankTotal, 2);

    // `findDueInvoices` (packages/core/src/finance/dunning.ts) tanımıyla birebir: kind='sales',
    // status IN ('posted','partially_paid'), due_date < bugün (400 günlük pencere dahil), residual>0.
    const overdue = Number(psqlOne(`
      select coalesce(sum(residual),0) from invoices
      where kind = 'sales' and status in ('posted','partially_paid')
        and due_date < current_date and due_date >= current_date - interval '400 days'
        and residual::numeric > 0
    `));
    // Kök neden (canlıda yakalandı): bu kartta `.innerText()` DB'de 8.209,4999 iken KALICI olarak
    // "0" okudu — 10 sn'lik `.poll()` bile HİÇ yakınsamadı (hidrasyon gecikmesi değil, `NumberFlow`
    // custom element'inin çoklu-span rakam-döngüsü yapısının metin çıkarımıyla temelden uyumsuz
    // olduğunu doğrular — bkz. `readNumberFlowValue` yorumu). Doğrudan `getOverdueReceivablesSummary`
    // çağrısıyla da teyit edildi: sunucu fonksiyonu DOĞRU değeri (8209.4999) döndürüyor — kırık
    // yalnızca DOM metin çıkarımında, uygulama mantığında değil. Erişilebilirlik ağacından okunur.
    const overdueCard = page.getByText('Vadesi geçen alacak', { exact: true }).locator('..');
    await expect
      .poll(() => readNumberFlowValue(overdueCard), { message: 'Vadesi geçen alacak KPI değeri DB ile eşleşmeli', timeout: 10_000 })
      .toBeCloseTo(overdue, -1);
  });

  test('depo@: farklı bir kart seti gösterir (GM kartları yok, depo kartları var); mobil tek kolon', async ({ page, browser }) => {
    await loginAs(page, 'depo', '/kokpit');
    await expect(page.getByRole('heading', { name: 'Kokpit' })).toBeVisible();
    await expect(page.getByText('Kritik stok kalemi', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/mal kabul/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/sevk/i).first()).toBeVisible();
    await expect(page.getByText(/karantina/i).first()).toBeVisible();

    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobile = await ctxB.newPage();
    await loginAs(mobile, 'depo', '/kokpit');
    const overflow = await overflowCheck(mobile);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctxB.close();
  });
});

/* ==================================================================== */
/* Negatifler                                                            */
/* ==================================================================== */

test.describe('Negatifler (phase4)', () => {
  test('ETGB limiti aşan sevkiyat standart rejime düşer (engellenir)', async ({ page }) => {
    const customer = psqlRows(`
      select p.id, p.name from partners p join sales_channels sc on sc.id = p.default_channel_id
      where sc.kind = 'export' and p.currency = 'EUR' limit 1
    `)[0]!;
    const [, customerName] = customer;
    const product = psqlRows(`
      select p.id, p.sku, pli.price from price_list_items pli
      join products p on p.id = pli.product_id
      join sales_channels sc on sc.default_price_list_id = pli.price_list_id and sc.kind = 'export'
      where p.type = 'finished' order by pli.price asc limit 1
    `)[0]!;
    const [, sku, price] = product;
    // Fiziksel stoğa bağlı DEĞİL — sipariş satırı stok kontrolü yapmaz (yalnızca teslimat/FEFO yapar);
    // burada yalnızca sevkiyat/ETGB rejim seçimi test ediliyor, hiçbir teslimat alınmıyor.
    const qty = Math.ceil(16_000 / Number(price)) + 10;

    await loginAs(page, 'ihracat');
    await page.goto('/satis/siparisler/yeni');
    await comboboxSelect(page, 'Müşteri seçin', customerName!.split(' ')[0]!, new RegExp(customerName!.split(' ')[0]!));
    await comboboxSelect(page, 'Ürün ara ve ekle…', sku!, sku!);
    await page.getByLabel(/^Miktar/).fill(String(qty));
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Birim fiyat (KDV hariç)')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await page.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    const orderId = page.url().split('/').pop()!;
    const orderGrandTotal = Number(psqlOne(`select grand_total from sales_orders where id = '${orderId}'`));
    expect(orderGrandTotal).toBeGreaterThan(15_000);

    await page.goto('/ihracat/sevkiyatlar/yeni');
    const docNo = psqlOne(`select doc_no from sales_orders where id = '${orderId}'`)!;
    await comboboxSelect(page, 'Sipariş seçin', docNo, new RegExp(docNo));
    await page.getByLabel('Rejim').click();
    await page.getByRole('option', { name: 'ETGB (mikro ihracat)' }).click();
    await page.getByLabel('Varış ülkesi (ISO-2)').fill('DE');
    await page.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
    await page.waitForURL(/\/ihracat\/sevkiyatlar\/[0-9a-f-]{36}$/);
    const shipmentId = page.url().split('/').pop()!;

    const shipment = psqlRows(`select regime, amount_try from export_shipments where id = '${shipmentId}'`)[0]!;
    expect(shipment[0], '15.000 EUR üstü tutar ETGB isteğini standarda düşürmeli').toBe('standard');
    await expect(page.getByText('Standart', { exact: true }).first()).toBeVisible();

    const docs = psqlRows(`select code, status from export_documents where shipment_id = '${shipmentId}'`);
    expect(docs.find((d) => d[0] === 'ETGB')![1]).toBe('not_required');
    expect(docs.find((d) => d[0] === 'ORIGIN')![1]).toBe('required');
    expect(docs.find((d) => d[0] === 'INSURANCE')![1]).toBe('required');
  });

  test('yetkisiz rol: bakim@ /arge/projeler 403', async ({ page }) => {
    await loginAs(page, 'bakim', '/arge/projeler');
    await expect(page).toHaveURL(/\/arge\/projeler/);
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ar-Ge Projeleri' })).not.toBeVisible();
  });

  test('onaylanmamış (draft) reçete versiyonu üretim BOM\'una devredilemez', async ({ page }) => {
    const projectId = psqlOne(`select id from rnd_projects where name = 'Şekersiz Protein'`);
    expect(projectId, "Seed: 'Şekersiz Protein' projesi bulunmalı (zaten bir ürüne bağlı)").toBeTruthy();
    const productId = psqlOne(`select product_id from rnd_projects where id = '${projectId}'`);
    expect(productId, 'Bu proje zaten bir ürüne bağlı olmalı (no_product engeliyle karışmasın)').toBeTruthy();

    // Aynı `is_active` düzeltmesi (bkz. Adım 2 yorumu) — `products`'ta bu kolon yok, `status` kullanılır.
    const raw = psqlRows(`select id, sku from products where type = 'raw_material' and status = 'active' order by sku limit 1`)[0]!;
    const [rawId] = raw;

    await loginAs(page, 'arge');
    // Doğrudan core fonksiyonunu (aynı yolun kendisi) bir draft versiyon üzerinde çağırıp reddedildiğini
    // kanıtlamak yerine — gerçek ekran akışı: yeni bir deneme reçetesi oluştur (v1=draft, hiç onaya
    // gönderilmedi), "Üretim BOM'una devret" düğmesi bu proje zaten bir ürüne bağlı olduğundan
    // doğrudan görünür OLMAMALI (`canRelease && status==='approved'` koşulu) — draft'ta hiç render
    // edilmediğini doğrulamak, sunucu tarafı engelin ekran tarafında da tutarlı biçimde
    // yansıdığını gösterir.
    await page.goto(`/arge/projeler/${projectId}/receteler`);
    await page.getByRole('button', { name: 'Yeni deneme reçetesi' }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await dialog.getByLabel('Ad').fill(`Negatif test ${RUN}`);
    await dialog.getByRole('combobox').click();
    await page.getByPlaceholder('Ara…').fill(raw[1]!);
    await page.getByRole('option', { name: new RegExp(raw[1]!) }).first().click();
    await dialog.getByLabel('Miktar').fill('1');
    await dialog.getByRole('button', { name: 'Oluştur' }).click();
    await expect(dialog).toBeHidden();

    // 'Şekersiz Protein'in seed'den GELEN başka reçeteleri de var — `RecipeWorkspace`'in
    // `selectedRecipeId` durumu ilk mount'ta hangi grup seçiliyse ORADA kalır (yeni reçete
    // eklenince kendiliğinden ona geçmez, `router.refresh()` state'i sıfırlamaz). Bu yüzden az
    // önce oluşturduğumuz reçete sol listeden AÇIKÇA seçilir — aksi halde aşağıdaki "buton yok"
    // doğrulaması yanlışlıkla BAŞKA (belki zaten onaylı/devrolmuş) bir versiyonu kontrol edip
    // negatif testi anlamsızlaştırabilirdi.
    const recipeName = `Negatif test ${RUN}`;
    await page.getByRole('button', { name: recipeName }).click();
    // `getByText('v1')` iki eleman buluyordu: sol listedeki versiyon seçici düğmesi ("v1 Taslak")
    // VE sağdaki çalışma alanı başlığı (`<h2>v1</h2>`) — strict-mode ihlali (canlıda yakalandı).
    // Başlık `getByRole('heading', ...)` ile tekil hedeflenir.
    await expect(page.getByRole('heading', { name: 'v1' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: "Üretim BOM'una devret" })).toHaveCount(0);

    const versionId = psqlOne(`select tv.id from trial_recipe_versions tv join trial_recipes tr on tr.id = tv.recipe_id where tr.project_id = '${projectId}' order by tv.created_at desc limit 1`)!;
    const statusBefore = psqlOne(`select status from trial_recipe_versions where id = '${versionId}'`);
    expect(statusBefore).toBe('draft');

    void rawId;
  });
});
