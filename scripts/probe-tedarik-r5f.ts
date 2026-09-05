import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage(); await openRoute(page, { base, route, as: 'satin_alma' }); return { ctx, page };
}
async function main() {
  const browser = await launchBrowser(); const out: Record<string, any> = {};
  // KPI değer boyutları
  { const { ctx, page } = await open(browser, '/satin-alma/kritik-stok');
    out.kpi = await page.evaluate(() => Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && /^(—|36|0)$/.test((e.textContent ?? '').trim())).slice(0, 8).map((e) => {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { t: (e.textContent ?? '').trim(), size: parseFloat(cs.fontSize), weight: cs.fontWeight, top: Math.round(r.top), cls: (e as HTMLElement).className.toString().slice(0,50) };
    })); await ctx.close(); }
  // mobil kart tıklaması gezinme yapıyor mu
  for (const [k, route] of [['ted', '/satin-alma/tedarikciler'], ['kritik', '/satin-alma/kritik-stok'], ['sip', '/satin-alma/siparisler']] as const) {
    const { ctx, page } = await open(browser, route, 390, 844);
    const before = page.url();
    const li = page.locator('main ul > li').first();
    let navigated = false, err = '';
    try { await li.click({ timeout: 4000 }); await page.waitForTimeout(1200); navigated = page.url() !== before; } catch (e) { err = String(e).slice(0, 80); }
    out[`mobileClick_${k}`] = { before, after: page.url(), navigated, err,
      hasAnchor: await page.evaluate(() => !!document.querySelector('main ul > li a, main ul > li [role="link"]')),
      liRole: await page.evaluate(() => document.querySelector('main ul > li')?.getAttribute('role') ?? null) };
    await ctx.close();
  }
  await browser.close(); writeFileSync('artifacts/critic/probe-tedarik-r5f.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
