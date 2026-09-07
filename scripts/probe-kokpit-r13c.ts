/** Tur 13: klavye ile KPI şerit kartına Tab'layıp odak halkasının gerçekten boyanıp boyanmadığını ölç. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';
const OUT = resolve(process.cwd(), 'artifacts', 'critic');
async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { route: '/kokpit', as: 'admin', base: defaultBaseUrl() });
  // İlk KPI kartına klavyeyle ulaş
  let info: any = null;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        matchesFV: el.matches(':focus-visible'),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        outlineOffset: cs.outlineOffset,
        boxShadow: cs.boxShadow,
        rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 200),
      };
    });
    if (info && /Bugünkü net ciro/.test(info.text)) break;
  }
  console.log(JSON.stringify(info, null, 2));
  if (info?.rect) {
    await page.screenshot({ path: resolve(OUT, 'kokpit-r13-focus-kpi.png'), clip: { x: Math.max(0, info.rect.x - 12), y: Math.max(0, info.rect.y - 12), width: info.rect.w + 24, height: info.rect.h + 24 } });
  }
  // Karşılaştırma: bir RowLink
  let rowInfo: any = null;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    rowInfo = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
      return { text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,40), matchesFV: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, boxShadow: cs.boxShadow.slice(0,80), rect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} };
    });
    if (rowInfo && /QNB/.test(rowInfo.text)) break;
  }
  console.log(JSON.stringify(rowInfo, null, 2));
  if (rowInfo?.rect) await page.screenshot({ path: resolve(OUT, 'kokpit-r13-focus-row.png'), clip: { x: Math.max(0, rowInfo.rect.x-12), y: Math.max(0, rowInfo.rect.y-12), width: rowInfo.rect.w+24, height: rowInfo.rect.h+24 } });
  await browser.close();
}
main();
