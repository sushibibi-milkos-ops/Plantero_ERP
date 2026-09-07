/** Tur 9: OEE hat çipleri odak halkası + tabular-nums ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
  const chip = page.getByRole('link', { name: 'HAT1', exact: true });
  await chip.focus();
  await page.waitForTimeout(200);
  const focus = await page.evaluate(() => {
    const e = document.activeElement as HTMLElement;
    const cs = getComputedStyle(e);
    return { tag: e.tagName, text: (e.textContent || '').trim(), outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow };
  });
  const nums = await page.evaluate(() => {
    const res: any[] = [];
    for (const sel of ['td', 'th', '[class*="tabular"]']) {
      for (const e of Array.from(document.querySelectorAll(sel)).slice(0, 40) as HTMLElement[]) {
        const t = (e.textContent || '').trim();
        if (!/[0-9]/.test(t)) continue;
        const cs = getComputedStyle(e);
        res.push({ t: t.slice(0, 18), fvn: cs.fontVariantNumeric, align: cs.textAlign });
      }
    }
    return res.slice(0, 20);
  });
  const kpi = await page.evaluate(() => {
    const out: any[] = [];
    for (const e of Array.from(document.querySelectorAll('main *')) as HTMLElement[]) {
      const t = (e.textContent || '').trim();
      if (e.children.length === 0 && /^%[0-9]/.test(t)) {
        const cs = getComputedStyle(e);
        out.push({ t, size: cs.fontSize, weight: cs.fontWeight, fvn: cs.fontVariantNumeric });
      }
    }
    return out.slice(0, 12);
  });
  await browser.close();
  process.stdout.write(JSON.stringify({ focus, nums, kpi }, null, 2) + '\n');
})();
