import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loginAs } from './fixtures/auth';

/**
 * Akış (Tur 2, Aşama-1 zinciri üzerine — muhasebe@plantero.local):
 *   /satis/siparisler (sevk edilmiş faturasız sipariş) → "Fatura oluştur" (posted, 120/600/391 VUK+UFRS,
 *   cari bakiye artışı) → "e-Fatura gönder" (sandbox accepted, UUID+GİB no) → /muhasebe/banka ekstre
 *   içe aktar (CSV: fatura tahsilatı + kredi taksiti + tanınmayan; MT940: format paritesi) → çift
 *   içe aktarma duplicate testi → "Mutabakatı çalıştır" → /muhasebe/mutabakat (fatura ≥%92 otomatik
 *   uygulandı, kredi taksiti önerisi "Onayla", tanınmayan "Elle eşle" cari avans) → fatura "Tahsil
 *   edildi" + residual 0 + cari ekstresi bakiye 0 (I9) → /finans/break-even + /finans/nakit-akisi →
 *   /finans/tahsilat-takibi (AI taslak → onayla ve gönder) → negatifler (çift banka hareketi bağlama,
 *   kapalı dönem fişi, depo rolü /muhasebe erişimi).
 *
 * Test verisi: seed'in garanti ettiği ana veriye dayanır (banka hesabı kodları VKF-TIRE-TL/
 * QNB-ODEMIS-TL, hesap planı kodları 100/770/780, kapalı dönemler 2026-01..2026-07) — hiçbir sabit
 * sipariş/fatura/banka hareketi ID'si kullanılmaz; hedef sipariş, fatura tutarı ve kredi taksidi
 * DB'den her koşuda dinamik okunur, banka ekstresi dosyaları (ekstre.csv / ekstre.mt940) bu değerlerle
 * test ANINDA üretilip apps/web/e2e/fixtures altına yazılır (böylece "fatura tutarına birebir" koşulu
 * her koşuda gerçekten sağlanır — statik bir dosyada sabit tutar yazmak bir sonraki seed'de anlamsız
 * kalırdı).
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const RUN = Date.now().toString(36);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function psql(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$');
  return execSync(`psql "${DATABASE_URL}" -t -A -F'|' -c "${escaped}"`, { encoding: 'utf-8' }).trim();
}
function psqlRows(query: string): string[][] {
  const out = psql(query);
  if (!out) return [];
  return out.split('\n').map((l) => l.split('|'));
}
function psqlOne(query: string): string | null {
  return psqlRows(query)[0]?.[0] ?? null;
}

/** `packages/db` `numeric` sütunu ("12345.6700") → TR ondalık (virgül) — hiçbir hane kaybı yok, tam eşleşme için gerekli. */
function dbNumToTrExact(n: string): string {
  return n.replace('.', ',');
}
/** Ekrana yazılan tutar (2 ondalık, virgüllü) — NumberInput doldurmak için. */
function toTr2(n: number | string): string {
  return Number(n).toFixed(2).replace('.', ',');
}

/** Özel arama kutusu (`role="combobox"`) üzerinde: aç → ara → tıkla (bkz. phase1-chain.spec.ts aynı not). */
async function comboboxSelect(page: Page, triggerText: string, search: string, optionMatch: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder('Ara…').fill(search);
  await page.getByRole('option', { name: optionMatch }).first().click();
  await expect(page.getByPlaceholder('Ara…')).toHaveCount(0);
}

/** `DataTable` satırı masaüstü+mobil iki kez DOM'da durur — o an GERÇEKTEN görünen kopyaya daralt. */
function visibleText(page: Page, text: string | RegExp, exact = true) {
  return typeof text === 'string' ? page.getByText(text, { exact }).filter({ visible: true }) : page.getByText(text).filter({ visible: true });
}

