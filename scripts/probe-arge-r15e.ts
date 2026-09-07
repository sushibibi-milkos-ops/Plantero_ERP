import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function run() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/arge/projeler', as: 'admin' });
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('main button')].find((b) => (b.textContent ?? '').includes('Yeni proje')) as HTMLElement;
    btn.focus();
    const cs = getComputedStyle(btn);
    const vars: Record<string, string> = {};
    for (const v of ['--tw-ring-shadow', '--tw-ring-color', '--tw-ring-offset-shadow', '--tw-shadow']) vars[v] = cs.getPropertyValue(v);
    return { cls: btn.className, focusVisible: btn.matches(':focus-visible'), boxShadow: cs.boxShadow, vars };
  });
  console.log(JSON.stringify(info, null, 1));
  // gerçek klavye ile (CDP) — focus-visible heuristics
  await page.keyboard.press('Tab');
  const info2 = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { label: (el.textContent ?? '').trim().slice(0, 20), fv: el.matches(':focus-visible'), ring: cs.getPropertyValue('--tw-ring-shadow'), boxShadow: cs.boxShadow };
  });
  console.log(JSON.stringify(info2, null, 1));
  await browser.close();
}
run().catch((e) => { console.error(e); process.exit(1); });
