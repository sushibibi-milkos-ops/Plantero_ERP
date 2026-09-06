/** Tur 4 kritik ölçüm — sütun bilgi yoğunluğu, mobil kart alt satırı ayracı, boş durum CTA tutarlılığı. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const SHIP = process.argv[2]!;

const COLSTATS = `(() => {
  const t = document.querySelector('table');
  if (!t) return null;
  const heads = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim());
  const rows = Array.from(t.querySelectorAll('tbody tr'));
  const cols = heads.map((h, i) => {
    const vals = rows.map(r => (r.children[i]?.textContent || '').replace(/\\s+/g,' ').trim());
    const distinct = Array.from(new Set(vals));
    const w = Math.round(rows[0]?.children[i]?.getBoundingClientRect().width || 0);
    const maxContent = Math.max(0, ...rows.map(r => { const c = r.children[i]; if(!c) return 0; const s = c.firstElementChild; return s ? Math.round(s.scrollWidth) : 0; }));
    return { head: h, w, distinct: distinct.length, top: distinct.slice(0,3), dash: vals.filter(v => v === '—' || v === '').length, rows: vals.length, maxContent };
  });
  const wrap = t.parentElement;
  return { cols, tableW: Math.round(t.getBoundingClientRect().width), wrapScrollW: wrap.scrollWidth, wrapClientW: wrap.clientWidth };
})()`;

const MOBCARDS = `(() => {
  const lis = Array.from(document.querySelectorAll('main li')).filter(li => li.textContent.trim());
  return lis.slice(0, 6).map(li => ({
    h: Math.round(li.getBoundingClientRect().height),
    text: li.textContent.replace(/\\s+/g,' ').trim().slice(0,90),
    glued: /\\S·/.test(li.textContent) || /·\\S/.test(li.textContent.replace(/· /g,'·X ')),
    raw: JSON.stringify(li.textContent).slice(0,140),
  }));
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  const desk = async (route: string, key: string, extra?: string) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    out[key] = await p.evaluate(extra ?? COLSTATS);
    await ctx.close();
  };
  const mob = async (route: string, key: string) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    out[key] = await p.evaluate(MOBCARDS);
    await ctx.close();
  };
  await desk('/ihracat/gtip', 'gtipCols');
  await desk('/ihracat/kurlar', 'kurlarCols');
  await desk('/ihracat/belgeler', 'belgelerCols');
  await desk('/ihracat/sevkiyatlar', 'sevkCols');
  await mob('/ihracat/sevkiyatlar', 'sevkMob');
  await mob('/ihracat/kurlar', 'kurlarMob');
  await mob('/ihracat/belgeler', 'belgelerMob');
  // detay: sekme tabloları + boş durum CTA
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${SHIP}`, as: 'admin' });
    out.detayLines = await p.evaluate(COLSTATS);
    out.detayHeaderButtons = await p.evaluate(`Array.from(document.querySelectorAll('main button, main a[role=button]')).map(b=>b.textContent.replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0,12)`);
    out.detaySeed = await p.evaluate(`(document.querySelector('main').textContent.match(/[A-Z0-9-]*SEED[A-Z0-9-]*/g)||[])`);
    await p.getByRole('tab', { name: 'Çeki listesi' }).click(); await p.waitForTimeout(400);
    out.detayPacking = await p.evaluate(COLSTATS);
    await p.getByRole('tab', { name: 'Belgeler' }).click(); await p.waitForTimeout(400);
    out.detayDocs = await p.evaluate(COLSTATS);
    await p.getByRole('tab', { name: 'Fatura & kur' }).click(); await p.waitForTimeout(400);
    out.detayInvoiceEmpty = await p.evaluate(`(() => {
      const es = document.querySelector('main [data-slot=empty-state], main .text-center');
      const txt = es ? es.textContent.replace(/\\s+/g,' ').trim() : null;
      const btns = Array.from(document.querySelectorAll('main button')).map(b=>b.textContent.replace(/\\s+/g,' ').trim()).filter(Boolean);
      const cta = (txt||'').match(/“([^”]+)”/);
      return { txt, btns, ctaNamed: cta ? cta[1] : null, ctaPresent: cta ? btns.some(b => b.includes(cta[1])) : null };
    })()`);
    await ctx.close();
  }
  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r4.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
