import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PID = '3decd113-2b89-4d42-a150-5079cb2c1651';
async function main() {
  const browser = await launchBrowser();
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page = await c.newPage();
  await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'admin', base });
  await page.getByRole('button', { name: /v1/ }).first().click();
  await page.waitForTimeout(1200);
  const out = await page.evaluate(`(() => {
    const row = document.querySelector('tbody tr');
    const res = [];
    const stack = [[row, 0]];
    while (stack.length) {
      const [el, d] = stack.pop();
      const s = getComputedStyle(el);
      const bgVisible = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      const bdVisible = parseFloat(s.borderTopWidth) > 0 && s.borderTopColor !== 'rgba(0, 0, 0, 0)';
      if (bgVisible || bdVisible || s.boxShadow !== 'none') {
        res.push({ d: d, tag: el.tagName, cls: String(el.className).slice(0, 90), bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopColor, shadow: s.boxShadow.slice(0, 50) });
      }
      for (const ch of Array.from(el.children)) stack.push([ch, d + 1]);
    }
    return res;
  })()`);
  await c.close(); await browser.close();
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
