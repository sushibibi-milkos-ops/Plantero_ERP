import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/onaylar', as: 'admin' });
  const res = await page.evaluate(`(() => {
    const out = { mediaHoverNone: matchMedia('(hover: none)').matches, pointerCoarse: matchMedia('(pointer: coarse)').matches, rules: [] };
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list, parent) => {
        for (const r of Array.from(list)) {
          if (r.cssRules) { walk(r.cssRules, (r.conditionText ? '@media ' + r.conditionText : parent)); continue; }
          if (r.selectorText && /hover\\\\:bg-accent\\\\\\/20/.test(r.selectorText)) out.rules.push({ sel: r.selectorText, parent: parent || 'TOP-LEVEL' });
        }
      };
      walk(rules, '');
    }
    return out;
  })()`);
  console.log(JSON.stringify(res, null, 1));
  // gerçek davranış: dokunmatik bağlamda hover uygulanıyor mu?
  const row = page.locator('[role="option"]').nth(3);
  const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  await row.hover();
  await page.waitForTimeout(200);
  const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
  console.log(JSON.stringify({ touchHover: { before, after, applies: before !== after } }, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
