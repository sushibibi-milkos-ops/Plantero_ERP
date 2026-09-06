/**
 * Tur 2 kritik ölçümü — ihracat modülü. Çıktı: artifacts/critic/probe-ihracat-r2.json
 * Kullanım: pnpm tsx scripts/probe-ihracat-r2.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = '03241adc-54f8-480a-ba87-45d5f5fe2eb0';

async function withPage<T>(browser: Browser, route: string, w: number, h: number, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: w < 500,
    hasTouch: w < 500,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route, as: 'admin' });
  const out = await fn(page);
  await ctx.close();
  return out;
}

// --- tarayıcı içi yardımcılar (string olarak enjekte edilir) ---
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
      return {
        head: (th.textContent||'').replace(/\\s+/g,' ').trim(),
        transform: getComputedStyle(th).textTransform,
        fs: getComputedStyle(th).fontSize,
        w: r1(th.getBoundingClientRect().width),
        dash: cells.filter(c => c === '\u2014' || c === '').length,
        distinct: distinct.size,
        sample: Array.from(distinct).slice(0,3),
      };
    });
    const wrap = t.parentElement;
    const heights = rows.map(r => r1(r.getBoundingClientRect().height));
    heights.sort((a,b)=>a-b);
    out.push({
      i, rows: rows.length,
      heights: heights.length ? [heights[0], heights[Math.floor(heights.length/2)], heights[heights.length-1]] : [],
      tableScrollW: t.scrollWidth, tableClientW: t.clientWidth,
      wrapScrollW: wrap ? wrap.scrollWidth : null, wrapClientW: wrap ? wrap.clientWidth : null,
      wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
      tableRight: r1(t.getBoundingClientRect().right),
      lastCellRight: rows[0] && rows[0].lastElementChild ? r1(rows[0].lastElementChild.getBoundingClientRect().right) : null,
      cols,
    });
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
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      scrollers.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.'+el.className.split(/\\s+/).slice(0,3).join('.') : ''), sw: el.scrollWidth, cw: el.clientWidth, scrollLeft: el.scrollLeft, text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) });
    }
  });
  const touch = [];
  document.querySelectorAll('button,a,input,select,textarea,[role=button],[role=tab],[data-slot=select-trigger]').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) touch.push({ sel: el.tagName.toLowerCase()+(el.getAttribute('data-slot')?'[data-slot='+el.getAttribute('data-slot')+']':''), t: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,28), w: r1(r.width), h: r1(r.height) });
  });
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowX: de.scrollWidth > de.clientWidth, scrollers, touchBelow44: touch.slice(0,25), touchCount: touch.length };
})()`;

const CARDS_INFO = `(() => {
  ${HELPERS}
  const lists = [];
  document.querySelectorAll('ul').forEach(ul => {
    const lis = Array.from(ul.children).filter(el => el.tagName === 'LI' && vis(el));
    if (lis.length < 2) return;
    const hs = lis.map(li => r1(li.getBoundingClientRect().height)).sort((a,b)=>a-b);
    lists.push({
      count: lis.length,
      heights: [hs[0], hs[Math.floor(hs.length/2)], hs[hs.length-1]],
      samples: lis.slice(0,3).map(li => (li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90)),
      rawHtml: (lis[0] ? lis[0].innerHTML : '').slice(0, 500),
    });
  });
  return lists;
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) /ihracat/sevkiyatlar
  out.listDesk = await withPage(browser, '/ihracat/sevkiyatlar', 1440, 900, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    tables: await p.evaluate(TABLE_INFO),
    kpi: await p.evaluate(`(() => { ${HELPERS}
      const nums = Array.from(document.querySelectorAll('*')).filter(el => vis(el) && /^[\\d.,₺€%]+$/.test((el.textContent??'').trim()) && el.children.length===0);
      return nums.slice(0,8).map(el => ({ t: el.textContent.trim(), fs: getComputedStyle(el).fontSize, fvn: getComputedStyle(el).fontVariantNumeric, color: getComputedStyle(el).color }));
    })()`),
  }));
  out.listMob = await withPage(browser, '/ihracat/sevkiyatlar', 390, 844, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    cards: await p.evaluate(CARDS_INFO),
  }));

  // 2) detay — 4 sekme
  out.detayDesk = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 1440, 900, async (p) => {
    const res: Record<string, unknown> = { page: await p.evaluate(PAGE_INFO) };
    for (const tab of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      await p.getByRole('tab', { name: tab }).click();
      await p.waitForTimeout(400);
      res[tab] = { tables: await p.evaluate(TABLE_INFO), page: await p.evaluate(PAGE_INFO) };
    }
    return res;
  });
  out.detayMob = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 390, 844, async (p) => {
    const res: Record<string, unknown> = { page: await p.evaluate(PAGE_INFO) };
    for (const tab of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
      await p.getByRole('tab', { name: tab }).click();
      await p.waitForTimeout(400);
      res[tab] = { tables: await p.evaluate(TABLE_INFO), cards: await p.evaluate(CARDS_INFO), page: await p.evaluate(PAGE_INFO) };
    }
    return res;
  });

  // 3) yeni
  out.yeniDesk = await withPage(browser, '/ihracat/sevkiyatlar/yeni', 1440, 900, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    fields: await p.evaluate(`(() => { ${HELPERS}
      const els = Array.from(document.querySelectorAll('input,textarea,[data-slot=select-trigger],[role=combobox],button[type=submit]')).filter(vis);
      return els.map(el => { const r = el.getBoundingClientRect(); return { sel: el.tagName.toLowerCase()+(el.getAttribute('data-slot')?'['+el.getAttribute('data-slot')+']':''), t: (el.textContent||el.getAttribute('placeholder')||el.getAttribute('name')||'').trim().slice(0,28), x: r1(r.x), right: r1(r.right), w: r1(r.width), h: r1(r.height) }; });
    })()`),
  }));
  out.yeniMob = await withPage(browser, '/ihracat/sevkiyatlar/yeni', 390, 844, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
  }));

  // 4) belgeler
  out.belgelerDesk = await withPage(browser, '/ihracat/belgeler', 1440, 900, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    tables: await p.evaluate(TABLE_INFO),
  }));
  out.belgelerMob = await withPage(browser, '/ihracat/belgeler', 390, 844, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    cards: await p.evaluate(CARDS_INFO),
  }));

  // 5) kurlar
  out.kurlarDesk = await withPage(browser, '/ihracat/kurlar', 1440, 900, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    tables: await p.evaluate(TABLE_INFO),
    kpiTexts: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('[data-slot=card],[class*=kpi]')).filter(vis).map(el => (el.textContent??'').replace(/\\s+/g,' ').trim().slice(0,70));
    })()`),
  }));
  out.kurlarMob = await withPage(browser, '/ihracat/kurlar', 390, 844, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    cards: await p.evaluate(CARDS_INFO),
  }));

  // 6) gtip
  out.gtipDesk = await withPage(browser, '/ihracat/gtip', 1440, 900, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    tables: await p.evaluate(TABLE_INFO),
  }));
  out.gtipMob = await withPage(browser, '/ihracat/gtip', 390, 844, async (p) => ({
    page: await p.evaluate(PAGE_INFO),
    cards: await p.evaluate(CARDS_INFO),
  }));

  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r2.json'), JSON.stringify(out, null, 1));
  console.log('ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
