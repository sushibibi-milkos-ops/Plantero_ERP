/** Tur 10 — 390px reçete satırlarının kırpılmış kanıt görüntüsü + hizalama ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
  const box = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')].filter((r) => /Badem|Hurma|Deniz|Kavanoz/.test(r.textContent ?? ''));
    const first = rows[0]!.getBoundingClientRect();
    const last = rows[rows.length - 1]!.getBoundingClientRect();
    return { x: Math.round(first.left) - 8, y: Math.round(first.top) - 8, width: Math.round(first.width) + 16, height: Math.round(last.bottom - first.top) + 16 };
  });
  await page.screenshot({ path: 'artifacts/critic/arge-r10-precete-390-satirlar.png', clip: box });
  console.log(JSON.stringify(box));
  await ctx.close();
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
