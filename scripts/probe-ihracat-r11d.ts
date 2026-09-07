import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route: '/ihracat/sevkiyatlar', as: 'admin' });
  const out: any[] = [];
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest('main')) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, cls: (el.className||'').toString(), label: (el.textContent??'').trim().slice(0,26),
        fv: el.matches(':focus-visible'), outline: `${cs.outlineWidth}/${cs.outlineStyle}`, box: cs.boxShadow };
    });
    if (!f) continue;
    out.push(f);
    await page.screenshot({ path: `artifacts/critic/ihracat-r11-focus-${out.length}.png`, clip: await page.evaluate(() => { const r=(document.activeElement as HTMLElement).getBoundingClientRect(); return { x: Math.max(0,r.x-14), y: Math.max(0,r.y-14), width: Math.min(600,r.width+28), height: Math.min(300,r.height+28) }; }) });
    if (out.length >= 4) break;
  }
  await ctx.close(); await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r11d.json', JSON.stringify(out, null, 1));
  console.error(JSON.stringify(out.map(o=>({l:o.label,tag:o.tag,fv:o.fv,outline:o.outline,box:o.box.slice(0,200),cls:o.cls.slice(0,300)})), null, 1));
}
main().catch((e)=>{console.error(e);process.exit(1);});
