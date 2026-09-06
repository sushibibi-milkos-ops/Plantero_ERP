/**
 * Tur 3 KRİTİK ölçümü — ihracat modülü (bağımsız doğrulama).
 * Çıktı: artifacts/critic/probe-ihracat-r3c.json
 * Kullanım: pnpm tsx scripts/probe-ihracat-r3c.ts <shipmentId>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = process.argv[2] ?? '48144485-e36a-46b6-badd-cab84fae240e';

async function withPage<T>(browser: Browser, route: string, w: number, h: number, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route, as: 'admin' });
  const out = await fn(page);
  await ctx.close();
  return out;
}

const HELPERS = `
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const r1 = (n) => Math.round(n*10)/10;
`;

const TABLE_INFO = `(() => {
  ${HELPERS}
  const out = [];
  document.querySelectorAll('table').forEach((t, i) => {
    if (!vis(t)) return;
    const ths = Array.from(t.querySelectorAll('thead th')).filter(vis);
    const rows = Array.from(t.querySelectorAll('tbody tr')).filter(vis);
    const cols = ths.map((th, ci) => {
      const cells = rows.map(r => (r.children[ci] ? r.children[ci].textContent : '' ).replace(/\\s+/g,' ').trim());
      const distinct = new Set(cells.filter(Boolean));
      return { head: (th.textContent||'').replace(/\\s+/g,' ').trim(), transform: getComputedStyle(th).textTransform, fs: getComputedStyle(th).fontSize, w: r1(th.getBoundingClientRect().width), dash: cells.filter(c => c === '—' || c === '').length, distinct: distinct.size, sample: Array.from(distinct).slice(0,3) };
    });
    const wrap = t.parentElement;
    const heights = rows.map(r => r1(r.getBoundingClientRect().height)); heights.sort((a,b)=>a-b);
    out.push({ i, rows: rows.length, heights: heights.length ? [heights[0], heights[Math.floor(heights.length/2)], heights[heights.length-1]] : [], tableScrollW: t.scrollWidth, tableClientW: t.clientWidth, wrapScrollW: wrap?wrap.scrollWidth:null, wrapClientW: wrap?wrap.clientWidth:null, cols });
  });
  return out;
})()`;

const PAGE_INFO = `(() => {
  ${HELPERS}
  const de = document.documentElement;
  const scrollers = [];
  document.querySelectorAll('*').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) scrollers.push({ sel: el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className?'.'+el.className.split(/\\s+/).slice(0,3).join('.'):''), sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) });
  });
  const touch = [];
  document.querySelectorAll('button,a,input,select,textarea,[role=button],[role=tab],[data-slot=select-trigger]').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) touch.push({ sel: el.tagName.toLowerCase()+(el.getAttribute('data-slot')?'[data-slot='+el.getAttribute('data-slot')+']':''), t: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,28), w: r1(r.width), h: r1(r.height) });
  });
  // tipografi dağılımı + renk sayısı
  const fs = {}, colors = {};
  document.querySelectorAll('main *').forEach(el => {
    if (!vis(el) || el.children.length) return;
    const cs = getComputedStyle(el);
    const txt = (el.textContent||'').trim(); if (!txt) return;
    fs[cs.fontSize] = (fs[cs.fontSize]||0)+1;
    colors[cs.color] = (colors[cs.color]||0)+1;
  });
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowX: de.scrollWidth > de.clientWidth, scrollers, touchBelow44: touch.slice(0,30), touchCount: touch.length, fontSizes: fs, colorCount: Object.keys(colors).length, colors };
})()`;

const CARDS_INFO = `(() => {
  ${HELPERS}
  const lists = [];
  document.querySelectorAll('ul').forEach(ul => {
    const lis = Array.from(ul.children).filter(el => el.tagName === 'LI' && vis(el));
    if (lis.length < 2) return;
    const hs = lis.map(li => r1(li.getBoundingClientRect().height)).sort((a,b)=>a-b);
    lists.push({ count: lis.length, heights: [hs[0], hs[Math.floor(hs.length/2)], hs[hs.length-1]], samples: lis.slice(0,3).map(li => (li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,100)) });
  });
  return lists;
})()`;

const HEADINGS = `(() => { ${HELPERS}
  return Array.from(document.querySelectorAll('h1,h2,h3')).filter(vis).map(h => ({ tag: h.tagName, t: (h.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40), fs: getComputedStyle(h).fontSize, fw: getComputedStyle(h).fontWeight, ls: getComputedStyle(h).letterSpacing }));
})()`;

const NUMTEXT = `(() => { ${HELPERS}
  const out = [];
  document.querySelectorAll('main *').forEach(el => {
    if (!vis(el) || el.children.length) return;
    const t = (el.textContent||'').trim();
    if (!/[\\d]/.test(t) || t.length > 24) return;
    if (/[₺€$%]|\\d[.,]\\d/.test(t)) out.push({ t, fs: getComputedStyle(el).fontSize, fvn: getComputedStyle(el).fontVariantNumeric, ta: getComputedStyle(el).textAlign, color: getComputedStyle(el).color });
  });
  return out.slice(0,60);
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = { shipmentId: SHIP };
  const snap = async (p: Page) => ({ page: await p.evaluate(PAGE_INFO), tables: await p.evaluate(TABLE_INFO), headings: await p.evaluate(HEADINGS), nums: await p.evaluate(NUMTEXT) });

  out.listDesk = await withPage(browser, '/ihracat/sevkiyatlar', 1440, 900, snap);
  out.listMob = await withPage(browser, '/ihracat/sevkiyatlar', 390, 844, async p => ({ page: await p.evaluate(PAGE_INFO), cards: await p.evaluate(CARDS_INFO) }));

  out.detayDesk = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 1440, 900, async (p) => {
    const res: Record<string, unknown> = { base: await snap(p), tabs: (await p.getByRole('tab').allTextContents()) };
    for (const tab of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      const l = p.getByRole('tab', { name: tab }); if (await l.count() === 0) continue;
      await l.first().click(); await p.waitForTimeout(450);
      res[tab] = await snap(p);
    }
    return res;
  });
  out.detayMob = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 390, 844, async (p) => {
    const res: Record<string, unknown> = { base: { page: await p.evaluate(PAGE_INFO) } };
    for (const tab of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      const l = p.getByRole('tab', { name: tab }); if (await l.count() === 0) continue;
      await l.first().click(); await p.waitForTimeout(450);
      res[tab] = { page: await p.evaluate(PAGE_INFO), cards: await p.evaluate(CARDS_INFO), tables: await p.evaluate(TABLE_INFO) };
    }
    return res;
  });

  out.yeniDesk = await withPage(browser, '/ihracat/sevkiyatlar/yeni', 1440, 900, async (p) => ({
    ...(await snap(p)),
    fields: await p.evaluate(`(() => { ${HELPERS}
      const els = Array.from(document.querySelectorAll('input,textarea,[data-slot=select-trigger],[role=combobox],button[type=submit],form > div, form section')).filter(vis);
      return els.map(el => { const r = el.getBoundingClientRect(); return { sel: el.tagName.toLowerCase()+(el.getAttribute('data-slot')?'['+el.getAttribute('data-slot')+']':''), t: (el.textContent||el.getAttribute('placeholder')||el.getAttribute('name')||'').trim().slice(0,28), x: r1(r.x), right: r1(r.right), w: r1(r.width), h: r1(r.height) }; });
    })()`),
  }));
  out.yeniMob = await withPage(browser, '/ihracat/sevkiyatlar/yeni', 390, 844, async p => ({ page: await p.evaluate(PAGE_INFO) }));

  out.belgelerDesk = await withPage(browser, '/ihracat/belgeler', 1440, 900, snap);
  out.belgelerMob = await withPage(browser, '/ihracat/belgeler', 390, 844, async p => ({ page: await p.evaluate(PAGE_INFO), cards: await p.evaluate(CARDS_INFO) }));

  out.kurlarDesk = await withPage(browser, '/ihracat/kurlar', 1440, 900, async (p) => ({
    ...(await snap(p)),
    kpi: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('[data-slot=card],[class*=kpi],[data-kpi]')).filter(vis).map(el => (el.textContent??'').replace(/\\s+/g,' ').trim().slice(0,90));
    })()`),
    axis: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('svg text,.recharts-cartesian-axis-tick text')).filter(vis).map(t => (t.textContent||'').trim()).slice(0,30);
    })()`),
  }));
  out.kurlarMob = await withPage(browser, '/ihracat/kurlar', 390, 844, async p => ({ page: await p.evaluate(PAGE_INFO), cards: await p.evaluate(CARDS_INFO) }));

  out.gtipDesk = await withPage(browser, '/ihracat/gtip', 1440, 900, snap);
  out.gtipMob = await withPage(browser, '/ihracat/gtip', 390, 844, async p => ({ page: await p.evaluate(PAGE_INFO), cards: await p.evaluate(CARDS_INFO) }));

  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r3c.json'), JSON.stringify(out, null, 1));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