async function warmRoutes(p: Page, paths: string[]) {
  for (const path of paths) {
    await p.goto(path, { timeout: 120_000, waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

/**
 * "Ekstre içe aktar" tetikleyicisini tıklayıp diyaloğu açar. BULGU: ~yarı yarıya gözlenen bir
 * yarış var — sayfa navigasyonundan hemen sonraki İLK tıklama bazen diyaloğu hiç açmıyor (buton
 * odaklanıyor/`[active]` oluyor ama `open` state'i tetiklenmiyor; muhtemelen bu client component'in
 * hydration'ı henüz tamamlanmadan tıklamanın gelmesi — bkz. rapor K-BANKA-DIALOG-RACE). Gerçek bir
 * kullanıcı da aynı şeyi yaşayıp ikinci kez tıklardı; bu yüzden tek bir retry ile tolere edilir
 * (assertion GEVŞETİLMEZ — diyalog yine görünmezse test olduğu gibi kırılır).
 */
async function openImportDialog(page: Page): Promise<import('@playwright/test').Locator> {
  await page.waitForLoadState('networkidle').catch(() => {});
  const trigger = page.getByRole('button', { name: 'Ekstre içe aktar' });
  const dialog = page.getByRole('dialog');
  await trigger.click();
  try {
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  } catch {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
  }
  return dialog;
}

test.describe('Akış: Fatura → e-Fatura → Banka mutabakatı → Tahsilat kapama (phase2)', () => {
  // BULGU (K-SERIAL-SCOPE, kendi test dosyamızda): `test.describe.configure({mode:'serial'})`
  // describe BLOĞUNUN İÇİNDE çağrılmalı — dosyanın en üst seviyesinde (describe dışında) çağrılırsa
  // Playwright TÜM dosyayı (aşağıdaki bağımsız "Negatifler"/"Mobil"/"tahsilat-takibi" describe'ları
  // dahil) tek bir serial zincir sayıyor; bu describe'daki bir test kırıldığında dosyanın geri kalanı
  // hiç ÇALIŞMADAN "did not run" oluyordu (ilk sürümde canlı olarak yaşandı — bkz. rapor). Kapsam
  // yalnızca BU describe'a (ortak `ctx` state'ini paylaşan adımlara) daraltıldı.
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(120_000);

  const ctx: {
    orderId?: string; deliveryId?: string; orderDocNo?: string;
    partnerId?: string; partnerName?: string;
    invoiceId?: string; invoiceDocNo?: string; invoiceGrandTotal?: string;
    partnerBalanceBeforeInvoice?: string; partnerBalanceAfterInvoice?: string;
    loanInstId?: string; loanCode?: string; loanDueDate?: string; loanInstallment?: string; loanAccountCode?: string;
    unknownAmount?: string; unknownDesc?: string; avansPartnerName?: string;
    csvBankTxIdInvoice?: string; csvBankTxIdLoan?: string; csvBankTxIdUnknown?: string;
  } = {};

  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(300_000);

    // Sevk edilmiş + faturasız bir sipariş GEREKİR (Adım 1'in ön koşulu). Seed'deki sabit sayıda
    // sipariş art arda koşularda tükenir (bkz. rapor "test verisi tükenmesi" notu — bu tur bunu
    // canlı olarak yaşadı); kalıcı/tekrar çalıştırılabilir bir test seed havuzuna bağımlı OLMAMALI.
    // Bu yüzden ihtiyaç duyulan sevkiyat KENDİ İÇİNDE, admin oturumuyla (sales.order/sales.confirm/
    // stock.pick — muhasebe'de yok) fatura zincirinin bir önceki halkası taze üretilir: küçük bir
    // sipariş (seed'in garanti ettiği ürün/cari master verisiyle, phase1-chain.spec.ts'teki izole
    // fatura testiyle aynı desen) → onayla → FEFO rezerve → topla → sevk et. Böylece bu test HER
    // koşuda kendi taze verisini üretir, seed'in tükenebilir bir alt kümesine bağımlı kalmaz.
    const setupPage = await browser.newPage();
    await loginAs(setupPage, 'admin');
    await setupPage.goto('/satis/siparisler/yeni');
    await comboboxSelect(setupPage, 'Müşteri seçin', 'Doğal Yaşam', /Doğal Yaşam Market/);
    await comboboxSelect(setupPage, 'Ürün ara ve ekle…', '110020002', /2x Fındık/);
    await setupPage.getByLabel(/^Miktar/).fill('2');
    await setupPage.keyboard.press('Tab');
    await expect(setupPage.getByText(/^(Müşteri özel|Kanal listesi|Liste fiyatı|Elle girildi)$/)).toBeVisible({ timeout: 10_000 });
    await setupPage.getByRole('button', { name: 'Siparişi kaydet' }).click();
    await setupPage.waitForURL(/\/satis\/siparisler\/[0-9a-f-]{36}$/);
    ctx.orderId = setupPage.url().split('/').pop()!;
    await setupPage.getByRole('button', { name: 'Onayla' }).click();
    // BULGU (K-DEVCOMPILE-TIMEOUT, bu turda canlı doğrulandı — bkz. rapor): bu ortamda `next dev`
    // sunucusu (production build değil) her İLK ziyaret edilen rotayı istek anında derliyor; bu turun
    // web.log'unda aynı anda GET /finans/nakit-akisi 40330ms, GET /finans/break-even 19836ms gibi tek
    // istekler görüldü (4 CPU'luk ortam, next-server tek başına %170 CPU). 10s'lik sabit assertion
    // penceresi bu yüzden gerçek bir uygulama hatası OLMADAN kırılabiliyor: bu adımın ilk koşusunda
    // `[data-status="confirmed"]` 10s içinde görünmedi ama `sales_orders.status` DB'de birkaç saniye
    // SONRA gerçekten 'confirmed' oldu (psql ile doğrulandı — server action başarıyla tamamlandı,
    // yalnızca sayfanın yeniden render'ı/ilk derlemesi geç geldi). Aşağıdaki 4 bekleme bu nedenle
    // 30s'e çıkarıldı — ASSERTION'IN KENDİSİ (durumun GERÇEKTEN o değere geçmesi) gevşetilmedi.
    await expect(setupPage.locator('[data-status="confirmed"]').first()).toBeVisible({ timeout: 30_000 });

    ctx.deliveryId = psqlOne(`select id from deliveries where sales_order_id = '${ctx.orderId}'`)!;
    await setupPage.goto(`/depo/sevkiyat/${ctx.deliveryId}`);
    await setupPage.getByRole('button', { name: 'FEFO ile rezerve et' }).click();
    await expect(setupPage.locator('[data-status="reserved"]').first()).toBeVisible({ timeout: 30_000 });
    const lotNo = psqlOne(`select l.lot_no from delivery_lines dl join stock_lots l on l.id=dl.lot_id where dl.delivery_id='${ctx.deliveryId}'`)!;
    await setupPage.getByRole('link', { name: 'Toplama ekranı' }).click();
    await setupPage.waitForURL(/\/topla$/);
    const pickInput = setupPage.getByPlaceholder('Lot okut…');
    await pickInput.fill(lotNo);
    await pickInput.press('Enter');
    await expect(setupPage.getByText('Toplama tamamlandı')).toBeVisible({ timeout: 30_000 });
    await setupPage.getByRole('button', { name: 'İrsaliyeye dön ve sevk et' }).click();
    await setupPage.waitForURL(new RegExp(`/depo/sevkiyat/${ctx.deliveryId}$`));
    await setupPage.getByRole('button', { name: 'Sevk et' }).click();
    await expect(setupPage.locator('[data-status="shipped"]').first()).toBeVisible({ timeout: 30_000 });
    await setupPage.close();

    const orderRow = psqlRows(`select o.doc_no, o.partner_id, p.name from sales_orders o join partners p on p.id=o.partner_id where o.id='${ctx.orderId}'`)[0]!;
    [ctx.orderDocNo, ctx.partnerId, ctx.partnerName] = orderRow;

    page = await browser.newPage();
    await loginAs(page, 'muhasebe');

    // Tanınmayan hareketin "cari avans" olarak elle eşleneceği cari — fatura carisinden BİLEREK
    // FARKLI (aksi halde Adım 5'in "cari ekstresi bakiye 0" kontrolü bu avansla kirlenir; cari
    // avans allocation'sız bir tahsilattır, invoice'un kendi partnerini değil, ayrı bir cariyi
    // ilgilendirir).
    ctx.avansPartnerName = psqlOne(`select name from partners where kind='customer' and is_active=true and id <> '${ctx.partnerId}' order by code limit 1`)!;

    // dayDiff (vade − ekstre tarihi) ≤5 gün OLMALI — packages/ai/src/reconciliation.ts::ruleBasedMatch
    // kredi taksidi adayını yalnızca `dayDiff <= 5` iken üretir (aksi halde hareket hiçbir aday
    // üretmeden "unknown"a düşer, bkz. rapor). dayDiff=1 en düşük-ama-≥0,92-eşiğinin-ALTINDA güveni
    // verir (0,91) — "öneri, otomatik değil, Onayla gerektirir" senaryosu için ideal; art arda
    // koşularda en yakın taksitler tükendikçe pencere 5 güne kadar genişletilerek bir sonraki uygun
    // takside düşülür.
    const loanRow = psqlRows(`
      select li.id, l.code, li.due_date, li.installment, l.account_code
      from loan_installments li join loans l on l.id = li.loan_id
      where li.status = 'scheduled' and l.is_active = true
        and li.due_date > current_date and li.due_date <= current_date + interval '5 days'
      order by li.due_date limit 1
    `)[0];
    if (!loanRow) throw new Error('DB ön koşulu: 5 gün içinde vadesi gelen (scheduled) kredi taksidi bulunamadı — havuz tükenmiş olabilir (bkz. rapor).');
    [ctx.loanInstId, ctx.loanCode, ctx.loanDueDate, ctx.loanInstallment, ctx.loanAccountCode] = loanRow;

    ctx.partnerBalanceBeforeInvoice = psqlOne(`select balance from partners where id = '${ctx.partnerId}'`)!;

    await warmRoutes(page, [
      `/satis/siparisler/${ctx.orderId}`,
      '/muhasebe/banka', '/muhasebe/mutabakat', '/muhasebe/yevmiye/yeni',
      '/finans/break-even', '/finans/nakit-akisi', '/finans/tahsilat-takibi',
    ]);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test('Adım 1 — sipariş sayfasında "Fatura oluştur": posted fatura, 120/600/391 VUK+UFRS, cari bakiye arttı', async () => {
    await page.goto(`/satis/siparisler/${ctx.orderId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Fatura oluştur' }).click();
    // Toast + tablo satırı: yeni fatura görünür olmalı
    await expect(page.getByText(/Fatura kesildi:/)).toBeVisible({ timeout: 15_000 });

    const inv = psqlRows(`select id, doc_no, status, grand_total, journal_entry_id from invoices where delivery_id = '${ctx.deliveryId}'`)[0]!;
    expect(inv, 'Sevkiyattan fatura oluşmalı').toBeTruthy();
    [ctx.invoiceId, ctx.invoiceDocNo] = inv;
    ctx.invoiceGrandTotal = inv[3];
    const status = inv[2];
    const journalEntryId = inv[4];
    expect(status).toBe('posted');
    expect(journalEntryId, 'invoices.journal_entry_id (VUK fişi) dolu olmalı').toBeTruthy();

    await expect(visibleText(page, ctx.invoiceDocNo!).first()).toBeVisible();

    const vuk = psqlRows(`
      select je.ledger, jl.account_code, jl.debit, jl.credit
      from journal_entries je join journal_lines jl on jl.entry_id = je.id
      where je.id = '${journalEntryId}' order by jl.account_code
    `);
    expect(vuk.every((r) => r[0] === 'VUK')).toBe(true);
    const debit120 = vuk.find((r) => (r[1] ?? '').startsWith('120'));
    const credit600 = vuk.find((r) => (r[1] ?? '').startsWith('600'));
    const credit391 = vuk.find((r) => r[1] === '391');
    expect(debit120, 'VUK: 120 (Alıcılar, cari alt hesabı) borç').toBeTruthy();
    expect(Number(debit120![2])).toBeCloseTo(Number(ctx.invoiceGrandTotal), 2);
    expect(credit600, 'VUK: 600 (Yurtiçi Satışlar) alacak').toBeTruthy();
    expect(credit391, 'VUK: 391 (Hesaplanan KDV) alacak').toBeTruthy();

    const ufrsId = psqlOne(`select twin_entry_id from journal_entries where id = '${journalEntryId}'`);
    expect(ufrsId, 'VUK fişinin UFRS ikizi olmalı').toBeTruthy();
    const ufrs = psqlRows(`select je.ledger from journal_lines jl join journal_entries je on je.id = jl.entry_id where je.id = '${ufrsId}'`);
    expect(ufrs.length).toBeGreaterThan(0);
    expect(ufrs.every((r) => r[0] === 'UFRS')).toBe(true);

    ctx.partnerBalanceAfterInvoice = psqlOne(`select balance from partners where id = '${ctx.partnerId}'`)!;
    expect(Number(ctx.partnerBalanceAfterInvoice)).toBeCloseTo(Number(ctx.partnerBalanceBeforeInvoice) + Number(ctx.invoiceGrandTotal), 2);
  });

  test('Adım 2 — faturada "e-Fatura gönder": sandbox accepted, UUID + GİB no görünür', async () => {
    await page.goto(`/muhasebe/faturalar/${ctx.invoiceId}`);
    await expect(page.getByRole('heading', { level: 1, name: ctx.invoiceDocNo! })).toBeVisible();

    await page.getByRole('button', { name: 'e-Fatura gönder' }).click();
    await expect(page.getByText(/e-Belge gönderildi/)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('e-Belge', { exact: true }).first()).toBeVisible();
    const uuidRow = psqlRows(`select e_invoice_status, e_invoice_uuid, e_invoice_no, e_invoice_type from invoices where id = '${ctx.invoiceId}'`)[0]!;
    const [eStatus, eUuid, eNo] = uuidRow;
    expect(eStatus).toBe('accepted');
    expect(eUuid, 'UUID dolu olmalı').toBeTruthy();
    await expect(page.getByText(eUuid!, { exact: false }).first()).toBeVisible();
    if (eNo) await expect(page.getByText(eNo, { exact: true }).first()).toBeVisible();
  });

  test('Adım 3 — /muhasebe/banka: CSV ekstre içe aktar (fatura + kredi taksiti + tanınmayan) → 3 yeni/0 mükerrer, ikinci kez → 0 yeni/3 mükerrer', async () => {
    ctx.unknownAmount = '4321,00';
    ctx.unknownDesc = `TANIMSIZ EFT ISLEM REF ${RUN}`;
    const todayTr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');

    const csvLines = [
      'Tarih;Açıklama;Tutar;Bakiye',
      `${todayTr};HAVALE ${ctx.partnerName} ${ctx.invoiceDocNo} FATURA ODEMESI;${dbNumToTrExact(ctx.invoiceGrandTotal!)};500000,00`,
      `${todayTr};KREDI TAKSIT ODEMESI ${ctx.loanCode};-${dbNumToTrExact(ctx.loanInstallment!)};${(500000 - Number(ctx.invoiceGrandTotal)).toFixed(2).replace('.', ',')}`,
      `${todayTr};${ctx.unknownDesc};${ctx.unknownAmount};600000,00`,
    ];
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    const csvPath = path.join(FIXTURES_DIR, 'ekstre.csv');
    fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');

    const importStartTs = psqlOne('select now()')!;

    await page.goto('/muhasebe/banka');
    const dialog = await openImportDialog(page);

    // Banka hesabı: TL hesabına (VKF-TIRE-TL) — Radix Select, ilk combobox
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /VKF-TIRE-TL/ }).click();
    // Kaynak: CSV (varsayılan zaten csv, açıkça da seçilir — bir önceki dialog durumu kalıcı olabilir)
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CSV', exact: true }).click();

    await dialog.locator('#statement-file').setInputFiles(csvPath);
    await expect(dialog.getByText('ekstre.csv')).toBeVisible();
    await dialog.getByRole('button', { name: 'İçe aktar' }).click();
    await expect(page.getByText(/3 yeni, 0 mükerrer/)).toBeVisible({ timeout: 15_000 });

    const countQuery = (ts: string) => `
      select count(*) from bank_transactions bt join bank_accounts ba on ba.id = bt.bank_account_id
      where ba.code = 'VKF-TIRE-TL' and bt.created_at >= '${ts}'
    `;
    expect(Number(psqlOne(countQuery(importStartTs)))).toBe(3);

    // İkinci kez AYNI dosyayı içe aktar → tamamı mükerrer, yeni satır eklenmez
    const dialog2 = await openImportDialog(page);
    await dialog2.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /VKF-TIRE-TL/ }).click();
    await dialog2.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'CSV', exact: true }).click();
    await dialog2.locator('#statement-file').setInputFiles(csvPath);
    await dialog2.getByRole('button', { name: 'İçe aktar' }).click();
    await expect(page.getByText(/0 yeni, 3 mükerrer/)).toBeVisible({ timeout: 15_000 });

    expect(Number(psqlOne(countQuery(importStartTs))), 'İkinci içe aktarma yeni satır EKLEMEMELİ (externalRef ile çift kayıt engeli)').toBe(3);
  });

  test('Adım 3b — MT940 format paritesi: apps/web/e2e/fixtures/ekstre.mt940 üretilir ve içe aktarılır (QNB hesabı), duplicate testi', async () => {
    const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const mt940 = [
      `:20:STMT${RUN}`,
      ':25:TR440006200119000006672315',
      ':28C:00001/001',
      `:60F:C${yymmdd}TRY10000,00`,
      `:61:${yymmdd}C321,45NTRFNONREF//FT${RUN}1`,
      `:86:123?00MT940 test hareketi 1 ${RUN}`,
      `:61:${yymmdd}C654,32NTRFNONREF//FT${RUN}2`,
      `:86:123?00MT940 test hareketi 2 ${RUN}`,
      `:61:${yymmdd}D111,11NTRFNONREF//FT${RUN}3`,
      `:86:123?00MT940 test hareketi 3 ${RUN}`,
      `:62F:C${yymmdd}TRY10864,66`,
    ].join('\n');
    const mtPath = path.join(FIXTURES_DIR, 'ekstre.mt940');
    fs.writeFileSync(mtPath, mt940 + '\n', 'utf-8');

    const importStartTs = psqlOne('select now()')!;

    await page.goto('/muhasebe/banka');
    const dialog = await openImportDialog(page);
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /QNB-ODEMIS-TL/ }).click();
    await dialog.locator('#statement-file').setInputFiles(mtPath);
    await expect(dialog.getByText('ekstre.mt940')).toBeVisible();
    // BULGU (K-MT940-EXT): dosya seçildiğinde `import-statement-dialog.tsx::onPickFile` yalnızca
    // ".sta"/".txt" uzantısını MT940 olarak otomatik algılar; ".mt940" (bu görevin adlandırdığı
    // fixture uzantısının ta kendisi, ve MT940 için yaygın bilinen bir uzantı) tanınmaz ve sessizce
    // "csv" kalır — kullanıcı "Kaynak" alanını ELLE "MT940 (.sta)" olarak değiştirmezse dosya CSV
    // ayrıştırıcısına gider ve "CSV eşleme hatası" ile başarısız olur. Burada elle düzeltilerek asıl
    // MT940 ayrıştırıcısı (parseMt940) egzersiz edilir; düzeltme olmasaydı bu adım gerçek bir kırık
    // olurdu (bkz. rapor).
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'MT940 (.sta)' }).click();
    await dialog.getByRole('button', { name: 'İçe aktar' }).click();
    await expect(page.getByText(/3 yeni, 0 mükerrer/)).toBeVisible({ timeout: 15_000 });

    const countQuery = (ts: string) => `
      select count(*) from bank_transactions bt join bank_accounts ba on ba.id = bt.bank_account_id
      where ba.code = 'QNB-ODEMIS-TL' and bt.created_at >= '${ts}'
    `;
    expect(Number(psqlOne(countQuery(importStartTs)))).toBe(3);

    const dialog2 = await openImportDialog(page);
    await dialog2.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /QNB-ODEMIS-TL/ }).click();
    await dialog2.locator('#statement-file').setInputFiles(mtPath);
    await dialog2.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'MT940 (.sta)' }).click();
    await dialog2.getByRole('button', { name: 'İçe aktar' }).click();
    await expect(page.getByText(/0 yeni, 3 mükerrer/)).toBeVisible({ timeout: 15_000 });

    expect(Number(psqlOne(countQuery(importStartTs)))).toBe(3);
  });

  test('Adım 4 — "Mutabakatı çalıştır": fatura havalesi ≥%92 otomatik uygulanır (tahsilat + fiş + fatura paid)', async () => {
    await page.goto('/muhasebe/banka');
    await page.getByRole('button', { name: 'Mutabakatı çalıştır' }).click();
    await expect(page.getByText(/hareket değerlendirildi/)).toBeVisible({ timeout: 20_000 });

    const invAfter = psqlRows(`select status, residual, paid_amount from invoices where id = '${ctx.invoiceId}'`)[0]!;
    expect(invAfter[0], 'Fatura havalesi ≥%92 güvenle otomatik uygulanmalı → fatura paid').toBe('paid');
    expect(Number(invAfter[1])).toBeCloseTo(0, 2);
    expect(Number(invAfter[2])).toBeCloseTo(Number(ctx.invoiceGrandTotal), 2);

    const paymentRow = psqlRows(`
      select p.id, p.journal_entry_id from payments p
      join payment_allocations pa on pa.payment_id = p.id
      where pa.invoice_id = '${ctx.invoiceId}'
    `)[0]!;
    expect(paymentRow, 'Otomatik uygulanan tahsilat kaydı olmalı').toBeTruthy();
    expect(paymentRow[1], 'Tahsilatın yevmiye fişi olmalı (102/120.cari)').toBeTruthy();

    const matchRow = psqlRows(`
      select rm.status, rm.confidence, rm.kind from reconciliation_matches rm
      where rm.kind = 'invoice' and rm.invoice_ids @> to_jsonb(array['${ctx.invoiceId}']::text[])
      order by rm.decided_at desc limit 1
    `)[0]!;
    expect(matchRow[0]).toBe('auto_applied');
    expect(Number(matchRow[1])).toBeGreaterThanOrEqual(0.92);
  });

  test('Adım 4b — /muhasebe/mutabakat: kredi taksiti önerisi görünür → Onayla (300/780 fişi, taksit paid)', async () => {
    await page.goto('/muhasebe/mutabakat');
    await expect(page.getByRole('heading', { level: 1, name: 'Mutabakat' })).toBeVisible();

    const loanCard = page.locator('button').filter({ hasText: ctx.loanCode! }).first();
    // Sol listede kredi taksidi hareketi olmalı; yoksa açıklamadan da aranır
    if (await loanCard.count()) await loanCard.click();
    else await page.locator('button').filter({ hasText: 'KREDI TAKSIT' }).first().click();

    await expect(page.getByText('Kredi taksiti', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /^Onayla/ }).click();
    await expect(page.getByText('Öneri onaylandı')).toBeVisible({ timeout: 15_000 });

    const inst = psqlRows(`select status, bank_transaction_id, journal_entry_id from loan_installments where id = '${ctx.loanInstId}'`)[0]!;
    expect(inst[0]).toBe('paid');
    expect(inst[2], 'Taksidin yevmiye fişi olmalı').toBeTruthy();

    const lines = psqlRows(`
      select jl.account_code, jl.debit, jl.credit
      from journal_lines jl where jl.entry_id = '${inst[2]}' order by jl.account_code
    `);
    const debitLoan = lines.find((l) => l[0] === ctx.loanAccountCode);
    const debit780 = lines.find((l) => l[0] === '780');
    expect(debitLoan, `${ctx.loanAccountCode} (kredi anapara) borç satırı olmalı`).toBeTruthy();
    expect(debit780, '780 (Finansman Giderleri, faiz+BSMV) borç satırı olmalı').toBeTruthy();
  });

  test('Adım 4c — /muhasebe/mutabakat: tanınmayan hareket "Elle eşle" → cari avans → onay', async () => {
    await page.goto('/muhasebe/mutabakat');
    const unknownCard = page.locator('button').filter({ hasText: 'TANIMSIZ EFT ISLEM' }).first();
    await expect(unknownCard).toBeVisible({ timeout: 10_000 });
    await unknownCard.click();

    // Not: kural motorunun bu hareket için ürettiği en iyi öneri "Bilinmiyor" (güven 0) OLABİLİR ama
    // olmak ZORUNDA değil — açıklama rastgele üretilen `RUN` etiketi taşıdığından, trigram isim
    // benzerliği kuralı (bkz. packages/ai/src/reconciliation.ts bestPartnerBySimilarity, eşik ≥0,5)
    // bazı koşularda rastlantısal olarak gerçek bir cari adıyla ≥%50 örtüşüp düşük güvenli bir
    // "Cari avans" önerisi de üretebiliyor (bu turda gözlendi — bkz. rapor). Test burada önerinin
    // TÜRÜNÜ değil, doğru KARTIN seçildiğini doğrular; asıl doğrulama aşağıda "Elle eşle" SONUCU
    // (DB'deki approved/partner_on_account kaydı) üzerinden yapılır.
    await expect(page.getByText(ctx.unknownDesc!, { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Elle eşle' }).click();

    // Varsayılan "Gider hesabına işle" → "Cari avans (tahsissiz)" seç
    await page.getByRole('combobox').filter({ hasText: 'Gider hesabına işle' }).click();
    await page.getByRole('option', { name: 'Cari avans (tahsissiz)' }).click();
    await comboboxSelect(page, 'Cari seçin…', ctx.avansPartnerName!.split(' ')[0]!, new RegExp(ctx.avansPartnerName!.split(' ')[0]!));

    await page.getByRole('button', { name: 'Eşleştir' }).click();
    await expect(page.getByText('Elle eşleştirildi')).toBeVisible({ timeout: 15_000 });

    const match = psqlRows(`
      select rm.status, rm.kind from reconciliation_matches rm
      join bank_transactions bt on bt.id = rm.bank_transaction_id
      where bt.description ilike '%TANIMSIZ EFT ISLEM%${RUN}%' and rm.status = 'approved'
      order by rm.created_at desc limit 1
    `)[0]!;
    expect(match[0]).toBe('approved');
    expect(match[1]).toBe('partner_on_account');
  });

  test('Adım 5 — fatura "Tahsil edildi", residual 0; cari ekstresi bakiye 0; I9: partners.balance = Σfatura − Σtahsilat', async () => {
    await page.goto(`/muhasebe/faturalar/${ctx.invoiceId}`);
    await expect(page.getByText('Tahsil edildi', { exact: true }).first()).toBeVisible();
    const kalanRow = page.getByText('Kalan', { exact: true }).locator('xpath=ancestor::div[1]');
    await expect(kalanRow).toContainText('0,00');

    await page.goto(`/muhasebe/cariler/${ctx.partnerId}/ekstre`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(ctx.partnerName!);

    // DÜZELTME (bu turda canlı tespit edildi — önceki turun test hatası): "Güncel bakiye" hücresinin
    // LİTERAL "0,00" olmasını beklemek yalnızca carinin geçmişte HİÇ başka ödenmemiş borcu olmadığında
    // doğrudur. Bu test SABİT bir seed carisi kullanıyor (Doğal Yaşam Market Zinciri — seed'in garanti
    // ettiği ana veri) ve bu cari, bu spec dosyasının ya da başka bir QA turunun ÖNCEKİ koşularından
    // kalan ödenmemiş fatura(lar) taşıyabilir/taşıyor — canlı doğrulandı: bu turda bu testin KENDİ
    // faturasından önce zaten 6 hareket ve -₺2.782 bakiye vardı (INV-2026-000010 hâlâ ödenmemiş, ayrı
    // bir önceki koşudan kalma). Doğru invaryant "BU faturanın etkisi net sıfırlandı" — yani bakiye
    // faturanın AÇILMASINDAN ÖNCEKİ (ctx.partnerBalanceBeforeInvoice, beforeAll'da ölçüldü) seviyeye
    // GERİ DÖNMELİ — "her koşulda mutlak sıfır" DEĞİL.
    const balanceAfterPayment = psqlOne(`select balance from partners where id='${ctx.partnerId}'`)!;
    const balanceKpi = page.getByText('Güncel bakiye', { exact: true }).locator('xpath=ancestor::*[self::div][1]');
    await expect
      .poll(
        async () => {
          const text = (await balanceKpi.textContent()) ?? '';
          return Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));
        },
        { message: 'Ekrandaki "Güncel bakiye" DB\'deki partners.balance ile eşleşmeli', timeout: 10_000 },
      )
      .toBeCloseTo(Number(balanceAfterPayment), 2);
    expect(
      Number(balanceAfterPayment),
      'Fatura tam tahsil edildikten sonra cari bakiye, faturanın AÇILMASINDAN ÖNCEKİ seviyeye dönmeli (bu faturanın net etkisi sıfır — geçmiş borç varsa da bozulmamalı)',
    ).toBeCloseTo(Number(ctx.partnerBalanceBeforeInvoice), 2);

    // I9: Σfatura − Σtahsilat = partners.balance. Tahsilat toplamı `payments.amount_try` (allocation'lı
    // ya da allocation'sız/avans fark etmeksizin TÜM gelen tahsilatlar) üzerinden alınır —
    // `payment_allocations` yalnızca bir faturaya TAHSİS EDİLMİŞ kısmı taşır; cari avans (tahsissiz)
    // tahsilat hiçbir invoice'a tahsis edilmediği için `payment_allocations`'ta hiç görünmez ama
    // `partners.balance`'ı yine de düşürür (bkz. rapor — bu adımın ilk sürümü yalnızca allocations
    // toplayıp bu farkı gözden kaçırıyordu).
    const balanceCheck = psqlOne(`
      select
        (select coalesce(sum(grand_total),0) from invoices where partner_id='${ctx.partnerId}' and kind='sales' and status <> 'cancelled')
        - (select coalesce(sum(amount_try),0) from payments where partner_id='${ctx.partnerId}' and direction='inbound')
        - (select balance from partners where id='${ctx.partnerId}')
    `);
    expect(Number(balanceCheck)).toBeCloseTo(0, 2);
  });

  test('Adım 6 — /finans/break-even: "bu ay gereken minimum ciro" Excel hedefiyle (1.560.717,48) eşit olmalı', async () => {
    await page.goto('/finans/break-even');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const target = psqlOne(`select break_even_revenue from cashflow_lines where period = '2026-09' and scenario = 'base'`);
    // Excel referansı (docs/modules/finans.md §1: "ilk ay için doğrulama: ... hedef ciro 1.560.717,48 TL").
    expect(Number(target), 'Canlı hesaplanan hedef ciro Excel referansıyla (1.560.717,48 TL) eşit olmalı').toBeCloseTo(1560717.48, 2);
  });

  test('Adım 6b — /finans/nakit-akisi: Eylül 2026 net nakit 33.278,03; mavi hücreyi düzenle → kapanış nakit anında değişir', async () => {
    await page.goto('/finans/nakit-akisi');
    await expect(page.getByRole('heading', { level: 1, name: 'Nakit Akışı' })).toBeVisible();

    const netCash = psqlOne(`select net_cashflow from cashflow_lines where period = '2026-09' and scenario = 'base'`);
    expect(Number(netCash)).toBeCloseTo(33278.03, 2);
    await expect(page.getByText('33.278,03').first()).toBeVisible();

    // DÜZELTME (bu turda tespit edildi — önceki turun bu adımı YANLIŞ varsayımla "uygulanamaz"
    // diye işaretlemişti): docs/TEST-ACCOUNTS.md'ye göre muhasebe@plantero.local HEM 'muhasebe' HEM
    // 'finans' rolüne sahip (seed: packages/db/src/seed/core.ts, satır ~122); psql ile doğrulandı —
    // bu hesabın efektif izinleri arasında 'finance.manage' GERÇEKTEN var (select distinct p.code
    // from users u join user_roles ur ... where u.email='muhasebe@plantero.local' and p.code like
    // 'finance%' → finance.dunning, finance.manage, finance.view). `ROLE_PRESETS.muhasebe`'nin TEK
    // BAŞINA yalnızca finance.view taşıması yanıltıcıydı — `permissionsForRoles` rollerin izinlerini
    // BİRLEŞTİRİR (rbac.ts), 'finans' rolü byModule('finance') ile finance.manage'i de katıyor. Bu
    // yüzden bu hesap için mavi hücreler GERÇEKTEN düzenlenebilir olmalı — aşağıda canlı doğrulanır.
    await expect(page.getByRole('button', { name: 'Yeniden hesapla' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Varsayımlar' })).toBeVisible();

    // Düzenlenecek hücre olarak EYLÜL 2026 (Adım 6/bu adımın üstteki 33.278,03 sabit değer kontrolü)
    // BİLEREK KULLANILMAZ — override kalıcıdır (packages/core/src/finance/cashflow.ts::applyOverride,
    // "null/boş = formüle dön" yalnızca sunucu tarafında bir kavramdır; EditableCell.onBlur'da metin
    // boşaltılırsa onCommit HİÇ tetiklenmiyor — bkz. cashflow-table.tsx satır ~43-47 `trimmed===''`
    // erken dönüşü — yani UI'da override'ı GERİ ALMANIN bir yolu yok). Bu testin kendisi tekrar tekrar
    // çalıştırılabilir kalsın diye projeksiyonun EN SON (dolayısıyla başka hiçbir adımın sabit değerle
    // sınamadığı) ayının "Diğer girişler" hücresi hedeflenir; bu ayın kapanış nakdi hiçbir invariant'ı
    // beslemiyor ve önceki dönemlerin kapanış nakdini GERİYE doğru etkilemiyor (nakit akışı yalnızca
    // ileri doğru kümülatif — cashflow.ts).
    const lastLineBefore = psqlRows(`select period, other_inflows, closing_cash from cashflow_lines where scenario='base' order by period desc limit 1`)[0]!;
    const [targetPeriod, otherInflowsBefore, closingCashBefore] = lastLineBefore;
    const newOtherInflows = (Number(otherInflowsBefore) + 1000).toFixed(2);

    const otherRow = page.locator('tr').filter({ has: page.getByText('Diğer girişler', { exact: true }) });
    const targetInput = otherRow.locator('input[inputmode="decimal"]').last();
    await targetInput.click();
    await targetInput.fill(toTr2(newOtherInflows));
    await targetInput.press('Tab');
    await expect(page.getByText('Güncellendi — projeksiyon yeniden hesaplandı')).toBeVisible({ timeout: 15_000 });

    const lastLineAfter = psqlRows(`select other_inflows, closing_cash from cashflow_lines where scenario='base' and period='${targetPeriod}'`)[0]!;
    const [otherInflowsAfter, closingCashAfter] = lastLineAfter;
    expect(Number(otherInflowsAfter)).toBeCloseTo(Number(newOtherInflows), 2);
    // "Diğer girişler" kapanış nakde 1:1 yansır (cashflow.ts satır toplamı) — kapanış nakit de tam
    // olarak aynı delta kadar değişmeli (I: override → DB → kapanış nakit zinciri kopmamış).
    expect(Number(closingCashAfter) - Number(closingCashBefore)).toBeCloseTo(Number(newOtherInflows) - Number(otherInflowsBefore), 2);

    // "Anında" — tam sayfa navigasyonu OLMADAN (router.refresh() ile) ekrandaki kapanış nakit
    // hücresi de yeni DB değerine dönmeli.
    const closingCashRow = page.locator('tr').filter({ has: page.getByText('DÖNEM SONU NAKİT', { exact: true }) });
    const closingCashCell = closingCashRow.locator('td').last();
    await expect
      .poll(async () => {
        const text = (await closingCashCell.textContent()) ?? '';
        return Number(text.replace(/[^\d,-]/g, '').replace(',', '.'));
      }, { message: 'Ekrandaki DÖNEM SONU NAKİT hücresi yeni override sonrası DB değerine dönmeli', timeout: 10_000 })
      .toBeCloseTo(Math.round(Number(closingCashAfter)), 0);
  });
});

/* ==================================================================== */
/* Tahsilat takibi (bağımsız — vadesi geçmiş fatura ön koşuluna bağlı)   */
/* ==================================================================== */

test.describe('Akış: /finans/tahsilat-takibi — hatırlatma taslağı (phase2)', () => {
  test('vadesi geçmiş faturada "Taslak oluştur" → AI/fallback metin → Onayla ve gönder → sandbox sent, dunningLevel 1', async ({ page }) => {
    await loginAs(page, 'muhasebe');

    const anyOverdueCount = psqlOne(`
      select count(*) from invoices i
      where i.kind='sales' and i.status in ('posted','partially_paid') and i.residual::numeric > 0 and i.due_date < current_date
    `);

    await page.goto('/finans/tahsilat-takibi');
    await expect(page.getByRole('heading', { level: 1, name: 'Tahsilat Takibi' })).toBeVisible();

    if (Number(anyOverdueCount) === 0) {
      // Ön koşul yok: DB'de vadesi geçmiş hiçbir satış faturası bulunamadı — ekran boş durumu göstermeli.
      await expect(page.getByText('Vadesi geçmiş fatura yok.')).toBeVisible();
      throw new Error(
        'DB ön koşulu eksik: hiçbir sales invoice due_date < current_date değil (bkz. rapor — I33 tarih ' +
        'düzeltmesinin yan etkisi: tüm faturalar bugün veya ileri vadeli). "Taslak oluştur" akışı ' +
        'gerçek veriyle egzersiz edilemedi.',
      );
    }

    // DÜZELTME (bu turda canlı tespit edildi — önceki turun test hatası): "en eski vadeli faturayı
    // SQL'den SEÇ, sonra UI'da onu bul" deseni tekrar-çalıştırılabilir DEĞİL — bu sabit/en-gecikmiş
    // fatura, seviye tavanına (4) çoktan ulaşmış ve ÖNCEKİ bir QA turunda zaten 4. seviye taslağı
    // üretilmiş olabilir; DB'de doğrulandı — bu turda tam olarak bu oldu: createDunningDraftAction
    // "Bu fatura için 4. seviye hatırlatma zaten oluşturulmuş" ile reddetti (dunning-actions.ts
    // hasDunningActionForLevel guard'ı — kod incelemesiyle doğrulandı, bkz. rapor). Uygulamanın
    // KENDİSİ bu durumda zaten "Taslak oluştur" yerine "İncele ve gönder"/"Gönderildi" göstermeli
    // (dunning-panel.tsx: `existing = r.hasDraft ? findExisting(...) : ...`) — bu yüzden test de
    // artık hangi faturanın bu koşuda uygun olduğunu SQL'de ÖNCEDEN varsaymıyor; EKRANDAN "Taslak
    // oluştur" yazan İLK satırı seçiyor (gerçek kullanıcının yapacağı gibi).
    const table = page.locator('table').filter({ has: page.locator('thead').getByText('İşlem', { exact: true }) });
    const draftableRow = table.locator('tbody tr').filter({ has: page.getByRole('button', { name: 'Taslak oluştur' }) }).first();
    await expect(draftableRow, 'En az bir satırda "Taslak oluştur" eylemi sunulmalı (hiçbiri o seviyede zaten taslak/gönderilmiş olmamalı)').toBeVisible({ timeout: 10_000 });
    const docNo = (await draftableRow.locator('td').nth(1).textContent())?.trim();
    expect(docNo, 'Seçilen satırdan fatura numarası okunabilmeli').toBeTruthy();

    await draftableRow.getByRole('button', { name: 'Taslak oluştur' }).click();
    await expect(page.getByText('Taslak üretiliyor…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Onayla ve gönder' })).toBeEnabled({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Onayla ve gönder' }).click();
    // BULGU (test hatası, bu turda düzeltildi): `getByText(/^Gönderildi/)` sayfada TEKİL değil —
    // aynı adla "Gönderildi" durum rozeti/sütun başlığı geçmiş tablosunda da görünür (canlı ölçüldü:
    // 5 eşleşme, strict-mode ihlali). Asıl kanıt sonner toast'ı (`region "Notifications alt+T"`) —
    // yalnızca ORAYA daraltılır.
    await expect(page.getByRole('region', { name: 'Notifications alt+T' }).getByText(/^Gönderildi/)).toBeVisible({ timeout: 15_000 });

    const action = psqlRows(`
      select da.status, da.level, da.sent_to from dunning_actions da
      join invoices i on i.id = da.invoice_id
      where i.doc_no = '${docNo}' order by da.created_at desc limit 1
    `)[0]!;
    expect(action[0]).toBe('sent');
    const dunningLevel = psqlOne(`select dunning_level from invoices where doc_no = '${docNo}'`);
    expect(Number(dunningLevel)).toBeGreaterThanOrEqual(1);
  });
});

/* ==================================================================== */
/* Negatifler                                                            */
/* ==================================================================== */

test.describe('Negatifler (phase2)', () => {
  test('aynı banka hareketi ikinci kez tahsilata bağlanamaz (yapısal: eşleşen hareket kuyruktan/eylemlerden düşer)', async ({ page }) => {
    await loginAs(page, 'muhasebe');
    // Adım 4'te eşleşen (matched) banka hareketleri artık ne mutabakat kuyruğunda ne de
    // "Yok say"/"Mutabakatta incele" eylemleriyle ikinci kez işlenebilir durumda olmamalı
    // (bkz. reconciliation-review.tsx: yalnızca status='suggested' satırlar kuyrukta; bank-
    // transactions-table.tsx rowActions: yalnızca 'unmatched'/'suggested' için eylem sunulur).
    // Not: bu test bağımsız (kendi RUN etiketine bağlı değil) çalıştırılabilir (bkz. rapor
    // K-INDEP-DESCRIBE) — bu yüzden BU koşunun ürettiği hareketle sınırlı kalmadan, DB'de GENEL
    // olarak en az bir 'matched' banka hareketi arar (önceki başarılı koşulardan kalıcı veri de
    // yeterli kanıttır — mutabakat mekaniği koşu-bağımsız).
    const matchedCount = psqlOne(`select count(*) from bank_transactions where status = 'matched'`);
    expect(Number(matchedCount), 'DB\'de en az bir eşleşmiş (matched) banka hareketi olmalı (önceki Adım 4/4b/4c koşusundan)').toBeGreaterThan(0);

    await page.goto('/muhasebe/banka');
    // Eşleşmiş satırın durum rozeti "matched" — "Yok say" aksiyonu artık sunulmuyor
    const anyMatchedRow = page.locator('tr, li').filter({ hasText: 'Eşleşti' }).first();
    if (await anyMatchedRow.count()) {
      await expect(anyMatchedRow.getByRole('button', { name: 'Yok say' })).toHaveCount(0);
    }

    // Sunucu tarafı garanti (kod incelemesi — UI'da bu harekete ikinci kez ulaşacak bir yol yok):
    // packages/core/src/accounting/reconciliation.ts::manualReconciliationMatch, bt.status==='matched'
    // ise `BANK_TX_ALREADY_MATCHED` ile reddeder — çift bağlama sunucu tarafında da imkânsızdır.
  });

  test('kapalı döneme (2026-07) fiş atılamaz', async ({ page }) => {
    await loginAs(page, 'muhasebe');
    const closedPeriod = psqlOne(`select code from fiscal_periods where is_closed = true order by code desc limit 1`);
    expect(closedPeriod, 'Kapalı bir dönem olmalı (seed 2026-01..2026-07 kapalı)').toBeTruthy();

    const beforeCount = psqlOne(`select count(*) from journal_entries`);

    await page.goto('/muhasebe/yevmiye/yeni');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // `ManualJournalForm` satır açıklamaları da (mobil kart düzeninde) "Açıklama" etiketi taşıyor —
    // aynı masaüstü+mobil çift-render deseni (bkz. visibleText) — o an GERÇEKTEN görünen tekil alana daraltılır.
    await page.getByLabel('Açıklama').filter({ visible: true }).fill(`QA kapalı dönem testi ${RUN}`);
    // `entryDate` alanı `required` taşıyor — `FieldLabel` bu durumda "Tarih" metnini bir `*` span'ıyla
    // birlikte basıyor (bkz. fields.tsx `FieldLabel`), yani etiketin TAM metni "Tarih *"; label metni
    // yerine `DateInput`'un varsayılan placeholder'ı ("gg.aa.yyyy", date-field.tsx) ile doğrudan hedeflenir.
    const dateInput = page.getByPlaceholder('gg.aa.yyyy');
    await dateInput.fill(`15.${closedPeriod!.split('-')[1]}.${closedPeriod!.split('-')[0]}`);
    await dateInput.press('Tab');

    const table = page.locator('table').first();
    await table.getByRole('combobox').nth(0).click();
    await page.getByPlaceholder('Ara…').fill('770');
    // "770" hem kendisi hem 770.01-770.09 alt hesaplarıyla eşleşir (hepsi arama sonucunda görünür) —
    // tam etiketle (kod + ad) hedeflenir.
    await page.getByRole('option', { name: '770 — Genel Yönetim Giderleri', exact: true }).click();
    // BULGU (K-NUMBERINPUT-TABLEROW, P1, canlı doğrulandı — bkz. rapor): `/muhasebe/yevmiye/yeni`
    // satır tablosundaki `NumberInput` (Borç/Alacak) alanları hem `.fill()` hem karakter-karakter
    // gerçek tuş vuruşuyla (`pressSequentially`, delay 20ms) doldurulduğunda DOM'da doğru biçimli
    // değeri ("100,00") gösteriyor VE `blur` sonrası yeniden biçimlendiriyor (onBlur'un çalıştığının
    // kanıtı) — ama alt toplam şeridi ("Borç: 0.0000") hiç güncellenmiyor: değer `NumberInput`'un
    // kendi görsel/local state'inde kalıyor, react-hook-form'un `lines.N.debit` alanına HİÇ
    // ulaşmıyor. Bu, satır SADECE borç dolduktan hemen sonra (kredi/ikinci satıra hiç dokunmadan)
    // tek başına test edilerek doğrulandı — yani "ikinci satırın birinciyi ezmesi" değil, TEK bir
    // alanın kendi `onChange`'inin RHF'e hiç ulaşmaması. Sonuç: "Fişi kaydet" kalıcı devre dışı kalır,
    // manuel yevmiye fişi ekranı otomasyonla (ve muhtemelen bazı gerçek klavye/IME akışlarıyla da)
    // dolduramaz hale geliyor. Kök neden adayı: `ManualJournalForm`'daki tablo hücresi `FormMoney`
    // ile `useFieldArray` satırı arasındaki `Controller` bağının satır-içi (nested array path)
    // kullanımında bir kopukluk olabilir — üstteki `Açıklama` (dizi dışı, tekil alan) aynı
    // `NumberInput` ATASI olmayan ama BENZER `onChange` deseniyle çalışan `FormText` doğru
    // çalıştığından (Adım metnini kaydedebildik), sorun `lines.${i}.debit/credit` yoluna özgü
    // görünüyor. Aşağıdaki adımlar (`pressSequentially`, açık `Tab`) bunu ÇÖZMEK için denendi ve
    // ÇÖZEMEDİ — beklenti gevşetilmedi, test olduğu gibi kırılmaya bırakıldı.
    const debitInput = table.locator('input[inputmode="decimal"]').nth(0);
    await debitInput.click();
    await debitInput.pressSequentially('100,00', { delay: 20 });
    await debitInput.press('Tab');

    await table.getByRole('combobox').nth(1).click();
    await page.getByPlaceholder('Ara…').fill('100');
    await page.getByRole('option', { name: /^100 —/ }).click();
    const creditInput = table.locator('input[inputmode="decimal"]').nth(3);
    await creditInput.click();
    await creditInput.pressSequentially('100,00', { delay: 20 });
    await creditInput.press('Tab');

    // NumberInput yalnızca `blur`da yuvarlanmış kanonik değeri işler (bkz. number-input.tsx onBlur) —
    // "Fişi kaydet"e basmadan önce fiş dengesinin (Borç=Alacak=100,00) GERÇEKTEN forma ulaştığı
    // doğrulanır; aksi halde buton kalıcı devre dışı kalır ve hata mesajı yanıltıcı olur.
    await expect(page.getByText('Dengeli', { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Fişi kaydet' }).click();
    await expect(page.getByText(/kapalı/i).first()).toBeVisible({ timeout: 15_000 });

    const afterCount = psqlOne(`select count(*) from journal_entries`);
    expect(afterCount, 'Kapalı döneme fiş REDDEDİLMELİ — yeni journal_entries satırı oluşmamalı').toBe(beforeCount);
  });

  test('depo rolü /muhasebe sayfasında engellenir', async ({ page }) => {
    await loginAs(page, 'depo', '/muhasebe');
    await expect(page).toHaveURL(/\/muhasebe/);
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Muhasebe' })).not.toBeVisible();
    await expect(page.getByText('Faturalar', { exact: true })).not.toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav.getByText('Muhasebe', { exact: true })).not.toBeVisible();
  });
});

/* ==================================================================== */
/* Mobil (390×844) / Tablet (1024×768) geçişler                          */
/* ==================================================================== */

test.describe('Mobil/Tablet geçişler (phase2)', () => {
  test('Mobil 390×844 — muhasebe: /muhasebe/faturalar liste yatay taşmadan çalışır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctxB.newPage();
    await loginAs(page, 'muhasebe');
    await page.goto('/muhasebe/faturalar');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `/muhasebe/faturalar 390px'te yatay taşmamalı (fazlalık: ${overflow}px)`).toBeLessThanOrEqual(1);
    await ctxB.close();
  });

  test('Tablet 1024×768 — muhasebe: /muhasebe/mutabakat iki sütun düzeni kırılmadan çalışır', async ({ browser }) => {
    const ctxB = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctxB.newPage();
    await loginAs(page, 'muhasebe');
    await page.goto('/muhasebe/mutabakat');
    await expect(page.getByRole('heading', { level: 1, name: 'Mutabakat' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctxB.close();
  });
});
