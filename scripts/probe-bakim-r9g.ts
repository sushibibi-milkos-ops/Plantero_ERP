/** Tur 9: OEE hat çipleri — GERÇEK klavye Tab ile odak halkası ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
  await page.evaluate(() => (document.querySelector('main') as HTMLElement)?.focus?.());
  const seen: any[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      return {
        text: (e.textContent || '').trim().slice(0, 24),
        tag: e.tagName,
        fv: e.matches(':focus-visible'),
        outline: cs.outlineStyle === 'none' ? 'none' : `${cs.outlineWidth} ${cs.outlineStyle}`,
        boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 40),
        bg: cs.backgroundColor,
      };
    });
    if (info) seen.push(info);
    if (info && /^(Tüm hatlar|HAT1|HAT2|HAT3)$/.test(info.text)) {
      await page.screenshot({ path: `artifacts/critic/bakim-r9-oee-focus-${info.text.replace(/\s/g, '')}.png`, clip: { x: 340, y: 180, width: 700, height: 100 } });
    }
  }
  await browser.close();
  process.stdout.write(JSON.stringify(seen.filter((s) => /hat|HAT|Tüm/i.test(s.text) || s.tag === 'TD'), null, 2) + '\n');
})();
