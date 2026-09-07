import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  const targets = [
    ['cta', 'a:has-text("Arıza bildir")'],
    ['search', 'input'],
    ['filter', 'button:has-text("Durum")'],
    ['sort', 'th button:has-text("No")'],
  ] as const;
  const out: Record<string, unknown> = {};
  for (const [key, sel] of targets) {
    const el = page.locator(sel).first();
    const r = await el.boundingBox();
    if (!r) { out[key] = 'yok'; continue; }
    const clip = { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.mouse.move(5, 5);
    await page.waitForTimeout(150);
    const off = await page.screenshot({ clip });
    // klavye modalitesi: önce Tab bas, sonra programatik odak
    await page.keyboard.press('Tab');
    await el.evaluate((e: HTMLElement) => e.focus());
    await page.waitForTimeout(250);
    const on = await page.screenshot({ clip });
    let diff = 0;
    const a = off, b = on;
    if (a.length === b.length) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++; }
    out[key] = { bytesDifferentPct: a.length === b.length ? +(100 * diff / a.length).toFixed(2) : 'boyut farklı', sameSize: a.length === b.length, offBytes: a.length, onBytes: b.length };
    require('node:fs').writeFileSync(`artifacts/critic/bakim-r12-fv-${key}-off.png`, off);
    require('node:fs').writeFileSync(`artifacts/critic/bakim-r12-fv-${key}-on.png`, on);
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
