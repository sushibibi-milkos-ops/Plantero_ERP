import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'satin_alma' });
  return { ctx, page };
}
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  // tedarikciler mobil: switch görünürlüğü + kart eylemi
  {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler', 390, 844);
    out.mobileSwitch = await page.evaluate(() => Array.from(document.querySelectorAll('[role="switch"]')).map((s) => {
      const r = s.getBoundingClientRect(); const cs = getComputedStyle(s);
      const hiddenAncestor = (() => { let p: Element | null = s; while (p) { if (getComputedStyle(p).display === 'none') return (p as HTMLElement).className.toString().slice(0,60); p = p.parentElement; } return null; })();
      return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display, hiddenBy: hiddenAncestor };
    }));
    out.mobileCardLinks = await page.evaluate(() => Array.from(document.querySelectorAll('main ul > li')).slice(0,2).map((li) => {
      const a = li.querySelector('a,[role="link"],button');
      const r = (a ?? li).getBoundingClientRect();
      return { tag: a?.tagName ?? 'none', w: Math.round(r.width), h: Math.round(r.height) };
    }));
    await ctx.close();
  }
  // tedarikciler masaüstü: switch tıklama alanı (label sarmalayıcı)
  {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler');
    out.desktopSwitchHit = await page.evaluate(() => Array.from(document.querySelectorAll('[role="switch"]')).slice(0,2).map((s) => {
      const r = s.getBoundingClientRect();
      const p = s.closest('label') ?? s.parentElement!;
      const pr = p.getBoundingClientRect();
      return { sw: [Math.round(r.width), Math.round(r.height)], wrapper: p.tagName, wrapperSize: [Math.round(pr.width), Math.round(pr.height)] };
    }));
    // son sütun görünür mü
    out.lastColClip = await page.evaluate(() => {
      const sc = document.querySelector('.overflow-auto') as HTMLElement;
      const cells = Array.from(document.querySelectorAll('tbody tr')).map((tr) => {
        const tds = tr.querySelectorAll('td'); const last = tds[tds.length - 1] as HTMLElement;
        const r = last.getBoundingClientRect(); const sr = sc.getBoundingClientRect();
        return { text: (last.textContent ?? '').trim(), right: Math.round(r.right), scRight: Math.round(sr.right), clippedPx: Math.round(r.right - sr.right) };
      });
      return cells;
    });
    await ctx.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r5d.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
