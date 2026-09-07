import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
  const page = await context.newPage();
  await openRoute(page, { route: '/bakim/is-emirleri', base, as: 'admin' });
  const info = await page.evaluate(() => {
    const tr = document.querySelector('tbody tr') as HTMLElement | null;
    if (!tr) return { err: 'no tr' };
    const r = tr.getBoundingClientRect();
    const cs = getComputedStyle(tr);
    let par: string[] = []; let n: HTMLElement | null = tr.parentElement;
    while (n && par.length < 6) { const c = getComputedStyle(n); par.push(`${n.tagName}.${(n.className||'').toString().slice(0,45)} disp=${c.display} vis=${c.visibility} op=${c.opacity} h=${Math.round(n.getBoundingClientRect().height)}`); n = n.parentElement; }
    // hover simülasyonu yerine sınıf denetimi
    const btn = document.querySelector('a[href*="/yeni"], button');
    const bcs = btn ? getComputedStyle(btn) : null;
    return { rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }, bg: cs.backgroundColor, cls: tr.className, parents: par,
      btnCls: btn ? (btn as HTMLElement).className.slice(0,160) : null, btnTransition: bcs ? bcs.transitionProperty + ' ' + bcs.transitionDuration : null };
  });
  console.log(JSON.stringify(info, null, 1));
  await context.close(); await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
