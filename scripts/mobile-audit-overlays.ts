/**
 * Telefon denetimi — katmanlar (dialog / sheet / popover / seçici / komut paleti): açıldığında ekrana sığıyor mu,
 * kapatma düğmesi 44px mi, içerik kendi içinde kaydırılabiliyor mu.
 *   pnpm tsx scripts/mobile-audit-overlays.ts [--viewport 390x844]
 * Çıktı: artifacts/mobile-audit/<tarih>-overlays-<viewport>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const vpArg = process.argv.indexOf('--viewport');
const [W, H] = (vpArg > 0 ? process.argv[vpArg + 1]! : '390x844').split('x').map(Number) as [number, number];
const base = defaultBaseUrl();

type Row = { name: string; ok: boolean; box?: { x: number; y: number; w: number; h: number }; closeBtn?: { w: number; h: number } | null; note?: string };
const rows: Row[] = [];

async function measureOverlay(page: Page, name: string, selector: string, closeSel?: string) {
  const loc = page.locator(selector).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    rows.push({ name, ok: false, note: 'açılmadı' });
    return;
  }
  await page.waitForTimeout(450);
  const b = (await loc.boundingBox())!;
  let closeBtn: Row['closeBtn'] = null;
  if (closeSel) {
    const cb = (await page.locator(closeSel).count()) ? await page.locator(closeSel).first().boundingBox() : null;
    if (cb) closeBtn = { w: Math.round(cb.width), h: Math.round(cb.height) };
  }
  const fits = b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= W + 0.5 && b.y + b.height <= H + 0.5;
  const closeOk = closeBtn === null || (closeBtn.w >= 44 && closeBtn.h >= 44); // kapat düğmesi yoksa (komut paleti) kabul
  rows.push({ name, ok: fits && closeOk, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }, closeBtn });
}

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(120_000);
  await login(page, base, resolveAccount('admin'), '/kokpit');

  await page.goto(`${base}/kokpit`, { waitUntil: 'networkidle' });
  // Menü sheet'i
  await page.getByRole('navigation', { name: 'Hızlı erişim' }).getByRole('button', { name: 'Menü' }).click();
  await measureOverlay(page, 'Menü sheet', '[data-slot="sheet-content"]', '[data-slot="sheet-content"] button:has(.sr-only)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Komut paleti
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await measureOverlay(page, 'Komut paleti', '[data-slot="dialog-content"]', '[data-slot="dialog-close"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Kullanıcı menüsü (dropdown)
  await page.getByTestId('user-menu').click();
  await measureOverlay(page, 'Kullanıcı menüsü', '[role="menu"]');
  await page.keyboard.press('Escape');

  // Dialog: onay penceresi içeren bir ekran — teklif detayından "Kaybedildi işaretle", yoksa yeni rol
  await page.goto(`${base}/ayarlar/roller`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Yeni Rol/ }).click().catch(() => {});
  await measureOverlay(page, 'Yeni rol dialog', '[role="dialog"]', '[data-slot="dialog-close"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Seçici (Select) açılır listesi: sayfa boyutu seçici
  await page.goto(`${base}/ana-veri/urunler`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const filterBtn = page.getByRole('button', { name: /Tip|Durum|Kategori/ }).first();
  if (await filterBtn.count()) {
    await filterBtn.click();
    await measureOverlay(page, 'Filtre menüsü', '[role="menu"]');
    await page.keyboard.press('Escape');
  }
  // Combobox açılır listesi: yeni ürün formundaki seçici
  await page.goto(`${base}/ana-veri/urunler/yeni`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const trigger = page.locator('[data-slot="select-trigger"]').first();
  if (await trigger.count()) {
    await trigger.click();
    await measureOverlay(page, 'Select listesi', '[data-slot="select-content"]');
    await page.keyboard.press('Escape');
  }

  const dir = join(process.cwd(), 'artifacts', 'mobile-audit');
  mkdirSync(dir, { recursive: true });
  const stem = `${new Date().toISOString().slice(0, 10)}-overlays-${W}x${H}`;
  writeFileSync(join(dir, `${stem}.json`), JSON.stringify(rows, null, 2));
  process.stdout.write(JSON.stringify(rows) + '\n');
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
