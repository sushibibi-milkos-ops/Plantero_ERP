/**
 * Tur 8 — arge: boş durum, odak halkası, hover geri bildirimi ölçümleri.
 * Çıktı: artifacts/critic/probe-arge-r8b.json + artifacts/critic/arge-r8-*.png
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const PID = process.env.PID ?? '731afc49-b499-4e9d-b1fc-1d9d8510b4f2';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();

  // Boş durum: /arge/receteler tabloda ara → "zzzz"
  await openRoute(page, { base, route: '/arge/receteler', as: 'admin' });
  await page.getByLabel('Tabloda ara').fill('zzzz');
  await page.waitForTimeout(500);
  out.emptyState = await page.evaluate(() => {
    const main = document.querySelector('main');
    const txt = (main?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300);
    const svgs = main?.querySelectorAll('svg').length ?? 0;
    const btns = Array.from(main?.querySelectorAll('button, a[data-slot="button"]') ?? []).map((b) => (b.textContent ?? '').trim()).filter(Boolean);
    return { txt, svgs, btns };
  });
  await page.screenshot({ path: 'artifacts/critic/arge-r8-bos-1440.png', animations: 'disabled' });

  // Odak halkası: ilk satıra klavye ile odaklan
  await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
  out.focus = await page.evaluate(() => {
    const row = document.querySelector('tbody tr') as HTMLElement | null;
    row?.focus();
    const active = document.activeElement as HTMLElement | null;
    const cs = active ? getComputedStyle(active) : null;
    return {
      activeTag: active?.tagName,
      tabIndex: row?.tabIndex,
      outline: cs?.outline,
      outlineWidth: cs?.outlineWidth,
      boxShadow: cs?.boxShadow?.slice(0, 80),
    };
  });
  // hover satır arka planı
  const row = page.locator('tbody tr').first();
  const bgBefore = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  await row.hover();
  await page.waitForTimeout(200);
  const bgAfter = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  out.hover = { bgBefore, bgAfter, changed: bgBefore !== bgAfter };

  // Buton odak halkası
  await page.keyboard.press('Tab');
  out.buttonFocus = await page.evaluate(() => {
    const b = document.querySelector('button[data-slot="dialog-trigger"]') as HTMLElement | null;
    b?.focus();
    const cs = b ? getComputedStyle(b) : null;
    return { boxShadow: cs?.boxShadow?.slice(0, 90), outline: cs?.outline, outlineWidth: cs?.outlineWidth };
  });

  // Yükleniyor iskeleti: proje reçeteleri sayfasına soğuk git, aria-busy/skeleton yakala
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const p2 = await ctx2.newPage();
  await openRoute(p2, { base, route: '/arge/projeler', as: 'admin' });
  await p2.evaluate((href) => { (document.querySelector(`a[href="${href}"]`) as HTMLElement | null)?.click(); }, `/arge/projeler/${PID}/receteler`).catch(() => {});
  await p2.getByRole('row').first().click({ trial: true }).catch(() => {});
  await p2.locator('tbody tr').nth(2).click().catch(() => {});
  await p2.waitForTimeout(150);
  out.loading = await p2.evaluate(() => ({
    skeletons: document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length,
    ariaBusy: document.querySelectorAll('[aria-busy="true"]').length,
    url: location.pathname,
  })).catch(() => null);
  await p2.screenshot({ path: 'artifacts/critic/arge-r8-yukleniyor-1440.png', animations: 'disabled' }).catch(() => {});

  await ctx.close();
  await ctx2.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-arge-r8b.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
