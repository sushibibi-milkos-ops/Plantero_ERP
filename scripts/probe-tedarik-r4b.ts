/** Tur 4 ek prob: sayısal yaprak elemanlarda tabular-nums, satır hover, focus ring. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const [key, route] of [['critical', '/satin-alma/kritik-stok'], ['orders', '/satin-alma/siparisler'], ['poDetail', '/satin-alma/siparisler/50e00f08-c2e3-43d1-88b3-28d34927f23f'], ['suppliers', '/satin-alma/tedarikciler']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'satin_alma' });
    const data = await page.evaluate(() => {
      const leaves = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && /\d/.test(e.textContent ?? '')) as HTMLElement[];
      let tab = 0, normal = 0;
      const normalSamples: string[] = [];
      for (const l of leaves) {
        const cs = getComputedStyle(l);
        const t = (l.textContent ?? '').trim();
        if (!/[\d]/.test(t)) continue;
        if (cs.fontVariantNumeric.includes('tabular') || cs.fontFamily.toLowerCase().includes('mono')) tab++;
        else { normal++; if (normalSamples.length < 12) normalSamples.push(t.slice(0, 24)); }
      }
      return { numericLeaves: tab + normal, tabular: tab, nonTabular: normal, nonTabularSamples: normalSamples };
    });
    // satır hover
    let hover: unknown = null;
    const rows = page.locator('tbody tr');
    if (await rows.count() > 0) {
      const r = rows.first();
      const before = await r.evaluate((el) => getComputedStyle(el).backgroundColor);
      await r.hover();
      await page.waitForTimeout(250);
      const after = await r.evaluate((el) => getComputedStyle(el).backgroundColor);
      const actionsOpacity = await page.evaluate(() => {
        const tr = document.querySelector('tbody tr');
        const btn = tr?.querySelector('td:last-child button') as HTMLElement | null;
        return btn ? getComputedStyle(btn).opacity : null;
      });
      hover = { before, after, changed: before !== after, rowActionsOpacityOnHover: actionsOpacity };
    }
    // focus-visible ring: ilk gerçek butona klavye ile odaklan
    const focus = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('main button, main a[data-slot="button"]'))[0] as HTMLElement | undefined;
      if (!btn) return null;
      btn.focus();
      const cs = getComputedStyle(btn);
      return { text: (btn.textContent ?? '').trim().slice(0, 20), outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 120) };
    });
    out[key] = { ...data, rowHover: hover, focus };
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
