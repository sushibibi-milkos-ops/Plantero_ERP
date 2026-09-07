/** Tur 11: odak halkası — Tab sonrası stil oturması beklenerek (250ms) hem hesaplanmış stil hem kırpılmış görüntü. */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const ROUTES = [['kurlar','/ihracat/kurlar'],['gtip','/ihracat/gtip'],['detay','/ihracat/sevkiyatlar/47587da6-f20a-45cb-aabf-4627f8eb4156']] as const;
async function main() {
  const browser = await launchBrowser();
  const res: any = {};
  for (const [k, route] of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    const out: any[] = [];
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(250);
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest('main')) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, label: (el.textContent??'').trim().slice(0,26) || (el.getAttribute('placeholder')??''),
          fv: el.matches(':focus-visible'), outline: `${cs.outlineWidth}/${cs.outlineStyle}/${cs.outlineColor}`, box: cs.boxShadow, border: cs.borderColor };
      });
      if (!f) continue;
      out.push(f);
      const clip = await page.evaluate(() => { const r=(document.activeElement as HTMLElement).getBoundingClientRect(); return { x: Math.max(0,r.x-20), y: Math.max(0,r.y-20), width: Math.min(700,r.width+40), height: Math.min(200,r.height+40) }; });
      await page.screenshot({ path: `artifacts/critic/ihracat-r13-focus-${k}-${out.length}.png`, clip });
      if (out.length >= 6) break;
    }
    res[k] = out;
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-ihracat-r13c.json', JSON.stringify(res, null, 1));
  for (const k of Object.keys(res)) for (const o of res[k]) console.error(k, o.tag, JSON.stringify(o.label), 'fv',o.fv, '|', o.outline, '| ring:', (o.box.split('), ')[3]||'').slice(0,60), '| border', o.border);
}
main().catch((e)=>{console.error(e);process.exit(1);});
