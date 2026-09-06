/** Tur 3 kritik ek ölçüm — GTİP taşması + Belgeler sekmesi mobil kart alt satırı. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = process.argv[2]!;
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/gtip', as: 'admin' });
    out.gtip = await p.evaluate(`(() => {
      const t = document.querySelector('table');
      const wrap = t.parentElement;
      const rows = Array.from(t.querySelectorAll('tbody tr'));
      const last = rows[rows.length-1];
      const gtipIdx = Array.from(t.querySelectorAll('thead th')).findIndex(th => th.textContent.trim()==='GTİP');
      const cell = last.children[gtipIdx];
      const trig = cell.querySelector('[data-slot=select-trigger]');
      return {
        wrapScrollW: wrap.scrollWidth, wrapClientW: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX,
        tableW: Math.round(t.getBoundingClientRect().width), tableRight: Math.round(t.getBoundingClientRect().right),
        containerRight: Math.round(wrap.getBoundingClientRect().right),
        mappedRowText: last.textContent.replace(/\\s+/g,' ').trim(),
        gtipCellW: Math.round(cell.getBoundingClientRect().width),
        trigW: trig ? Math.round(trig.getBoundingClientRect().width) : null,
        trigMinW: trig ? getComputedStyle(trig).minWidth : null,
        trigScrollW: trig ? trig.scrollWidth : null,
        lastCellRight: Math.round(last.lastElementChild.getBoundingClientRect().right),
        clippedPx: wrap.scrollWidth - wrap.clientWidth,
      };
    })()`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    await p.getByRole('tab', { name: 'Belgeler' }).click();
    await p.waitForTimeout(500);
    out.belgelerMobCards = await p.evaluate(`(() => {
      const lis = Array.from(document.querySelectorAll('li'));
      return lis.filter(li => li.textContent.trim()).map(li => {
        const sub = li.querySelector('.text-muted-foreground');
        const mono = li.querySelector('.font-mono');
        return { title: (li.querySelector('.font-medium')?.textContent||'').trim(), sub: (sub?.textContent||'').replace(/\\s+/g,' ').trim(), mono: (mono?.textContent||'').trim(), h: Math.round(li.getBoundingClientRect().height) };
      });
    })()`);
    await ctx.close();
  }
  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r3c-b.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
