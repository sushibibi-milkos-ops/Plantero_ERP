import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};

  await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
  // satır hover
  const row = page.locator('tbody tr:visible').first();
  const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  await row.hover();
  await page.waitForTimeout(120);
  const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  out.rowHover = { before, after, changed: before !== after };
  // birincil buton focus + active
  const btn = page.getByRole('link', { name: /Arıza bildir/ }).first();
  await btn.focus();
  await page.waitForTimeout(80);
  out.primaryFocus = await btn.evaluate((e) => { const cs = getComputedStyle(e); return { outline: cs.outlineWidth + ' ' + cs.outlineStyle, boxShadow: cs.boxShadow.slice(0, 80), transition: cs.transitionProperty + ' ' + cs.transitionDuration + ' ' + cs.transitionTimingFunction, h: +e.getBoundingClientRect().height.toFixed(1) }; });

  // OEE hat çipleri focus
  await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
  const chip = page.getByRole('link', { name: 'HAT2' }).first();
  await chip.focus();
  await page.waitForTimeout(80);
  out.chipFocus = await chip.evaluate((e) => { const cs = getComputedStyle(e); return { outlineW: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 90), h: +e.getBoundingClientRect().height.toFixed(1) }; });
  // oee tablo satır hover
  const orow = page.locator('tbody tr:visible').first();
  const ob = await orow.evaluate((e) => getComputedStyle(e).backgroundColor);
  await orow.hover(); await page.waitForTimeout(120);
  const oa = await orow.evaluate((e) => getComputedStyle(e).backgroundColor);
  out.oeeRowHover = { before: ob, after: oa, changed: ob !== oa };
  // tüm geçişlerin süresi/eğrisi (bakım rotalarında)
  out.transitions = await page.evaluate(() => {
    const bad: Array<Record<string, string>> = [];
    Array.from(document.querySelectorAll('*')).slice(0, 1500).forEach((e) => {
      const cs = getComputedStyle(e);
      if (cs.transitionProperty === 'all') bad.push({ why: 'transition: all', sel: e.tagName + '.' + String(e.className).slice(0, 40) });
      const d = cs.transitionDuration.split(',').map((s) => parseFloat(s) * (s.includes('ms') ? 1 : 1000));
      if (d.some((x) => x >= 300)) bad.push({ why: 'duration>=300ms:' + cs.transitionDuration, sel: e.tagName + '.' + String(e.className).slice(0, 40) });
      if (/cubic-bezier\(0\.4, 0, 1, 1\)|ease-in\b/.test(cs.transitionTimingFunction)) bad.push({ why: 'ease-in', sel: e.tagName + '.' + String(e.className).slice(0, 40) });
    });
    return bad.slice(0, 15);
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
